import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function genCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

async function loadGroupSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_settings").select("key,value");
  const m: Record<string, string> = {};
  (data ?? []).forEach((r: any) => (m[r.key] = r.value));
  const n = (k: string, d: number) => (m[k] ? Number(m[k]) : d);
  return {
    disc3: n("group_delivery_discount_3", 20),
    disc4: n("group_delivery_discount_4", 30),
    disc5: n("group_delivery_discount_5", 40),
    min: n("group_min_members", 3),
    max: n("group_max_members", 5),
    joinMin: n("group_join_window_minutes", 15),
    payMin: n("group_payment_window_minutes", 10),
    decisionMin: n("group_creator_decision_minutes", 5),
    deliveryPerKm: n("delivery_fee_per_km", 30),
    minDelivery: n("min_delivery_fee", 50),
  };
}

// ---------- createGroupOrder ----------
export const createGroupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      restaurant_id: z.string().uuid(),
      delivery_address: z.string().min(3).max(500),
      delivery_lat: z.number().nullable().optional(),
      delivery_lng: z.number().nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await loadGroupSettings();

    // Block if user is already in another open/locked group
    const { data: existing } = await supabaseAdmin
      .from("group_order_members")
      .select("group_order_id, group_orders!inner(status)")
      .eq("user_id", userId)
      .is("removed_at", null);
    if ((existing ?? []).some((r: any) => ["open", "locked", "paying", "awaiting_creator"].includes(r.group_orders?.status))) {
      throw new Error("You're already in an active group order.");
    }

    // Compute base delivery fee
    const { data: rest } = await supabaseAdmin
      .from("restaurants").select("lat,lng,status,is_open").eq("id", data.restaurant_id).single();
    if (!rest || rest.status !== "active" || !rest.is_open) throw new Error("Restaurant not available.");
    let km = 0;
    if (rest.lat != null && rest.lng != null && data.delivery_lat != null && data.delivery_lng != null) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(data.delivery_lat - Number(rest.lat));
      const dLng = toRad(data.delivery_lng - Number(rest.lng));
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(rest.lat))) * Math.cos(toRad(data.delivery_lat)) * Math.sin(dLng / 2) ** 2;
      km = 2 * R * Math.asin(Math.sqrt(a));
    }
    const baseFee = Math.max(s.minDelivery, Math.round(km * s.deliveryPerKm));

    // Insert group + creator member, retry on code collision
    let code = "";
    let groupId = "";
    for (let tries = 0; tries < 5; tries++) {
      code = genCode();
      const { data: g, error } = await supabaseAdmin
        .from("group_orders")
        .insert({
          restaurant_id: data.restaurant_id, creator_id: userId, invite_code: code,
          delivery_address: data.delivery_address,
          delivery_lat: data.delivery_lat ?? null, delivery_lng: data.delivery_lng ?? null,
          delivery_distance_km: km, base_delivery_fee: baseFee,
          lock_at: new Date(Date.now() + s.joinMin * 60_000).toISOString(),
        })
        .select("id").single();
      if (!error && g) { groupId = g.id; break; }
      if (error && !String(error.message).toLowerCase().includes("invite_code")) throw new Error(error.message);
    }
    if (!groupId) throw new Error("Couldn't generate invite code; try again.");

    await supabaseAdmin.from("group_order_members").insert({
      group_order_id: groupId, user_id: userId, is_creator: true,
    });

    return { id: groupId, invite_code: code };
  });

// ---------- joinGroupOrder ----------
export const joinGroupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invite_code: z.string().length(6) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await loadGroupSettings();

    const { data: g } = await supabaseAdmin
      .from("group_orders").select("*").eq("invite_code", data.invite_code.toUpperCase()).maybeSingle();
    if (!g) throw new Error("Invalid invite code.");
    if (g.status !== "open") throw new Error("This group is no longer open.");

    const { count } = await supabaseAdmin
      .from("group_order_members").select("*", { count: "exact", head: true })
      .eq("group_order_id", g.id).is("removed_at", null);
    if ((count ?? 0) >= s.max) throw new Error("Group is full.");

    // Block multi-active
    const { data: other } = await supabaseAdmin
      .from("group_order_members")
      .select("group_orders!inner(status,id)")
      .eq("user_id", userId).is("removed_at", null);
    if ((other ?? []).some((r: any) =>
      r.group_orders?.id !== g.id &&
      ["open","locked","paying","awaiting_creator"].includes(r.group_orders?.status))) {
      throw new Error("You're already in another active group order.");
    }

    const { error } = await supabaseAdmin
      .from("group_order_members").insert({ group_order_id: g.id, user_id: userId })
      .select("id").single();
    if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);

    return { id: g.id, restaurant_id: g.restaurant_id };
  });

// ---------- lockGroupOrder (creator) ----------
export const lockGroupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ group_order_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return lockGroupInternal(supabaseAdmin, data.group_order_id, userId);
  });

async function lockGroupInternal(admin: any, groupId: string, requesterId: string | null) {
  const s = await loadGroupSettings();
  const { data: g } = await admin.from("group_orders").select("*").eq("id", groupId).single();
  if (!g) throw new Error("Group not found.");
  if (requesterId && g.creator_id !== requesterId) throw new Error("Only the creator can lock.");
  if (g.status !== "open") return { ok: true };

  const { data: members } = await admin
    .from("group_order_members").select("id,user_id,is_creator").eq("group_order_id", groupId).is("removed_at", null);
  if ((members?.length ?? 0) < s.min) throw new Error(`Need at least ${s.min} members.`);

  const { data: items } = await admin.from("group_order_items").select("member_id,subtotal").eq("group_order_id", groupId);
  const subByMember: Record<string, number> = {};
  (items ?? []).forEach((it: any) => {
    subByMember[it.member_id] = (subByMember[it.member_id] ?? 0) + Number(it.subtotal);
  });
  for (const m of members!) {
    if (!subByMember[m.id]) throw new Error("Every member must add at least one item before locking.");
  }

  const n = members!.length;
  const discPct = n >= 5 ? s.disc5 : n >= 4 ? s.disc4 : s.disc3;
  const discountedFee = Math.round(Number(g.base_delivery_fee) * (1 - discPct / 100));
  const share = Math.round(discountedFee / n);

  for (const m of members!) {
    const sub = Math.round(subByMember[m.id]);
    const total = sub + share;
    await admin.from("group_order_members").update({
      subtotal: sub, delivery_share: share, total_due: total, amount_remaining: total,
    }).eq("id", m.id);
  }

  await admin.from("group_orders").update({
    status: "locked", locked_at: new Date().toISOString(),
    delivery_discount_pct: discPct, discounted_delivery_fee: discountedFee,
    payment_deadline: new Date(Date.now() + s.payMin * 60_000).toISOString(),
  }).eq("id", groupId);

  // Notify members
  await admin.from("notifications").insert(members!.map((m: any) => ({
    user_id: m.user_id, type: "order_placed", title: "Group order locked",
    body: `Pay your share within ${s.payMin} minutes to confirm the order.`,
  })));

  return { ok: true };
}

// ---------- payGroupShare (simulated M-Pesa) ----------
export const payGroupShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      member_id: z.string().uuid(),
      payment_option: z.union([z.literal(30), z.literal(50), z.literal(100)]),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin.from("group_order_members").select("*").eq("id", data.member_id).single();
    if (!m || m.user_id !== userId) throw new Error("Not your share.");
    if (m.payment_status === "paid") return { ok: true };

    const total = Number(m.total_due);
    const upfront = Math.round(total * (data.payment_option / 100));
    const remaining = total - upfront;

    await supabaseAdmin.from("group_order_members").update({
      payment_option: data.payment_option,
      amount_paid_upfront: upfront, amount_remaining: remaining,
      payment_status: "paid", paid_at: new Date().toISOString(),
    }).eq("id", data.member_id);

    await supabaseAdmin.from("transactions").insert({
      user_id: userId, type: "payment", amount: upfront,
      mpesa_reference: `GRP-${data.member_id.slice(0,8)}-${Date.now()}`,
      is_confirmed: true, confirmed_at: new Date().toISOString(),
      description: `Group order upfront ${data.payment_option}%`,
    });

    // Try to confirm if everyone paid
    await maybeConfirmGroup(supabaseAdmin, m.group_order_id);

    return { ok: true };
  });

async function maybeConfirmGroup(admin: any, groupId: string) {
  const { data: g } = await admin.from("group_orders").select("*").eq("id", groupId).single();
  if (!g || !["locked","paying","awaiting_creator"].includes(g.status)) return;
  const { data: members } = await admin
    .from("group_order_members").select("*").eq("group_order_id", groupId).is("removed_at", null);
  if (!members?.length) return;
  if (members.some((m: any) => m.payment_status !== "paid")) return;

  // All paid → create combined order
  const { data: items } = await admin.from("group_order_items").select("*").eq("group_order_id", groupId);
  const subtotal = members.reduce((s: number, m: any) => s + Number(m.subtotal), 0);
  const totalUpfront = members.reduce((s: number, m: any) => s + Number(m.amount_paid_upfront), 0);
  const totalAmt = subtotal + Number(g.discounted_delivery_fee);
  const remaining = totalAmt - totalUpfront;

  const { data: order, error: oerr } = await admin.from("orders").insert({
    customer_id: g.creator_id, restaurant_id: g.restaurant_id,
    status: "pending",
    delivery_address: g.delivery_address, delivery_lat: g.delivery_lat, delivery_lng: g.delivery_lng,
    delivery_distance_km: g.delivery_distance_km, delivery_fee: g.discounted_delivery_fee,
    subtotal, total_amount: totalAmt,
    payment_option: "100", payment_status: remaining > 0 ? "partial" : "paid",
    amount_paid_upfront: totalUpfront, amount_remaining: remaining,
  }).select("id").single();
  if (oerr) throw new Error(oerr.message);

  await admin.from("order_items").insert(items!.map((it: any) => ({
    order_id: order.id, menu_item_id: it.menu_item_id, name: it.name,
    base_price: it.base_price, marked_up_price: it.marked_up_price,
    quantity: it.quantity, subtotal: it.subtotal,
  })));

  await admin.from("group_orders").update({
    status: "confirmed", final_order_id: order.id,
  }).eq("id", groupId);

  await admin.from("notifications").insert(members.map((m: any) => ({
    user_id: m.user_id, type: "order_placed", title: "Group order confirmed!",
    body: "Your group order is on its way to the restaurant.", order_id: order.id,
  })));
}

// ---------- Cron tick (callable from server route) ----------
export async function reconcileGroupOrdersTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const s = await loadGroupSettings();
  const now = new Date();

  // 1) Auto-cancel open groups past lock_at with < min members
  // 2) Auto-lock open groups past lock_at with >= min members
  const { data: openExpired } = await supabaseAdmin
    .from("group_orders").select("id").eq("status", "open").lt("lock_at", now.toISOString());
  for (const g of openExpired ?? []) {
    const { count } = await supabaseAdmin
      .from("group_order_members").select("*", { count: "exact", head: true })
      .eq("group_order_id", g.id).is("removed_at", null);
    if ((count ?? 0) >= s.min) {
      try { await lockGroupInternal(supabaseAdmin, g.id, null); } catch { /* skip */ }
    } else {
      await supabaseAdmin.from("group_orders").update({
        status: "cancelled", cancelled_at: now.toISOString(),
        cancellation_reason: "Joining window expired with too few members.",
      }).eq("id", g.id);
    }
  }

  // 3) Drop unpaid members past payment_deadline
  const { data: lockedExpired } = await supabaseAdmin
    .from("group_orders").select("*").in("status", ["locked","paying"])
    .lt("payment_deadline", now.toISOString());
  for (const g of lockedExpired ?? []) {
    const { data: members } = await supabaseAdmin
      .from("group_order_members").select("*").eq("group_order_id", g.id).is("removed_at", null);
    const unpaid = (members ?? []).filter((m: any) => m.payment_status !== "paid");
    for (const u of unpaid) {
      await supabaseAdmin.from("group_order_members").update({
        removed_at: now.toISOString(), drop_reason: "Did not pay in time", payment_status: "dropped",
      }).eq("id", u.id);
    }
    const paid = (members ?? []).filter((m: any) => m.payment_status === "paid");
    if (paid.length >= s.min) {
      // proceed with paid only — confirm
      await maybeConfirmGroup(supabaseAdmin, g.id);
    } else if (paid.length === 0) {
      await supabaseAdmin.from("group_orders").update({
        status: "cancelled", cancelled_at: now.toISOString(),
        cancellation_reason: "No one paid in time.",
      }).eq("id", g.id);
    } else {
      // Below min, give creator decision window
      await supabaseAdmin.from("group_orders").update({
        status: "awaiting_creator",
        creator_decision_deadline: new Date(Date.now() + s.decisionMin * 60_000).toISOString(),
      }).eq("id", g.id);
      await supabaseAdmin.from("notifications").insert({
        user_id: g.creator_id, type: "order_placed", title: "Group below minimum",
        body: `Only ${paid.length} member(s) paid. Decide to proceed or cancel within ${s.decisionMin} minutes.`,
      });
    }
  }

  // 4) Awaiting-creator past deadline → cancel + refund
  const { data: awaitingExpired } = await supabaseAdmin
    .from("group_orders").select("*").eq("status", "awaiting_creator")
    .lt("creator_decision_deadline", now.toISOString());
  for (const g of awaitingExpired ?? []) {
    await refundAndCancelGroup(supabaseAdmin, g.id, "Creator decision window expired.");
  }

  return { processed: (openExpired?.length ?? 0) + (lockedExpired?.length ?? 0) + (awaitingExpired?.length ?? 0) };
}

async function refundAndCancelGroup(admin: any, groupId: string, reason: string) {
  const { data: members } = await admin
    .from("group_order_members").select("*").eq("group_order_id", groupId);
  for (const m of members ?? []) {
    if (Number(m.amount_paid_upfront) > 0) {
      const { data: u } = await admin.from("users").select("wallet_balance").eq("id", m.user_id).single();
      await admin.from("users").update({
        wallet_balance: Number(u?.wallet_balance ?? 0) + Number(m.amount_paid_upfront),
      }).eq("id", m.user_id);
      await admin.from("transactions").insert({
        user_id: m.user_id, type: "refund", amount: m.amount_paid_upfront,
        description: `Group order refund: ${reason}`,
        is_confirmed: true, confirmed_at: new Date().toISOString(),
      });
      await admin.from("notifications").insert({
        user_id: m.user_id, type: "order_placed", title: "Group order refunded",
        body: `KES ${m.amount_paid_upfront} returned to your wallet. ${reason}`,
      });
    }
  }
  await admin.from("group_orders").update({
    status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason,
  }).eq("id", groupId);
}
