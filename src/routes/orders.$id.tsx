import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { KES } from "@/lib/settings";
import { statusLabel } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({ component: OrderTrackPage });

const STEPS = ["pending", "confirmed", "preparing", "ready", "picked_up", "in_transit", "delivered"] as const;

function OrderTrackPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, restaurants(name,phone), users!orders_rider_id_fkey(full_name,phone)").eq("id", id).single();
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("order_items").select("*").eq("order_id", id);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["order", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const confirmDelivery = async () => {
    const { error } = await supabase.from("orders").update({
      customer_confirmed_delivery: true,
      customer_confirmed_at: new Date().toISOString(),
      status: "delivered",
    }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Delivery confirmed. Enjoy your meal!");
  };

  if (!order) return <div className="min-h-screen bg-background"><AppHeader /><div className="p-8">Loading…</div></div>;

  const stepIndex = STEPS.indexOf(order.status as any);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div>
          <Link to="/orders" className="text-sm text-muted-foreground hover:underline">← All orders</Link>
          <h1 className="mt-2 text-2xl font-bold">Order #{String(order.id).slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">{order.restaurants?.name}</p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm font-medium text-muted-foreground">Status</div>
          <div className="mt-1 text-xl font-semibold text-primary">{statusLabel[order.status]}</div>

          <ol className="mt-5 space-y-2">
            {STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-sm ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {i < stepIndex ? <Check className="h-3 w-3" /> : i === stepIndex ? <Clock className="h-3 w-3" /> : i + 1}
                </span>
                {statusLabel[s]}
              </li>
            ))}
          </ol>

          {order.status === "delivered" && !order.customer_confirmed_delivery && (
            <Button onClick={confirmDelivery} className="mt-5 w-full">Confirm I received my order</Button>
          )}
        </div>

        {order.rider_id && order.users && (
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-medium">Rider</div>
            <div className="mt-1">{order.users.full_name} · <a href={`tel:${order.users.phone}`} className="text-primary">{order.users.phone}</a></div>
          </div>
        )}

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Items</h2>
          <ul className="divide-y text-sm">
            {items.map((i: any) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>{i.quantity}× {i.name}</span><span>{KES(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
            <Row label="Subtotal" value={KES(order.subtotal)} />
            <Row label="Delivery" value={KES(order.delivery_fee)} />
            <Row label="Total" value={KES(order.total_amount)} bold />
            <Row label="Paid upfront" value={KES(order.amount_paid_upfront)} accent />
            {order.amount_remaining > 0 && <Row label="Due on delivery" value={KES(order.amount_remaining)} />}
          </dl>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">Delivery to</h2>
          <p className="text-sm">{order.delivery_address}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""} ${accent ? "text-primary" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>;
}
