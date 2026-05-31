import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth";
import { KES } from "@/lib/settings";
import { statusLabel, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/orders/")({ component: OrdersPage });

function OrdersPage() {
  const { user } = useAuth();
  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, restaurants(name)").eq("customer_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-2xl font-bold">My orders</h1>
        <div className="mt-6 space-y-3">
          {orders.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No orders yet.</p>}
          {orders.map((o: any) => (
            <Link key={o.id} to="/orders/$id" params={{ id: o.id }} className="block rounded-xl border bg-card p-4 hover:border-primary/40">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{o.restaurants?.name}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(o.created_at)} · #{String(o.id).slice(0, 8)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{KES(o.total_amount)}</div>
                  <div className="text-xs text-primary">{statusLabel[o.status]}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
