import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, Plus, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cart";
import { getSettings, KES } from "@/lib/settings";
import { toast } from "sonner";

export const Route = createFileRoute("/restaurants/$id")({
  component: RestaurantPage,
});

function RestaurantPage() {
  const { id } = Route.useParams();
  const cart = useCart();
  const [markup, setMarkup] = useState(10);

  useEffect(() => { getSettings().then((s) => setMarkup(s.markup_percentage)); }, []);

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["menu-cats", id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_categories").select("*").eq("restaurant_id", id).order("display_order");
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["menu-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", id);
      return data ?? [];
    },
  });

  if (!restaurant) {
    return <div className="min-h-screen bg-background"><AppHeader /><div className="container mx-auto p-8 text-muted-foreground">Loading…</div></div>;
  }

  const byCat = (catId: string | null) => items.filter((i: any) => i.category_id === catId);
  const uncategorized = items.filter((i: any) => !i.category_id || !categories.find((c: any) => c.id === i.category_id));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="relative h-48 w-full overflow-hidden bg-muted md:h-64">
        {restaurant.cover_image_url
          ? <img src={restaurant.cover_image_url} alt={restaurant.name} className="h-full w-full object-cover" />
          : <div className="h-full w-full gradient-hero" />}
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{restaurant.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{restaurant.address}</p>
            {restaurant.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{restaurant.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={restaurant.is_open ? "bg-success text-white border-0" : "bg-muted-foreground text-white border-0"}>
              {restaurant.is_open ? "Open" : "Closed"}
            </Badge>
            <span className="flex items-center gap-1 text-sm font-medium text-warning">
              <Star className="h-4 w-4 fill-current" />{Number(restaurant.average_rating).toFixed(1)}
            </span>
          </div>
        </div>

        <div className="mt-8 space-y-8 pb-32">
          {categories.map((c: any) => (
            <CategorySection key={c.id} title={c.name} items={byCat(c.id)} restaurantId={id} restaurantName={restaurant.name} markup={markup} open={restaurant.is_open} />
          ))}
          {uncategorized.length > 0 && (
            <CategorySection title="Menu" items={uncategorized} restaurantId={id} restaurantName={restaurant.name} markup={markup} open={restaurant.is_open} />
          )}
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No menu items yet.</p>
          )}
        </div>
      </div>

      {cart.count > 0 && cart.restaurant_id === id && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-4 py-3 backdrop-blur">
          <div className="container mx-auto flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Cart subtotal</div>
              <div className="text-lg font-semibold">{KES(cart.subtotal)} · {cart.count} items</div>
            </div>
            <Link to="/checkout"><Button size="lg" className="bg-primary text-primary-foreground">Checkout →</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({ title, items, restaurantId, restaurantName, markup, open }: any) {
  const cart = useCart();
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it: any) => {
          const price = Number(it.base_price) * (1 + markup / 100);
          const inCart = cart.items.find((c) => c.menu_item_id === it.id);
          const available = it.is_available && open;
          return (
            <div key={it.id} className={`flex gap-3 rounded-xl border bg-card p-3 ${available ? "" : "opacity-60"}`}>
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {it.image_url
                  ? <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center text-xl font-bold text-muted-foreground/30">{it.name[0]}</div>}
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight">{it.name}</h3>
                  <span className="text-sm font-semibold">{KES(price)}</span>
                </div>
                {it.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>}
                <div className="mt-auto flex items-center justify-between pt-2">
                  {!available && <span className="text-xs text-destructive">{!it.is_available ? "Out of stock" : "Closed"}</span>}
                  {available && (
                    inCart ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.setQty(it.id, inCart.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center text-sm">{inCart.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.setQty(it.id, inCart.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" className="ml-auto gap-1"
                        onClick={() => {
                          const ok = cart.add(restaurantId, restaurantName, {
                            menu_item_id: it.id, name: it.name, base_price: Number(it.base_price),
                            marked_up_price: Math.round(price), image_url: it.image_url,
                          });
                          if (ok) toast.success(`Added ${it.name}`);
                        }}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
