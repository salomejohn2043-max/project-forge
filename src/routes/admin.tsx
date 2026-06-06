import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KES } from "@/lib/settings";
import { statusLabel } from "@/lib/format";
import { clearSettingsCache } from "@/lib/settings";
import { useState } from "react";
import { RiderLiveMap } from "@/components/admin/rider-live-map";
import { OrderDetailModal } from "@/components/admin/order-detail-modal";

export const Route = createFileRoute("/admin")({
  component: () => <RequireRole roles={["admin"]}><AdminDashboard /></RequireRole>,
});

function AdminDashboard() {
  const qc = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orders, users, restaurants, riders] = await Promise.all([
        supabase.from("orders").select("total_amount,markup_amount,restaurant_commission,rider_commission,status"),
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id,status"),
        supabase.from("rider_profiles").select("id,status"),
      ]);
      const ords = orders.data ?? [];
      const revenue = ords.reduce((s: number, o: any) => s + Number(o.markup_amount || 0) + Number(o.restaurant_commission || 0) + Number(o.rider_commission || 0), 0);
      return {
        orderCount: ords.length,
        revenue,
        users: users.count ?? 0,
        restaurants: restaurants.data?.length ?? 0,
        pendingRestaurants: restaurants.data?.filter((r: any) => r.status === "pending").length ?? 0,
        riders: riders.data?.length ?? 0,
        pendingRiders: riders.data?.filter((r: any) => r.status === "pending").length ?? 0,
      };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto space-y-6 p-4 md:p-8">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total Orders" value={stats?.orderCount ?? 0} />
          <Stat label="Platform Revenue" value={KES(stats?.revenue ?? 0)} />
          <Stat label="Users" value={stats?.users ?? 0} />
          <Stat label="Restaurants" value={`${stats?.restaurants ?? 0} (${stats?.pendingRestaurants ?? 0} pending)`} />
        </div>

        <Tabs defaultValue="restaurants" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
            <TabsTrigger value="riders">Riders</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="restaurants">
            <RestaurantsTab onChange={() => qc.invalidateQueries({ queryKey: ["admin-stats"] })} />
          </TabsContent>
          <TabsContent value="riders">
            <RidersTab onChange={() => qc.invalidateQueries({ queryKey: ["admin-stats"] })} />
          </TabsContent>
          <TabsContent value="orders">
            <OrdersTab onSelectOrder={(id) => {
              setSelectedOrderId(id);
              setOrderModalOpen(true);
            }} />
          </TabsContent>
          <TabsContent value="map">
            <RiderLiveMap height="h-96" />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>

      <OrderDetailModal
        orderId={selectedOrderId}
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}

function RestaurantsTab({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => (await supabase.from("restaurants").select("*, users!restaurants_owner_id_fkey(full_name,email)").order("status", { ascending: true }).order("created_at", { ascending: false })).data ?? [],
  });
  const setStatus = async (id: string, status: string) => {
    await supabase.from("restaurants").update({ status: status as any }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-restaurants"] }); onChange();
    toast.success(`Status: ${status}`);
  };
  
  // Separate pending from approved/suspended
  const pending = data.filter((r: any) => r.status === "pending");
  const approved = data.filter((r: any) => r.status === "active");
  const suspended = data.filter((r: any) => r.status === "suspended");

  const renderRestaurants = (restaurants: any[], title: string) => (
    <>
      {restaurants.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-sm text-muted-foreground">{title} ({restaurants.length})</h3>
          <div className="space-y-3">
            {restaurants.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div>
                  <div className="font-semibold">{r.name} <Badge variant="secondary" className="ml-2">{r.status}</Badge></div>
                  <div className="text-xs text-muted-foreground">{r.users?.full_name} · {r.phone} · {r.address}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <MenuOCRUpload restaurantId={r.id} restaurantName={r.name} onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-restaurants"] })} />
                  {r.status !== "active" && <Button size="sm" onClick={() => setStatus(r.id, "active")} className="gap-1"><Check className="h-4 w-4" />Approve</Button>}
                  {r.status !== "suspended" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "suspended")} className="gap-1"><X className="h-4 w-4" />Suspend</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {renderRestaurants(pending, "Pending Approval")}
      {renderRestaurants(approved, "Active")}
      {renderRestaurants(suspended, "Suspended")}
    </div>
  );
}

function RidersTab({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-riders"],
    queryFn: async () => (await supabase.from("rider_profiles").select("*, users(full_name,email,phone)").order("created_at", { ascending: false })).data ?? [],
  });
  const setStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "approved") patch.approved_at = new Date().toISOString();
    await supabase.from("rider_profiles").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-riders"] }); onChange();
  };
  return (
    <div className="space-y-2">
      {data.map((r: any) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <div className="font-semibold">{r.users?.full_name} <Badge variant="secondary" className="ml-2">{r.status}</Badge></div>
            <div className="text-xs text-muted-foreground">{r.vehicle_type} · {r.vehicle_plate} · ID {r.id_number} · {r.users?.phone}</div>
          </div>
          <div className="flex gap-2">
            {r.status !== "approved" && <Button size="sm" onClick={() => setStatus(r.id, "approved")} className="gap-1"><Check className="h-4 w-4" />Approve</Button>}
            {r.status !== "suspended" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "suspended")}>Suspend</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrdersTab({ onSelectOrder }: { onSelectOrder: (id: string) => void }) {
  const { data = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => (await supabase.from("orders").select("*, restaurants(name), users!orders_customer_id_fkey(full_name), rider_profiles(users(full_name))").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Restaurant</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Action</th></tr>
        </thead>
        <tbody>
          {data.map((o: any) => (
            <tr key={o.id} className="border-t">
              <td className="p-3 font-mono">#{String(o.id).slice(0, 8)}</td>
              <td className="p-3">{o.users?.full_name}</td>
              <td className="p-3">{o.restaurants?.name}</td>
              <td className="p-3">{KES(Number(o.total_amount))}</td>
              <td className="p-3"><Badge variant="secondary">{statusLabel[o.status]}</Badge></td>
              <td className="p-3">
                <Button size="sm" variant="ghost" onClick={() => onSelectOrder(o.id)} className="gap-1">
                  <Eye className="h-4 w-4" /> View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await supabase.from("users").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const setRole = async (id: string, role: string) => {
    await supabase.from("users").update({ role: role as any }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated");
  };
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th><th className="p-3">Role</th><th className="p-3">Action</th></tr></thead>
        <tbody>
          {data.map((u: any) => (
            <tr key={u.id} className="border-t">
              <td className="p-3">{u.full_name}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3">{u.phone}</td>
              <td className="p-3"><Badge variant="secondary">{u.role}</Badge></td>
              <td className="p-3">
                <select className="rounded border bg-background p-1 text-xs" value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                  <option value="customer">customer</option>
                  <option value="rider">rider</option>
                  <option value="restaurant_admin">restaurant_admin</option>
                  <option value="admin">admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => (await supabase.from("platform_settings").select("*").order("key")).data ?? [],
  });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const save = async (key: string) => {
    if (edits[key] === undefined) return;
    await supabase.from("platform_settings").update({ value: edits[key] }).eq("key", key);
    clearSettingsCache();
    qc.invalidateQueries({ queryKey: ["platform-settings"] });
    setEdits((p) => { const n = { ...p }; delete n[key]; return n; });
    toast.success("Saved");
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((s: any) => (
        <div key={s.id} className="rounded-xl border bg-card p-4">
          <Label className="text-xs uppercase text-muted-foreground">{s.key}</Label>
          {s.description && <p className="mb-2 text-xs text-muted-foreground">{s.description}</p>}
          <div className="flex gap-2">
            <Input value={edits[s.key] ?? s.value} onChange={(e) => setEdits((p) => ({ ...p, [s.key]: e.target.value }))} />
            <Button onClick={() => save(s.key)} disabled={edits[s.key] === undefined || edits[s.key] === s.value}>Save</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
