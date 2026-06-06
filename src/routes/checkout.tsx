import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { getSettings, KES } from "@/lib/settings";
import { LocationPicker } from "@/components/location-picker";
import { haversineKm } from "@/lib/geo";
import { initiateSmartPayPush } from "@/lib/payments/smartpay.functions";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

function CheckoutPage() {
  const cart = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const smartPay = useServerFn(initiateSmartPayPush);
  const [address, setAddress] = useState("");
  const [loc, setLoc] = useState<{ lat: number | null; lng: number | null; name: string }>({ lat: null, lng: null, name: "" });
  const [restLoc, setRestLoc] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [paymentOption, setPaymentOption] = useState<"30" | "50" | "100">("100");
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [busy, setBusy] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [settings, setSettings] = useState({ markup_percentage: 10, restaurant_commission_percentage: 5, rider_commission_percentage: 5, delivery_fee_per_km: 30, min_delivery_fee: 50 });

  useEffect(() => { if (profile?.phone && !mpesaPhone) setMpesaPhone(profile.phone); }, [profile?.phone]);

  // pull restaurant location
  useEffect(() => {
    if (!cart.restaurant_id) return;
    supabase.from("restaurants").select("lat,lng").eq("id", cart.restaurant_id).single()
      .then(({ data }) => { if (data) setRestLoc({ lat: data.lat as any, lng: data.lng as any }); });
  }, [cart.restaurant_id]);

  const distanceKm = (loc.lat != null && loc.lng != null && restLoc.lat != null && restLoc.lng != null)
    ? haversineKm({ lat: loc.lat, lng: loc.lng }, { lat: Number(restLoc.lat), lng: Number(restLoc.lng) })
    : 3;

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setDeliveryFee(Math.max(s.min_delivery_fee, Math.round(distanceKm * s.delivery_fee_per_km)));
    });
  }, []);

  useEffect(() => {
    setDeliveryFee(Math.max(settings.min_delivery_fee, Math.round(distanceKm * settings.delivery_fee_per_km)));
  }, [distanceKm, settings]);

  useEffect(() => { if (!user) navigate({ to: "/auth" }); }, [user, navigate]);
  if (!user || !profile) return null;

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container mx-auto p-8 text-center text-muted-foreground">Your cart is empty.</div>
      </div>
    );
  }

  const subtotal = cart.subtotal;
  const total = subtotal + deliveryFee;
  const payNow = Math.round((total * Number(paymentOption)) / 100);
  const payLater = total - payNow;

  const sanitizeAddress = (addr: string): string => {
    return addr.trim().slice(0, 500).replace(/[<>]/g, "");
  };

  const normalizePhone = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (/^254[17]\d{8}$/.test(digits)) return digits;
    if (/^0[17]\d{8}$/.test(digits)) return "254" + digits.slice(1);
    if (/^[17]\d{8}$/.test(digits)) return "254" + digits;
    return null;
  };

  const placeOrder = async () => {
    const trimmedAddress = sanitizeAddress(address);
    if (!trimmedAddress) { toast.error("Enter delivery address"); return; }
    if (loc.lat == null || loc.lng == null) { toast.error("Detect or set your location"); return; }
    if (!cart.restaurant_id) return;
    const normalized = normalizePhone(mpesaPhone);
    if (!normalized) { toast.error("Enter a valid M-Pesa number (e.g. 0712345678)"); return; }

    // Validate distance is reasonable (0-100 km)
    if (distanceKm < 0 || distanceKm > 100) {
      toast.error("Delivery location is too far or invalid");
      return;
    }

    setBusy(true);
    try {
      // Validate all cart items exist and are available
      const { data: menuItems } = await supabase
        .from("menu_items")
        .select("id, is_available")
        .in("id", cart.items.map((i) => i.menu_item_id));
      
      const unavailableItems = cart.items.filter(
        (cartItem) => !menuItems?.some((mi) => mi.id === cartItem.menu_item_id && mi.is_available)
      );
      
      if (unavailableItems.length > 0) {
        toast.error(`Some items are no longer available: ${unavailableItems.map((i) => i.name).join(", ")}`);
        return;
      }

      // financial breakdown — cart subtotal already includes markup
      // database trigger will validate and recompute if needed
      const baseSubtotal = cart.items.reduce((s, i) => s + i.base_price * i.quantity, 0);
      const markupAmount = Math.round(subtotal - baseSubtotal);
      const restaurantCommission = Math.round(baseSubtotal * settings.restaurant_commission_percentage / 100);
      const riderCommission = Math.round(deliveryFee * settings.rider_commission_percentage / 100);
      const restaurantPayout = baseSubtotal - restaurantCommission;
      const riderPayout = deliveryFee - riderCommission;

      const { data: order, error } = await supabase.from("orders").insert({
        customer_id: user.id,
        restaurant_id: cart.restaurant_id,
        delivery_address: trimmedAddress,
        delivery_lat: loc.lat,
        delivery_lng: loc.lng,
        delivery_distance_km: distanceKm,
        delivery_fee: deliveryFee,
        subtotal,
        total_amount: total,
        payment_option: paymentOption,
        amount_paid_upfront: payNow,
        amount_remaining: payLater,
        payment_status: payLater === 0 ? "complete" : "partial",
        markup_amount: markupAmount,
        restaurant_commission: restaurantCommission,
        rider_commission: riderCommission,
        restaurant_payout: restaurantPayout,
        rider_payout: riderPayout,
        status: "pending",
      }).select().single();

      if (error) throw error;

      const itemRows = cart.items.map((i) => ({
        order_id: order.id, menu_item_id: i.menu_item_id, name: i.name,
        base_price: i.base_price, marked_up_price: i.marked_up_price,
        quantity: i.quantity, subtotal: i.marked_up_price * i.quantity,
      }));
      await supabase.from("order_items").insert(itemRows);

      const pay = await smartPay({
        data: {
          phone: normalized,
          amount: payNow,
          accountReference: `ORDER-${order.id.slice(0, 8)}`,
          description: `Kisii Eats — ${paymentOption}% upfront`,
        },
      });

      await supabase.from("transactions").insert({
        order_id: order.id, user_id: user.id, type: "payment",
        amount: payNow, mpesa_phone: normalized,
        description: `SmartPay STK Push — ${paymentOption}% upfront`,
        is_confirmed: true, confirmed_at: new Date().toISOString(),
        mpesa_reference: pay.checkout_request_id,
      });

      toast.success(`STK push sent to ${normalized}. Check your phone to confirm ${KES(payNow)}.`);
      cart.clear();
      navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto grid max-w-5xl gap-6 p-4 md:grid-cols-[1fr_360px] md:p-8">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Checkout</h1>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">Delivery location</h2>
            <div className="space-y-3">
              <LocationPicker
                value={loc}
                onChange={(v) => { setLoc(v); if (!address) setAddress(v.name); }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="addr">Delivery notes / address</Label>
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Daraja Mbili, opposite KCB — gate 3" />
              </div>
              <div className="rounded-lg bg-muted p-3 text-xs">
                Distance from restaurant: <strong>{distanceKm.toFixed(2)} km</strong> · Delivery fee: <strong>{KES(deliveryFee)}</strong>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">Payment</h2>
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="mpesa">M-Pesa phone number</Label>
              <Input
                id="mpesa"
                type="tel"
                inputMode="tel"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="07XX XXX XXX"
              />
              <p className="text-xs text-muted-foreground">STK push will be sent to this number to confirm payment.</p>
            </div>
            <RadioGroup value={paymentOption} onValueChange={(v) => setPaymentOption(v as any)} className="space-y-2">
              {(["30", "50", "100"] as const).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <span className="flex items-center gap-3">
                    <RadioGroupItem value={opt} id={`po-${opt}`} />
                    <span>
                      <div className="font-medium">Pay {opt}% now</div>
                      <div className="text-xs text-muted-foreground">
                        {opt === "100" ? "Pay in full" : `Rider collects ${100 - Number(opt)}% on delivery`}
                      </div>
                    </span>
                  </span>
                  <span className="text-sm font-semibold">{KES(Math.round((total * Number(opt)) / 100))}</span>
                </label>
              ))}
            </RadioGroup>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">Order summary</h2>
            <ul className="divide-y text-sm">
              {cart.items.map((i) => (
                <li key={i.menu_item_id} className="flex justify-between py-2">
                  <span>{i.quantity}× {i.name}</span>
                  <span>{KES(i.marked_up_price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
              <Row label="Subtotal" value={KES(subtotal)} />
              <Row label="Delivery" value={KES(deliveryFee)} />
              <Row label="Total" value={KES(total)} bold />
              <Row label="Pay now (M-Pesa)" value={KES(payNow)} accent />
              {payLater > 0 && <Row label="Pay on delivery" value={KES(payLater)} />}
            </dl>
            <Button onClick={placeOrder} disabled={busy} className="mt-4 w-full" size="lg">
              {busy ? "Processing…" : `Pay ${KES(payNow)} via M-Pesa`}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""} ${accent ? "text-primary" : ""}`}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}
