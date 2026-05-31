import { supabase } from "@/integrations/supabase/client";

export interface PlatformSettings {
  markup_percentage: number;
  restaurant_commission_percentage: number;
  rider_commission_percentage: number;
  delivery_fee_per_km: number;
  min_delivery_fee: number;
  cancellation_refund_percentage: number;
  loyalty_points_per_order: number;
  referral_bonus_points: number;
}

const DEFAULTS: PlatformSettings = {
  markup_percentage: 10,
  restaurant_commission_percentage: 5,
  rider_commission_percentage: 5,
  delivery_fee_per_km: 30,
  min_delivery_fee: 50,
  cancellation_refund_percentage: 20,
  loyalty_points_per_order: 10,
  referral_bonus_points: 50,
};

let cache: PlatformSettings | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache) return cache;
  const { data } = await supabase.from("platform_settings").select("key,value");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r) => { map[r.key] = r.value; });
  cache = {
    markup_percentage: num(map.markup_percentage, DEFAULTS.markup_percentage),
    restaurant_commission_percentage: num(map.restaurant_commission_percentage, DEFAULTS.restaurant_commission_percentage),
    rider_commission_percentage: num(map.rider_commission_percentage, DEFAULTS.rider_commission_percentage),
    delivery_fee_per_km: num(map.delivery_fee_per_km, DEFAULTS.delivery_fee_per_km),
    min_delivery_fee: num(map.min_delivery_fee, DEFAULTS.min_delivery_fee),
    cancellation_refund_percentage: num(map.cancellation_refund_percentage, DEFAULTS.cancellation_refund_percentage),
    loyalty_points_per_order: num(map.loyalty_points_per_order, DEFAULTS.loyalty_points_per_order),
    referral_bonus_points: num(map.referral_bonus_points, DEFAULTS.referral_bonus_points),
  };
  return cache;
}

export function clearSettingsCache() { cache = null; }

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
