import { useEffect, useState } from "react";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type Coords = { lat: number; lng: number };

export function useGeolocation(auto = true) {
  const [coords, setCoords] = useState<Coords | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("kisii.coords");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation not supported"); return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        localStorage.setItem("kisii.coords", JSON.stringify(c));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (auto && !coords) request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { coords, error, loading, request, setCoords };
}

// Default Kisii Town center (fallback)
export const KISII_CENTER: Coords = { lat: -0.6817, lng: 34.7796 };
