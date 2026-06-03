import { createFileRoute } from "@tanstack/react-router";
import { reconcileGroupOrdersTick } from "@/lib/group-orders.functions";

export const Route = createFileRoute("/api/public/group-orders/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("platform_settings").select("value").eq("key", "cron_secret").maybeSingle();
        const expected = data?.value;
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await reconcileGroupOrdersTick();
        return Response.json(result);
      },
      GET: async () => new Response("ok"),
    },
  },
});
