import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChefHat } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Kisii Eats" }] }),
  component: AuthPage,
});

type Role = "customer" | "rider" | "restaurant_admin";

function AuthPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (user && profile) {
      if (profile.role === "restaurant_admin") navigate({ to: "/restaurant" });
      else if (profile.role === "rider") navigate({ to: "/rider" });
      else if (profile.role === "admin") navigate({ to: "/admin" });
      else navigate({ to: "/" });
    }
  }, [user, profile, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="container mx-auto px-4 py-5">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </span>
          Kisii Eats
        </Link>
      </header>

      <main className="container mx-auto flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignInForm /></TabsContent>
            <TabsContent value="signup"><SignUpForm /></TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back!");
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pw">Password</Label>
        <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

function SignUpForm() {
  const [role, setRole] = useState<Role>("customer");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // rider extra
  const [idNumber, setIdNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("bodaboda");
  const [vehiclePlate, setVehiclePlate] = useState("");

  // restaurant extra
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { full_name: fullName, phone, role },
        },
      });
      if (error) throw error;

      // RLS on restaurants/rider_profiles requires auth.uid(); make sure a session exists.
      let session = data.session;
      if (!session) {
        const { data: signInData, error: signInErr } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          toast.success("Account created! Please confirm your email, then sign in to finish setup.");
          return;
        }
        session = signInData.session;
      }

      const uid = session?.user?.id ?? data.user?.id;
      if (uid) {
        await supabase.from("users").update({ full_name: fullName, phone, role }).eq("id", uid);

        if (role === "rider") {
          const { error: rpErr } = await supabase.from("rider_profiles").insert({
            user_id: uid, id_number: idNumber, vehicle_type: vehicleType, vehicle_plate: vehiclePlate, status: "pending",
          });
          if (rpErr) throw rpErr;
        }
        if (role === "restaurant_admin") {
          const { error: rErr } = await supabase.from("restaurants").insert({
            owner_id: uid, name: restaurantName, phone, address: restaurantAddress, status: "active", is_open: false,
          });
          if (rErr) throw rErr;
        }
      }
      toast.success("Account created!");
    } catch (err: any) {
      toast.error(err?.message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <Label>I want to join as</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Customer — order food</SelectItem>
            <SelectItem value="rider">Rider — deliver food</SelectItem>
            <SelectItem value="restaurant_admin">Restaurant — sell food</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="su-name">Full name</Label>
          <Input id="su-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-phone">Phone (07…)</Label>
          <Input id="su-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pw">Password</Label>
        <Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {role === "rider" && (
        <div className="space-y-3 rounded-lg bg-muted/50 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="su-id">National ID number</Label>
            <Input id="su-id" required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bodaboda">Boda boda</SelectItem>
                  <SelectItem value="bicycle">Bicycle</SelectItem>
                  <SelectItem value="car">Car</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-plate">Plate (optional)</Label>
              <Input id="su-plate" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Your account will need admin approval before you can take deliveries.</p>
        </div>
      )}

      {role === "restaurant_admin" && (
        <div className="space-y-3 rounded-lg bg-muted/50 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="su-rname">Restaurant name</Label>
            <Input id="su-rname" required value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-raddr">Restaurant address</Label>
            <Input id="su-raddr" required value={restaurantAddress} onChange={(e) => setRestaurantAddress(e.target.value)} />
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
    </form>
  );
}
