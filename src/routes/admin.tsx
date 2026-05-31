import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/require-role";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — Kisii Eats" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { profile } = useAuth();

  return (
    <RequireRole role="admin">
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <p>Welcome, Admin {profile?.full_name}</p>
        </main>
      </div>
    </RequireRole>
  );
}
