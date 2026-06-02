import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Star, Clock, MapPin, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";
import { haversineKm, useGeolocation } from "@/lib/geo";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kisii Eats — Food delivery in Kisii County" },
      { name: "description", content: "Order from the best restaurants in Kisii. Fast boda boda delivery, real-time tracking, M-Pesa payments." },
    ],
  }),
  component: HomePage,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  is_open: boolean;
  average_rating: number;
}

function HomePage() {
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const { coords, loading: locLoading, request } = useGeolocation(true);
  const rev = useServerFn(reverseGeocode);
  const [locName, setLocName] = useState<string>("");

  useEffect(() => {
    if (!coords) return;
    rev({ data: coords })
      .then((r) => setLocName(r.name))
      .catch(() => setLocName(`${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`));
    // persist to profile (best effort)
    if (user) {
      supabase.from("users").update({
        last_lat: coords.lat, last_lng: coords.lng,
      }).eq("id", user.id).then(() => {});
    }
  }, [coords?.lat, coords?.lng, user?.id]);

  useEffect(() => {
    if (user && locName && coords) {
      supabase.from("users").update({ last_location_name: locName }).eq("id", user.id).then(() => {});
    }
  }, [locName, user?.id]);

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id,name,description,logo_url,cover_image_url,address,lat,lng,is_open,average_rating")
        .eq("status", "active");
      if (error) throw error;
      return data as Restaurant[];
    },
  });

  const enriched = useMemo(() => {
    const list = restaurants.map((r) => {
      const distance = coords && r.lat != null && r.lng != null
        ? haversineKm(coords, { lat: Number(r.lat), lng: Number(r.lng) })
        : null;
      return { ...r, distance };
    });
    list.sort((a, b) => {
      if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return 0;
    });
    return list;
  }, [restaurants, coords?.lat, coords?.lng]);

  const filtered = enriched.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <section className="gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 py-14 md:py-20">
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Hot food.<br />Delivered across Kisii.
          </h1>
          <p className="mt-4 max-w-xl text-white/90 md:text-lg">
            Order from your favourite restaurants. Pay with M-Pesa. Track your boda live.
          </p>

          <div className="mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-background p-2 shadow-lg">
            <Search className="ml-2 h-5 w-5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search restaurants…"
              className="border-0 bg-transparent text-foreground focus-visible:ring-0"
            />
          </div>

          <button
            onClick={request}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-white/25"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {locLoading ? "Detecting…" : coords ? (locName || "Detected") : "Detect my location"}
          </button>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        <h2 className="mb-6 text-2xl font-semibold">
          {coords ? "Restaurants near you" : "Restaurants"}
        </h2>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground">No restaurants yet. Be the first to list yours!</p>
            <Link to="/auth" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              Register your restaurant →
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <Link key={r.id} to="/restaurants/$id" params={{ id: r.id }}
                className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative h-36 overflow-hidden bg-muted">
                  {r.cover_image_url ? (
                    <img src={r.cover_image_url} alt={r.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl font-bold text-muted-foreground/40">{r.name[0]}</div>
                  )}
                  <Badge className={`absolute right-3 top-3 ${r.is_open ? "bg-success" : "bg-muted-foreground"} text-white border-0`}>
                    {r.is_open ? "Open" : "Closed"}
                  </Badge>
                  {r.distance != null && (
                    <Badge className="absolute left-3 top-3 border-0 bg-black/60 text-white">
                      {r.distance.toFixed(1)} km
                    </Badge>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{r.name}</h3>
                    <span className="flex items-center gap-1 text-sm font-medium text-warning">
                      <Star className="h-4 w-4 fill-current" />{Number(r.average_rating).toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    <MapPin className="mr-1 inline h-3 w-3" />{r.address}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> 25–40 min
                    {r.distance != null && <span>· {r.distance.toFixed(1)} km away</span>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Kisii Eats · Built for Kisii County
      </footer>
    </div>
  );
}
