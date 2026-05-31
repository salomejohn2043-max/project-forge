import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KES } from "@/lib/settings";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) { setFullName(profile.full_name); setPhone(profile.phone ?? ""); }
  }, [profile]);

  if (!user || !profile) return <div className="min-h-screen bg-background"><AppHeader /><div className="p-8 text-muted-foreground">Sign in to view profile.</div></div>;

  const save = async () => {
    const { error } = await supabase.from("users").update({ full_name: fullName, phone }).eq("id", user.id);
    if (error) toast.error(error.message); else { toast.success("Profile updated"); refreshProfile(); }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-2xl space-y-6 p-4 md:p-8">
        <h1 className="text-2xl font-bold">Profile</h1>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Wallet" value={KES(Number(profile.wallet_balance))} />
          <Stat label="Loyalty points" value={String(profile.loyalty_points)} />
          <Stat label="Referral code" value={profile.referral_code ?? "—"} />
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-1.5"><Label>Email</Label><Input value={profile.email ?? ""} disabled /></div>
          <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}
