# Kisii Eats — Major Feature Expansion

This is a large multi-part request. I'll break it into focused work-streams and ship them in order.

## 1. GPS & Location (Customer side)
- Auto-detect customer location via browser `navigator.geolocation` on home page and checkout.
- Reverse-geocode coordinates to a human-readable location name using **Google Maps Platform** (connector — recommend enabling).
- Compute distance (haversine) between customer and each restaurant; show "X.X km away" on restaurant cards and detail pages.
- Sort restaurants by proximity.
- Persist last-known location on user profile (`lat`, `lng`, `location_name` — new columns on `users`).

## 2. Restaurant Onboarding — AI Menu OCR
- New step in restaurant onboarding: upload a photo of physical menu.
- Send image to **Lovable AI Gateway** (`google/gemini-2.5-flash` — vision capable) with a structured-output prompt to extract `{category, name, description, price}[]`.
- Show extracted items in an editable review table; restaurant tweaks → submits → bulk insert into `menu_categories` + `menu_items`.
- Storage bucket `menu-uploads` (private) for source images.

## 3. Rider Onboarding — Full-Body Photo
- New required field in rider application: full-body photo (no glasses, no face covering — instructions shown).
- Upload to `rider-photos` storage bucket.
- New column `rider_profiles.full_body_photo_url`.
- Block submission until photo + ID doc uploaded.

## 4. Pending Verification Gate
- Restaurant + rider dashboards already show "awaiting approval" when status ≠ active/approved — extend this:
  - Block ALL functionality until approved (cannot toggle open, cannot add menu, etc.) — currently partially enforced.
  - Show clear "Under review by admin" state.

## 5. Admin Review Screens
- Restaurant review modal: shows everything (owner name, phone, address, location pin on map, all submitted docs, AI-extracted menu preview).
- Rider review modal: shows full-body photo, ID number, ID doc, vehicle plate, phone.
- Approve / Reject (with reason) actions.

## 6. Rider Live Tracking
- Riders' browser pushes `current_lat/current_lng` every 15s to `rider_profiles` while online (already columns exist).
- Admin dashboard map showing all online riders + all active restaurants as pins (Google Maps JS API).
- Click pin → see rider/restaurant detail + active orders.

## 7. Admin Order Detail View
For each order show:
- Customer name + phone + delivery address + delivery pin on map
- Restaurant name + location
- Rider name + phone + current location (live)
- Payment %: 30 / 50 / 100 (already in `payment_option`)
- Timeline: order placed at, restaurant confirmed at, rider accepted at, picked up at, delivered at
- Status flow visual

## 8. Map Component
- Reusable `<MiniMap>` and `<TrackingMap>` using Google Maps JS API + browser key from connector.

---

## Technical changes summary

**Migrations:**
- `users`: add `last_lat numeric`, `last_lng numeric`, `last_location_name text`
- `rider_profiles`: add `full_body_photo_url text`, `rejection_reason text`
- `restaurants`: add `rejection_reason text`
- Storage buckets: `rider-photos` (private), `menu-uploads` (private), `restaurant-docs` (private)
- RLS policies for each bucket

**Server functions (`createServerFn`):**
- `extractMenuFromImage` — calls Lovable AI Gateway with image, returns structured menu
- `reverseGeocode` — calls Google Maps via connector gateway
- `updateRiderLocation` — throttled location ping

**New components:**
- `MapView` (Google Maps wrapper)
- `LocationPicker` (geolocation + reverse geocode)
- `AdminOrderDetail`, `AdminRestaurantReview`, `AdminRiderReview` modals
- `MenuOCRReview` (editable extracted table)

**Required setup:**
1. Enable **Google Maps Platform** connector (for geocoding + maps)
2. Lovable AI Gateway is already available (`LOVABLE_API_KEY` is set)

---

## Suggested build order (I'll ship in 3 batches)

**Batch A (foundation):** migrations + storage buckets + map component + customer GPS / distance
**Batch B (onboarding):** rider photo upload + AI menu OCR + verification gate
**Batch C (admin):** rich review modals + live rider tracking + detailed order view

Given the scope, batch A will take one round, B and C each their own. After you approve I'll start with Batch A and request the Google Maps connector connection.
