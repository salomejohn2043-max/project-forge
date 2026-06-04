import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const Input = z.object({ lat: z.number(), lng: z.number() });

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !mapsKey) {
      return { name: `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`, error: "Missing maps credentials" };
    }
    try {
      const res = await fetch(
        `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}`,
        {
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": mapsKey,
          },
        }
      );
      if (!res.ok) {
        return { name: `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`, error: `HTTP ${res.status}` };
      }
      const json: any = await res.json();
      const name =
        json.results?.[0]?.formatted_address ??
        `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`;
      return { name, error: null as string | null };
    } catch (e: any) {
      return { name: `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`, error: e?.message ?? "geocode failed" };
    }
  });
