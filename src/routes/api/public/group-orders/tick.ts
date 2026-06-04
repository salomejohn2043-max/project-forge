import { createFileRoute } from "@tanstack/react-router";
import { reconcileGroupOrdersTick } from "@/lib/group-orders.functions";

export const Route = createFileRoute("/api/public/group-orders/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response("Cron secret not configured", { status: 503 });
        }
        const provided = request.headers.get("x-cron-secret");
        if (provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await reconcileGroupOrdersTick();
        return Response.json(result);
      },
      GET: async () => new Response("ok"),
    },
  },
});
