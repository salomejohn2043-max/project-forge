import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Copy, Clock, ShoppingBag, X, Lock, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { KES, getSettings } from "@/lib/settings";
import { joinGroupOrder, lockGroupOrder, payGroupShare } from "@/lib/group-orders.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/group/$code")({
  component: GroupLobby,
});

function GroupLobby() {
  const { code } = Route.useParams();
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const doJoin = useServerFn(joinGroupOrder);
  const doLock = useServerFn(lockGroupOrder);
  const doPay = useServerFn(payGroupShare);
  const [markup, setMarkup] = useState(10);
  const [paying, setPaying] = useState(false);

  useEffect(() => { getSettings().then((s) => setMarkup(s.markup_percentage)); }, []);

  const { data: group, refetch } = useQuery({
    queryKey: ["group", code],
    queryFn: async () => {
      const { data } = await supabase.from("group_orders").select("*").eq("invite_code", code.toUpperCase()).maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: restaurant } = useQuery({
    queryKey: ["group-restaurant", group?.restaurant_id],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name,logo_url").eq("id", group!.restaurant_id).single();
      return data;
    },
    enabled: !!group?.restaurant_id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["group-members", group?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_order_members")
        .select("*, users:user_id(full_name)")
        .eq("group_order_id", group!.id).is("removed_at", null);
      return data ?? [];
    },
    enabled: !!group?.id,
    refetchInterval: 5000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["group-items", group?.id],
    queryFn: async () => {
      const { data } = await supabase.from("group_order_items").select("*").eq("group_order_id", group!.id);
      return data ?? [];
    },
    enabled: !!group?.id,
    refetchInterval: 5000,
  });

  // Realtime
  useEffect(() => {
    if (!group?.id) return;
    const ch = supabase.channel(`group-${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_order_members", filter: `group_order_id=eq.${group.id}` }, () => qc.invalidateQueries({ queryKey: ["group-members", group.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_order_items", filter: `group_order_id=eq.${group.id}` }, () => qc.invalidateQueries({ queryKey: ["group-items", group.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_orders", filter: `id=eq.${group.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [group?.id]);

  if (!user) {
    return wrap(
      <div className="rounded-2xl border p-6 text-center">
        <p className="mb-3">Sign in to join this group order.</p>
        <Link to="/auth"><Button>Sign in</Button></Link>
      </div>
    );
  }
  if (!group) return wrap(<p className="text-muted-foreground">Loading group…</p>);
  if (group.status === "cancelled") {
    return wrap(<div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="font-semibold text-destructive">Group cancelled</h2>
      <p className="mt-1 text-sm">{group.cancellation_reason}</p>
    </div>);
  }
  if (group.status === "confirmed" && group.final_order_id) {
    nav({ to: "/orders/$id", params: { id: group.final_order_id } });
    return null;
  }

  const isMember = members.some((m: any) => m.user_id === user.id);
  const isCreator = group.creator_id === user.id;
  const me = members.find((m: any) => m.user_id === user.id);
  const myItems = items.filter((it: any) => it.member_id === me?.id);
  const mySubtotal = myItems.reduce((s: number, it: any) => s + Number(it.subtotal), 0);

  const allPaid = members.length > 0 && members.every((m: any) => m.payment_status === "paid");
  const everyoneHasItems = members.every((m: any) => items.some((it: any) => it.member_id === m.id));

  return wrap(
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Group order from</div>
            <h1 className="text-xl font-bold">{restaurant?.name ?? "Restaurant"}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {members.length} / 5 joined
            </p>
          </div>
          <Badge className="bg-primary text-primary-foreground border-0">{group.status}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 font-mono text-lg tracking-widest">
            {group.invite_code}
          </div>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/group/${group.invite_code}`); toast.success("Link copied"); }}>
            <Copy className="mr-1 h-3 w-3" /> Copy invite link
          </Button>
          <Countdown deadline={group.status === "open" ? group.lock_at : group.payment_deadline} label={group.status === "open" ? "until lock" : "to pay"} />
        </div>

        {!isMember && group.status === "open" && (
          <Button className="mt-4 w-full" onClick={async () => {
            try { await doJoin({ data: { invite_code: group.invite_code } }); toast.success("Joined!"); refetch(); }
            catch (e: any) { toast.error(e.message); }
          }}>Join this group</Button>
        )}
      </div>

      {/* Members + items */}
      <div className="space-y-3">
        {members.map((m: any) => {
          const memItems = items.filter((it: any) => it.member_id === m.id);
          const sub = memItems.reduce((s: number, it: any) => s + Number(it.subtotal), 0);
          return (
            <div key={m.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {m.users?.full_name ?? "Member"}{m.is_creator && <span className="ml-2 text-xs text-primary">(host)</span>}
                    {m.user_id === user.id && <span className="ml-2 text-xs text-muted-foreground">— you</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{memItems.length} item(s) · {KES(sub)}</div>
                </div>
                <div className="text-right text-xs">
                  {m.payment_status === "paid"
                    ? <Badge className="bg-success text-white border-0">paid</Badge>
                    : group.status !== "open" ? <Badge variant="outline">awaiting payment</Badge> : null}
                </div>
              </div>
              {memItems.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {memItems.map((it: any) => (
                    <li key={it.id} className="flex justify-between text-muted-foreground">
                      <span>{it.quantity}× {it.name}</span><span>{KES(it.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Add items button (only while open and member) */}
      {isMember && group.status === "open" && me && (
        <AddItemsCard
          restaurantId={group.restaurant_id}
          groupId={group.id}
          memberId={me.id}
          existingItems={myItems}
          markup={markup}
          onChange={() => qc.invalidateQueries({ queryKey: ["group-items", group.id] })}
        />
      )}

      {/* Lock button for creator */}
      {isCreator && group.status === "open" && (
        <Button
          className="w-full"
          size="lg"
          disabled={members.length < 3 || !everyoneHasItems}
          onClick={async () => {
            try { await doLock({ data: { group_order_id: group.id } }); toast.success("Group locked"); refetch(); }
            catch (e: any) { toast.error(e.message); }
          }}
        >
          <Lock className="mr-2 h-4 w-4" />
          {members.length < 3 ? `Need ${3 - members.length} more` : !everyoneHasItems ? "Everyone needs items" : "Lock & start payment"}
        </Button>
      )}

      {/* Payment phase */}
      {isMember && me && (group.status === "locked" || group.status === "paying" || group.status === "awaiting_creator") && me.payment_status !== "paid" && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold">Pay your share</h3>
          <div className="mt-2 text-sm text-muted-foreground">Items: {KES(Number(me.subtotal))} + delivery {KES(Number(me.delivery_share))}</div>
          <div className="mt-1 text-lg font-bold">Total: {KES(Number(me.total_due))}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[30, 50, 100].map((pct) => (
              <Button key={pct} variant="outline" disabled={paying}
                onClick={async () => {
                  setPaying(true);
                  try { await doPay({ data: { member_id: me.id, payment_option: pct as 30 | 50 | 100 } }); toast.success(`Paid ${pct}% via M-Pesa`); refetch(); }
                  catch (e: any) { toast.error(e.message); }
                  finally { setPaying(false); }
                }}
              >
                <Wallet className="mr-1 h-3 w-3" />{pct}%
              </Button>
            ))}
          </div>
        </div>
      )}

      {allPaid && group.status !== "confirmed" && (
        <p className="rounded-xl border bg-success/10 p-3 text-center text-sm text-success">Everyone paid! Confirming order…</p>
      )}
    </div>
  );
}

function wrap(node: React.ReactNode) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-2xl px-4 py-6">{node}</div>
    </div>
  );
}

function Countdown({ deadline, label }: { deadline: string | null; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return <span className="text-xs text-destructive">Expired</span>;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{m}:{String(s).padStart(2,"0")} {label}</span>;
}

function AddItemsCard({ restaurantId, groupId, memberId, existingItems, markup, onChange }: any) {
  const [open, setOpen] = useState(false);
  const { data: menu = [] } = useQuery({
    queryKey: ["group-menu", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).eq("is_available", true);
      return data ?? [];
    },
  });
  const add = async (it: any) => {
    const price = Math.round(Number(it.base_price) * (1 + markup / 100));
    const existing = existingItems.find((x: any) => x.menu_item_id === it.id);
    if (existing) {
      await supabase.from("group_order_items").update({
        quantity: existing.quantity + 1, subtotal: (existing.quantity + 1) * existing.marked_up_price,
      }).eq("id", existing.id);
    } else {
      await supabase.from("group_order_items").insert({
        group_order_id: groupId, member_id: memberId, menu_item_id: it.id,
        name: it.name, base_price: it.base_price, marked_up_price: price,
        quantity: 1, subtotal: price,
      });
    }
    onChange();
  };
  const remove = async (existingId: string) => { await supabase.from("group_order_items").delete().eq("id", existingId); onChange(); };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <span className="font-medium"><ShoppingBag className="mr-1 inline h-4 w-4" />Add your items</span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show menu"}</span>
      </button>
      {open && (
        <>
          {existingItems.length > 0 && (
            <ul className="mt-3 space-y-1 border-b pb-3 text-sm">
              {existingItems.map((it: any) => (
                <li key={it.id} className="flex items-center justify-between">
                  <span>{it.quantity}× {it.name}</span>
                  <button onClick={() => remove(it.id)} className="text-xs text-destructive"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {menu.map((it: any) => {
              const price = Math.round(Number(it.base_price) * (1 + markup / 100));
              return (
                <button key={it.id} onClick={() => add(it)} className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm hover:bg-muted">
                  <span>{it.name}</span><span className="font-medium">{KES(price)}</span>
                </button>
              );
            })}
            {menu.length === 0 && <p className="text-sm text-muted-foreground">No items available.</p>}
          </div>
        </>
      )}
    </div>
  );
}
