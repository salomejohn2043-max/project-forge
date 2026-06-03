
function GroupOrderCTA({ restaurantId, restaurantName, open }: { restaurantId: string; restaurantName: string; open: boolean }) {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const create = useServerFn(createGroupOrder);
  const { coords } = useGeolocation(true);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="text-sm">
        <div className="font-medium"><Users className="mr-1 inline h-4 w-4" />Order together, save on delivery</div>
        <div className="text-xs text-muted-foreground">3-5 friends · up to 40% off delivery fee</div>
      </div>
      <Button size="sm" disabled={busy} onClick={async () => {
        if (!user) { nav({ to: "/auth" }); return; }
        const address = profile?.phone ? window.prompt("Delivery address for the group?", "") : null;
        if (!address) { toast.error("Address required"); return; }
        setBusy(true);
        try {
          const r = await create({ data: {
            restaurant_id: restaurantId, delivery_address: address,
            delivery_lat: coords?.lat ?? null, delivery_lng: coords?.lng ?? null,
          }});
          nav({ to: "/group/$code", params: { code: r.invite_code } });
        } catch (e: any) { toast.error(e.message); }
        finally { setBusy(false); }
      }}>Start group order</Button>
    </div>
  );
}
