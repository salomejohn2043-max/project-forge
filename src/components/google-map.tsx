import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
    __kisii_maps_loaded?: Promise<void>;
    initKisiiMap?: () => void;
  }
}

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__kisii_maps_loaded) return window.__kisii_maps_loaded;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Maps key missing"));

  window.__kisii_maps_loaded = new Promise<void>((resolve, reject) => {
    if (window.google?.maps) { resolve(); return; }
    window.initKisiiMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=initKisiiMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__kisii_maps_loaded;
}

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: "primary" | "rider" | "restaurant" | "customer";
  title?: string;
  onClick?: () => void;
};

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  height?: number | string;
  fitMarkers?: boolean;
}

const colorMap: Record<string, string> = {
  primary: "#ea580c",
  rider: "#2563eb",
  restaurant: "#16a34a",
  customer: "#9333ea",
};

export function GoogleMap({ center = { lat: -0.6817, lng: 34.7796 }, zoom = 13, markers = [], className, height = 320, fitMarkers = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadMaps()
      .then(() => {
        if (!mounted || !ref.current) return;
        mapRef.current = new window.google.maps.Map(ref.current, {
          center, zoom,
          disableDefaultUI: true,
          zoomControl: true,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
      })
      .catch((e) => setError(e.message));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    markers.forEach((m) => {
      const marker = new window.google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current,
        title: m.title ?? m.label,
        label: m.label ? { text: m.label, color: "white", fontWeight: "bold", fontSize: "11px" } : undefined,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: colorMap[m.color ?? "primary"],
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
      });
      if (m.onClick) marker.addListener("click", m.onClick);
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });
    if (fitMarkers && markers.length > 1) mapRef.current.fitBounds(bounds, 60);
    else if (fitMarkers && markers.length === 1) {
      mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
      mapRef.current.setZoom(15);
    }
  }, [markers, fitMarkers]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  if (error) {
    return (
      <div className={className} style={{ height }}>
        <div className="grid h-full place-items-center rounded-xl border bg-muted text-xs text-muted-foreground">
          Map unavailable: {error}
        </div>
      </div>
    );
  }

  return <div ref={ref} className={`rounded-xl border ${className ?? ""}`} style={{ height, width: "100%" }} />;
}
