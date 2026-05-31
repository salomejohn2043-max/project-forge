import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { getSettings, KES } from "@/lib/settings";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

function CheckoutPage() {
  const cart = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [distanceKm, setDistanceKm] = useState(3);
  const [paymentOption, setPaymentOption] = useState<"30" | "50" | "100">("100");
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ markup_percentage: 10, restaurant_commission_percentage: 5, rider_commission_percentage: 5, delivery_fee_per_km: 30, min_delivery_fee: 50 });

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

  const placeOrder = async () => {
    if (!address.trim()) { toast.error("Enter delivery address"); return; }
    if (!cart.restaurant_id) return;

    setBusy(true);
    try {
      // financial breakdown
      const baseSubtotal = cart.items.reduce((s, i) => s + i.base_price * i.quantity, 0);
      const markupAmount = Math.round(subtotal - baseSubtotal);
      const restaurantCommission = Math.round(baseSubtotal * settings.restaurant_commission_percentage / 100);
      const riderCommission = Math.round(deliveryFee * settings.rider_commission_percentage / 100);
      const restaurantPayout = baseSubtotal - restaurantCommission;
      const riderPayout = deliveryFee - riderCommission;

      const { data: order, error } = await supabase.from("orders").insert({
        customer_id: user.id,
        restaurant_id: cart.restaurant_id,
        delivery_address: address,
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

      await supabase.from("transactions").insert({
        order_id: order.id, user_id: user.id, type: "payment",
        amount: payNow, mpesa_phone: profile.phone,
        description: `M-Pesa STK Push — ${paymentOption}% upfront`,
        is_confirmed: true, confirmed_at: new Date().toISOString(),
        mpesa_reference: `MPK${Date.now()}`,
      });

      toast.success(`M-Pesa payment of ${KES(payNow)} confirmed!`);
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
            <h2 className="mb-3 font-semibold">Delivery</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="addr">Address</Label>
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Daraja Mbili, opposite KCB" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dist">Distance from restaurant (km)</Label>
                <Input id="dist" type="number" min={1} step={0.5} value={distanceKm} onChange={(e) => setDistanceKm(Number(e.target.value) || 1)} />
                <p className="text-xs text-muted-foreground">Fee = max({KES(settings.min_delivery_fee)}, {KES(settings.delivery_fee_per_km)}/km × distance)</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">Payment</h2>
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
