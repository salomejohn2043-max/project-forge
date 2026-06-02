import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bike, MapPin, Phone, CheckCircle2, Upload, ClockIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { RequireRole } from "@/components/require-role";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KES } from "@/lib/settings";
import { statusLabel } from "@/lib/format";

export const Route = createFileRoute("/rider")({
  component: () => <RequireRole roles={["rider", "admin"]}><RiderDashboard /></RequireRole>,
});

function RiderDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rp, refetch: refetchRP } = useQuery({
    queryKey: ["rp", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("rider_profiles").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  // Live location ping when online
  useEffect(() => {
    if (!rp?.is_online || rp.status !== "approved") return;
    if (!navigator.geolocation) return;
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from("rider_profiles").update({
            current_lat: pos.coords.latitude,
            current_lng: pos.coords.longitude,
          }).eq("id", rp.id);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
    };
    send();
    const t = setInterval(send, 15000);
    return () => clearInterval(t);
  }, [rp?.is_online, rp?.status, rp?.id]);

  const { data: available = [] } = useQuery({
    queryKey: ["available-orders"],
    enabled: !!rp && rp.status === "approved",
    queryFn: async () => (await supabase.from("orders")
      .select("*, restaurants(name,address,phone), users!orders_customer_id_fkey(full_name,phone)")
      .is("rider_id", null).eq("status", "ready").order("created_at")).data ?? [],
  });

  const { data: mine = [] } = useQuery({
    queryKey: ["mine", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("orders")
      .select("*, restaurants(name,address,phone), users!orders_customer_id_fkey(full_name,phone)")
      .eq("rider_id", user!.id).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("rider-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" },
        () => { qc.invalidateQueries({ queryKey: ["available-orders"] }); qc.invalidateQueries({ queryKey: ["mine"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  if (!rp) return <div className="min-h-screen bg-background"><AppHeader /><RiderOnboarding userId={user!.id} onCreated={refetchRP} /></div>;

  if (rp.status !== "approved") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container mx-auto max-w-lg p-8 text-center">
          <ClockIcon className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-2xl font-bold">Awaiting verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your rider application is being reviewed by the admin. You'll get access to the dashboard once approved.
          </p>
          <div className="mt-4 rounded-xl border bg-card p-4 text-left text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><Badge>{rp.status}</Badge></div>
            <div className="mt-2 flex items-center justify-between"><span className="text-muted-foreground">Vehicle</span><span>{rp.vehicle_type} · {rp.vehicle_plate}</span></div>
            <div className="mt-2 flex items-center justify-between"><span className="text-muted-foreground">ID number</span><span>{rp.id_number}</span></div>
            {rp.rejection_reason && (
              <div className="mt-3 rounded bg-destructive/10 p-2 text-xs text-destructive">
                <strong>Rejected:</strong> {rp.rejection_reason}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const toggleOnline = async (v: boolean) => {
    await supabase.from("rider_profiles").update({ is_online: v }).eq("id", rp.id);
    refetchRP(); toast.success(v ? "You're online" : "You're offline");
  };

  const accept = async (o: any) => {
    const { error } = await supabase.from("orders").update({
      rider_id: user!.id, status: "picked_up",
      rider_confirmed_pickup: true, rider_confirmed_at: new Date().toISOString(),
    }).eq("id", o.id).is("rider_id", null);
    if (error) toast.error(error.message); else toast.success("Order accepted");
  };

  const advance = async (o: any, next: string) => {
    const { error } = await supabase.from("orders").update({ status: next as any }).eq("id", o.id);
    if (error) toast.error(error.message); else toast.success(statusLabel[next]);
  };

  const active = mine.filter((o: any) => !["delivered", "cancelled"].includes(o.status));
  const past = mine.filter((o: any) => o.status === "delivered");
  const earnings = past.reduce((s: number, o: any) => s + Number(o.rider_payout || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Rider dashboard</h1>
            <p className="text-sm text-muted-foreground">{rp.vehicle_type} · {rp.vehicle_plate}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <span className="text-sm">{rp.is_online ? "Online" : "Offline"}</span>
            <Switch checked={!!rp.is_online} onCheckedChange={toggleOnline} />
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Active" value={active.length} />
          <Stat label="Completed" value={past.length} />
          <Stat label="Earnings" value={KES(earnings)} />
        </div>

        <Tabs defaultValue="available">
          <TabsList>
            <TabsTrigger value="available">Available ({available.length})</TabsTrigger>
            <TabsTrigger value="active">My active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-3">
            {!rp.is_online && <p className="text-sm text-warning">Go online to accept orders. Your location is shared with admin while online.</p>}
            {available.length === 0 ? <p className="text-sm text-muted-foreground">No deliveries right now.</p> :
              available.map((o: any) => <DeliveryCard key={o.id} order={o} actionLabel="Accept" onAction={() => accept(o)} />)}
          </TabsContent>

          <TabsContent value="active" className="space-y-3">
            {active.length === 0 && <p className="text-sm text-muted-foreground">No active deliveries.</p>}
            {active.map((o: any) => {
              const next = o.status === "picked_up" ? "in_transit" : o.status === "in_transit" ? "delivered" : null;
              return <DeliveryCard key={o.id} order={o} actionLabel={next ? `Mark ${statusLabel[next]}` : undefined}
                onAction={next ? () => advance(o, next) : undefined} />;
            })}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {past.slice(0, 20).map((o: any) => <DeliveryCard key={o.id} order={o} />)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}

function DeliveryCard({ order, actionLabel, onAction }: { order: any; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{order.restaurants?.name}</div>
          <div className="text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{order.restaurants?.address}</div>
        </div>
        <Badge variant="secondary">{statusLabel[order.status]}</Badge>
      </div>
      <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
        <div className="font-medium">Deliver to {order.users?.full_name}</div>
        <div className="text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{order.delivery_address}</div>
        <a href={`tel:${order.users?.phone}`} className="mt-1 inline-flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{order.users?.phone}</a>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{order.delivery_distance_km ? `${Number(order.delivery_distance_km).toFixed(1)} km` : "?"} · Total {KES(Number(order.total_amount))}</span>
        <span className="font-semibold">Payout {KES(Number(order.rider_payout || 0))}</span>
      </div>
      {order.amount_remaining > 0 && <p className="mt-1 text-xs text-warning">Collect {KES(order.amount_remaining)} on delivery</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-3 w-full gap-2" size="sm"><CheckCircle2 className="h-4 w-4" />{actionLabel}</Button>
      )}
    </div>
  );
}

function RiderOnboarding({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [vehicleType, setVehicleType] = useState("boda");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = () => setPhotoPreview(r.result as string);
      r.readAsDataURL(f);
    } else setPhotoPreview(null);
  };

  const submit = async () => {
    if (!idNumber || !vehiclePlate) { toast.error("Fill all fields"); return; }
    if (!photoFile) { toast.error("Upload your full-body photo"); return; }
    setBusy(true);
    try {
      // Upload photo
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${userId}/full-body-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("rider-photos").upload(path, photoFile, { upsert: true });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("rider-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      const photoUrl = signed?.signedUrl ?? path;

      // promote user to rider role
      await supabase.from("users").update({ role: "rider" }).eq("id", userId);
      const { error } = await supabase.from("rider_profiles").insert({
        user_id: userId, vehicle_type: vehicleType, vehicle_plate: vehiclePlate, id_number: idNumber,
        status: "pending", full_body_photo_url: photoUrl,
      });
      if (error) throw error;
      toast.success("Submitted! Awaiting admin verification.");
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="container mx-auto max-w-xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl gradient-hero text-primary-foreground"><Bike className="h-6 w-6" /></span>
        <div>
          <h1 className="text-2xl font-bold">Become a rider</h1>
          <p className="text-sm text-muted-foreground">Earn delivering food across Kisii.</p>
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div><Label>Vehicle type</Label><Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="boda / motorbike / bicycle" /></div>
        <div><Label>Vehicle plate</Label><Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} /></div>
        <div><Label>National ID number</Label><Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></div>

        <div>
          <Label>Full-body photo *</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Stand facing the camera. <strong>No glasses, no caps, no masks</strong> — your face must be clearly visible.
          </p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="w-full gap-2">
            <Upload className="h-4 w-4" />{photoFile ? "Change photo" : "Upload photo"}
          </Button>
          {photoPreview && (
            <img src={photoPreview} alt="preview" className="mt-3 max-h-64 rounded-lg border object-contain" />
          )}
        </div>

        <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit for verification"}</Button>
      </div>
    </div>
  );
}
