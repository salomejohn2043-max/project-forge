import { useEffect, useState } from "react";
import { MapPin, LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";
import { GoogleMap } from "@/components/google-map";

interface Props {
  value: { lat: number | null; lng: number | null; name: string };
  onChange: (v: { lat: number; lng: number; name: string }) => void;
  showMap?: boolean;
  className?: string;
}

export function LocationPicker({ value, onChange, showMap = true, className }: Props) {
  const rev = useServerFn(reverseGeocode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const detect = () => {
    if (!navigator.geolocation) { setErr("Geolocation not supported"); return; }
    setBusy(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        try {
          const r = await rev({ data: { lat, lng } });
          onChange({ lat, lng, name: r.name });
        } catch {
          onChange({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        }
        setBusy(false);
      },
      (e) => { setErr(e.message); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (value.lat == null && value.lng == null) detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          {value.name ? <span>{value.name}</span> : <span className="text-muted-foreground">No location set</span>}
          {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={detect} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
          Detect
        </Button>
      </div>
      {showMap && value.lat != null && value.lng != null && (
        <GoogleMap
          center={{ lat: value.lat, lng: value.lng }}
          markers={[{ id: "me", lat: value.lat, lng: value.lng, color: "customer", title: value.name }]}
          height={180}
        />
      )}
    </div>
  );
}
