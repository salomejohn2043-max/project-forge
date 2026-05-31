import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";
import { useEffect } from "react";

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { profile, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (profile && !roles.includes(profile.role)) navigate({ to: "/" });
  }, [loading, user, profile, roles, navigate]);

  if (loading || !user || !profile) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!roles.includes(profile.role)) return null;
  return <>{children}</>;
}
