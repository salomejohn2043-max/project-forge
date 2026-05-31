import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { user } = useAuth();
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-2xl p-4 md:p-8">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="mt-6 space-y-2">
          {notes.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No notifications.</p>}
          {notes.map((n: any) => (
            <div key={n.id} className={`rounded-xl border bg-card p-4 ${n.is_read ? "" : "border-primary/40"}`}>
              <div className="flex items-start justify-between">
                <div className="font-medium">{n.title}</div>
                <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
