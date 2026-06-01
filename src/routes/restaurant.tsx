import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Power, ChefHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { RequireRole } from "@/components/require-role";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KES } from "@/lib/settings";
import { statusLabel } from "@/lib/format";

export const Route = createFileRoute("/restaurant")({
  component: () => (
    <RequireRole roles={["restaurant_admin", "admin"]}><RestaurantDashboard /></RequireRole>
  ),
});

const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: "picked_up",
};

function RestaurantDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: restaurant, refetch: refetchR } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
  });

  if (!restaurant) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <RegisterRestaurant ownerId={user!.id} onCreated={() => refetchR()} />
    </div>
  );

  const rid = restaurant.id;

  const { data: orders = [] } = useQuery({
    queryKey: ["r-orders", rid],
    queryFn: async () => {
      const { data } = await supabase.from("orders")
        .select("*, users!orders_customer_id_fkey(full_name,phone), order_items(*)")
        .eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`r-${rid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rid}` },
        () => qc.invalidateQueries({ queryKey: ["r-orders", rid] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rid, qc]);

  const toggleOpen = async () => {
    await supabase.from("restaurants").update({ is_open: !restaurant.is_open }).eq("id", rid);
    refetchR(); toast.success(restaurant.is_open ? "Closed" : "Now open");
  };

  const advance = async (o: any) => {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    const patch: any = { status: next };
    if (next === "ready") { patch.restaurant_confirmed_dispatch = true; patch.restaurant_confirmed_at = new Date().toISOString(); }
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) toast.error(error.message); else toast.success(`Status → ${statusLabel[next]}`);
  };

  const active = orders.filter((o: any) => !["delivered", "cancelled"].includes(o.status));
  const past = orders.filter((o: any) => ["delivered", "cancelled"].includes(o.status));
  const revenue = past.filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + Number(o.restaurant_payout || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{restaurant.name}</h1>
            <p className="text-sm text-muted-foreground">{restaurant.address}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={restaurant.is_open ? "bg-success text-white" : "bg-muted-foreground text-white"}>
              {restaurant.is_open ? "Open" : "Closed"}
            </Badge>
            <Button variant="outline" size="sm" onClick={toggleOpen} className="gap-2">
              <Power className="h-4 w-4" />{restaurant.is_open ? "Close" : "Open"}
            </Button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Active orders" value={active.length} />
          <Stat label="Completed" value={past.filter((o: any) => o.status === "delivered").length} />
          <Stat label="Earnings" value={KES(revenue)} />
        </div>

        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <h2 className="font-semibold">Active ({active.length})</h2>
            {active.length === 0 && <p className="text-sm text-muted-foreground">No active orders.</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {active.map((o: any) => (
                <OrderCard key={o.id} order={o} onAdvance={() => advance(o)} />
              ))}
            </div>
            <h2 className="mt-6 font-semibold">Recent</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {past.slice(0, 10).map((o: any) => <OrderCard key={o.id} order={o} />)}
            </div>
          </TabsContent>

          <TabsContent value="menu"><MenuManager restaurantId={rid} /></TabsContent>
          <TabsContent value="settings"><RestaurantSettings restaurant={restaurant} onSaved={refetchR} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function OrderCard({ order, onAdvance }: { order: any; onAdvance?: () => void }) {
  const next = NEXT_STATUS[order.status];
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">#{String(order.id).slice(0, 6)}</div>
          <div className="text-xs text-muted-foreground">{order.users?.full_name} · {order.users?.phone}</div>
        </div>
        <Badge variant="secondary">{statusLabel[order.status]}</Badge>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {(order.order_items || []).map((i: any) => (
          <li key={i.id} className="flex justify-between"><span>{i.quantity}× {i.name}</span><span className="text-muted-foreground">{KES(i.subtotal)}</span></li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">Payout</span>
        <span className="font-semibold">{KES(Number(order.restaurant_payout || 0))}</span>
      </div>
      {onAdvance && next && (
        <Button onClick={onAdvance} className="mt-3 w-full" size="sm">Mark as {statusLabel[next]}</Button>
      )}
    </div>
  );
}

function MenuManager({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({
    queryKey: ["cats", restaurantId],
    queryFn: async () => (await supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("display_order")).data ?? [],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", restaurantId],
    queryFn: async () => (await supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId)).data ?? [],
  });

  const [catName, setCatName] = useState("");
  const addCat = async () => {
    if (!catName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({ restaurant_id: restaurantId, name: catName });
    if (error) toast.error(error.message);
    else { setCatName(""); qc.invalidateQueries({ queryKey: ["cats", restaurantId] }); toast.success("Category added"); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">Categories</h3>
        <div className="flex gap-2">
          <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Mains" />
          <Button onClick={addCat}>Add</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {cats.map((c: any) => <Badge key={c.id} variant="secondary">{c.name}</Badge>)}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Menu items</h3>
          <ItemDialog restaurantId={restaurantId} categories={cats} onSaved={() => qc.invalidateQueries({ queryKey: ["items", restaurantId] })} />
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        ) : (
          <ul className="divide-y">
            {items.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{KES(i.base_price)} · {i.is_available ? "Available" : "Unavailable"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!i.is_available} onCheckedChange={async (v) => {
                    await supabase.from("menu_items").update({ is_available: v }).eq("id", i.id);
                    qc.invalidateQueries({ queryKey: ["items", restaurantId] });
                  }} />
                  <ItemDialog restaurantId={restaurantId} categories={cats} item={i} onSaved={() => qc.invalidateQueries({ queryKey: ["items", restaurantId] })}
                    trigger={<Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>} />
                  <Button variant="ghost" size="icon" onClick={async () => {
                    if (!confirm("Delete this item?")) return;
                    await supabase.from("menu_items").delete().eq("id", i.id);
                    qc.invalidateQueries({ queryKey: ["items", restaurantId] });
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ItemDialog({ restaurantId, categories, item, onSaved, trigger }: { restaurantId: string; categories: any[]; item?: any; onSaved: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.base_price ?? 0);
  const [categoryId, setCategoryId] = useState<string | undefined>(item?.category_id ?? undefined);

  const save = async () => {
    if (!name.trim() || !price) { toast.error("Name and price required"); return; }
    const payload = { restaurant_id: restaurantId, name, description, base_price: Number(price), category_id: categoryId ?? null, is_available: true };
    const { error } = item
      ? await supabase.from("menu_items").update(payload).eq("id", item.id)
      : await supabase.from("menu_items").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setOpen(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Add item</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Edit item" : "New menu item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Base price (KES)</Label><Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestaurantSettings({ restaurant, onSaved }: { restaurant: any; onSaved: () => void }) {
  const [name, setName] = useState(restaurant.name);
  const [phone, setPhone] = useState(restaurant.phone);
  const [address, setAddress] = useState(restaurant.address);
  const [description, setDescription] = useState(restaurant.description ?? "");
  const [open_, setOpen_] = useState(restaurant.opening_time ?? "08:00");
  const [close_, setClose_] = useState(restaurant.closing_time ?? "22:00");

  const save = async () => {
    const { error } = await supabase.from("restaurants").update({
      name, phone, address, description, opening_time: open_, closing_time: close_,
    }).eq("id", restaurant.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };

  return (
    <div className="max-w-xl space-y-3 rounded-xl border bg-card p-4">
      <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
      <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Opens</Label><Input type="time" value={open_} onChange={(e) => setOpen_(e.target.value)} /></div>
        <div><Label>Closes</Label><Input type="time" value={close_} onChange={(e) => setClose_(e.target.value)} /></div>
      </div>
      <Button onClick={save}>Save changes</Button>
      {restaurant.status !== "active" && (
        <p className="text-xs text-warning">Status: {restaurant.status}. Awaiting admin approval.</p>
      )}
    </div>
  );
}

function RegisterRestaurant({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || !phone || !address) { toast.error("Fill required fields"); return; }
    setBusy(true);
    const { error } = await supabase.from("restaurants").insert({
      owner_id: ownerId, name, phone, address, description, status: "suspended" as any,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Submitted! Awaiting admin approval."); onCreated(); }
  };

  return (
    <div className="container mx-auto max-w-xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl gradient-hero text-primary-foreground"><ChefHat className="h-6 w-6" /></span>
        <div>
          <h1 className="text-2xl font-bold">Register your restaurant</h1>
          <p className="text-sm text-muted-foreground">An admin will review and approve.</p>
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div><Label>Restaurant name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Phone *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" /></div>
        <div><Label>Address *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Daraja Mbili, Kisii" /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit for approval"}</Button>
      </div>
    </div>
  );
}
