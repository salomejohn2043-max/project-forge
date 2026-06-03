# Plan: Finish Kisii Eats + Group Orders + Scale Hardening

This is a large piece of work. I'll deliver it in 3 batches so you can review as we go.

---

## Batch A — Finish what's pending from earlier

1. **Restaurant onboarding with AI menu OCR**
   - Restaurant dashboard: "Upload menu photo" → stored in `menu-uploads` bucket → `extractMenuFromImage` server fn (Gemini 2.5 Flash vision) → returns `[{category, name, description, price}]`.
   - Editable review table (add/edit/delete rows, set image per item later) → "Save menu" bulk-inserts into `menu_categories` + `menu_items`.
   - Also: edit profile, set open/closed, upload logo/cover, set opening/closing hours, pin location on map.

2. **Admin review modals**
   - Restaurant review: owner info, phone, address, location pin on map, docs, AI-extracted menu preview → Approve / Reject (with reason).
   - Rider review: full-body photo, ID document, vehicle plate, phone → Approve / Reject (with reason).
   - Rejection sets `status='rejected'` + `rejection_reason`; user sees it in their dashboard.

3. **Admin live tracking map**
   - Map of all online riders (`rider_profiles.is_online=true`) with current lat/lng, name, current order if any.
   - Refresh every 15s via Supabase realtime on `rider_profiles`.

4. **Admin order detail view**
   - Customer name/phone + delivery pin on map.
   - Restaurant name + pin.
   - Assigned rider + current location.
   - Payment %: 30 / 50 / 100 (from `payment_option`) and amount paid / remaining.
   - Timeline: placed → confirmed by restaurant → rider accepted → picked up → delivered (with timestamps).

---

## Batch B — Group Orders (the new feature)

### Schema (new tables)
- `group_orders`
  - id, restaurant_id, creator_id, invite_code (6 chars, unique), delivery_address, delivery_lat, delivery_lng, delivery_distance_km
  - status: `open | locked | paying | confirmed | cancelled | completed`
  - lock_at (creation + 15 min), payment_deadline (lock + 10 min), locked_at, cancelled_at, cancellation_reason
  - base_delivery_fee, delivery_discount_pct, discounted_delivery_fee
  - final_order_id (set when confirmed, links to `orders`)
- `group_order_members`
  - id, group_order_id, user_id, joined_at, removed_at, is_creator
  - subtotal, delivery_share, total_due, payment_option (30/50/100), amount_paid_upfront, amount_remaining
  - payment_status: `pending | paid | failed | dropped`, paid_at
- `group_order_items`
  - id, group_order_id, member_id, menu_item_id, name, base_price, marked_up_price, quantity, subtotal

All with GRANTs, RLS:
- Creator + members can SELECT their group order and all items in it.
- Members can INSERT/UPDATE/DELETE only their own items while status='open'.
- Creator can remove members while status='open'.
- Admin: ALL.

### Platform settings rows (seed)
`group_delivery_discount_3=20`, `_4=30`, `_5=40`, `group_min_members=3`, `group_max_members=5`, `group_join_window_minutes=15`, `group_payment_window_minutes=10`.

### Server functions (`src/lib/group-orders.functions.ts`)
- `createGroupOrder({restaurant_id, delivery_address, delivery_lat, delivery_lng})` — requires verified phone; returns invite code + link.
- `joinGroupOrder({invite_code})` — validates status='open', not full, user not already in another open group, then inserts member.
- `addItemToGroup`, `updateGroupItem`, `removeGroupItem` — owner-scoped to the member row.
- `removeMember({member_id})` — creator only.
- `lockGroupOrder({group_order_id})` — creator; require ≥3 members each with ≥1 item; computes discount, splits, sets payment deadline.
- `payGroupShare({member_id, payment_option})` — records member upfront amount; simulated M-Pesa for now (existing pattern) marks `paid`.
- Background reconciliation via a server route `/api/public/group-orders/tick` (signed via cron secret) that:
  - Auto-cancels open groups past `lock_at` with <3 members.
  - Auto-locks open groups past `lock_at` with ≥3 members.
  - Drops unpaid members past `payment_deadline`; recomputes; if <3 remaining, opens 5-min creator decision window; otherwise confirms.
  - On confirm: creates a single row in `orders` with combined items in `order_items`, sets `final_order_id`.
  - On cancel after any payment: refunds paid members to `wallet_balance` and writes `transactions`.

Realtime: enable on `group_orders`, `group_order_members`, `group_order_items` so the lobby is live.

### UI
- `/restaurants/$id` → "Start group order" button (when logged in + phone verified).
- `/group/$code` — lobby route:
  - Members list w/ live status, countdown to lock, then countdown to pay.
  - Shared cart grouped by member; each member can only edit own items.
  - "Add items" opens the restaurant menu in group mode.
  - Creator: "Lock now" button (enabled at ≥3 members w/ items), "Remove member".
  - After lock: per-member payment card with 30/50/100 choice → "Pay with M-Pesa".
  - After confirm: redirects to standard order tracking using `final_order_id`.
- Menu pages in group context: "Add to group cart" instead of personal cart.
- Order history shows group orders w/ each member's own line.

### Notifications
- Member joined, lock imminent, locked, payment deadline imminent, member dropped, group cancelled, order confirmed, etc. → `notifications` table (already wired).

---

## Batch C — Scale to 500 concurrent users + E2E test

### Hardening for ~500 concurrent
- **Indexes** on hot queries: `orders(customer_id, created_at)`, `orders(rider_id, status)`, `orders(restaurant_id, status, created_at)`, `notifications(user_id, is_read, created_at)`, `group_order_members(group_order_id)`, `group_order_items(group_order_id)`, `rider_profiles(is_online, status)`, `restaurants(status, is_open)`.
- **Restaurant list query**: select only needed columns (already does), add `.limit(100)`; add pagination to admin tables.
- **Rider location pings**: throttled to 15s already; switch from per-ping `UPDATE` overhead by adding `(user_id)` PK index check; use `is_online=false` short-circuit.
- **Realtime channels**: scope subscriptions tightly (per order id / per group code) instead of whole tables; unsubscribe on unmount.
- **Cron tick**: lightweight server route called every 30s by external scheduler (we'll log the stable URL for you to wire to a free cron later); handles group-order lifecycle without N parallel timers in browsers.
- **Client caching**: use React Query staleTime (e.g. restaurants 60s, menu 5min); already have query client.
- **Payment idempotency**: dedupe `transactions` insert with `mpesa_reference` unique index.
- **Avoid N+1 in admin**: single joined query per panel.
- **RLS sanity**: all new policies use `is_admin()` security definer (no recursion).

### End-to-end test pass (manual playback I'll run from logs + read_query)
1. Customer signup → location detected → restaurants sorted by distance.
2. Restaurant signup → upload menu photo → AI extracts → review → save.
3. Admin approves restaurant + rider.
4. Customer places solo order 30% upfront → restaurant confirms dispatch → rider accepts → picks up → delivers → customer confirms → admin disburse.
5. Group order: creator + 2 invitees → lock → all pay 50% → confirmed → single delivery → confirmations → disburse w/ correct per-member loyalty.
6. Edge: 1 member doesn't pay → dropped → recompute → confirms.
7. Edge: restaurant closes mid-group → auto-cancel + refunds to wallet.
8. Admin order detail shows full timeline + map pins + payment %.

I'll report results inline (counts, sample rows, any failing step + fix).

---

## What I need from you
Just say **"go"** and I'll start with Batch A. I'll keep batches small enough to review and I won't ask further unless something is genuinely ambiguous.
