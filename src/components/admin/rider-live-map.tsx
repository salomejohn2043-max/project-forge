import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RiderLiveMapProps {
  height?: string;
  compact?: boolean;
}

export function RiderLiveMap({ height = "h-96", compact = false }: RiderLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (mapLoaded) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapError("Google Maps API key not configured");
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.onload = () => setMapLoaded(true);
    script.onerror = () => setMapError("Failed to load Google Maps");
    document.head.appendChild(script);
  }, [mapLoaded]);

  const { data: riders = [] } = useQuery({
    queryKey: ["admin-riders-locations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rider_profiles")
        .select("id, user_id, status, latitude, longitude, users(full_name)")
        .eq("status", "approved");

      return (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.users?.full_name || "Unknown",
        latitude: r.latitude || 0,
        longitude: r.longitude || 0,
        status: r.status,
      }));
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!mapLoaded) return;

    const subscription = supabase
      .channel("rider-locations")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "rider_profiles",
      }, () => {})
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !containerRef.current || !window.google) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(containerRef.current, {
        zoom: 13,
        center: { lat: -0.664, lng: 34.764 },
        mapTypeControl: compact,
        fullscreenControl: !compact,
        zoomControl: !compact,
      });
    }

    riders.forEach((rider) => {
      if (rider.latitude && rider.longitude) {
        const marker = new window.google.maps.Marker({
          position: { lat: rider.latitude, lng: rider.longitude },
          map: mapRef.current,
          title: rider.user_name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: rider.status === "online" ? "#22c55e" : "#9ca3af",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div class="text-sm"><strong>${rider.user_name}</strong><br/><small>${
            rider.status === "online" ? "🟢 Online" : "⚫ Offline"
          }</small></div>`,
        });

        marker.addListener("click", () => {
          infoWindow.open(mapRef.current, marker);
        });
      }
    });

    if (riders.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      riders.forEach((r) => {
        if (r.latitude && r.longitude) {
          bounds.extend({ lat: r.latitude, lng: r.longitude });
        }
      });
      mapRef.current.fitBounds(bounds);
    }
  }, [mapLoaded, riders, compact]);

  if (mapError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{mapError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {!mapLoaded && (
        <div className={`${height} flex items-center justify-center rounded-lg border bg-muted`}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {mapLoaded && (
        <>
          <div ref={containerRef} className={`${height} rounded-lg border overflow-hidden`} />
          <div className="text-xs text-muted-foreground">
            {riders.filter((r) => r.status === "online").length} online riders
          </div>
        </>
      )}
    </div>
  );
}
