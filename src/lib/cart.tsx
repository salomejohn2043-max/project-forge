import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartItem {
  menu_item_id: string;
  name: string;
  base_price: number;
  marked_up_price: number;
  image_url: string | null;
  quantity: number;
}

interface CartState {
  restaurant_id: string | null;
  restaurant_name: string | null;
  items: CartItem[];
}

interface CartCtx extends CartState {
  add: (restaurantId: string, restaurantName: string, item: Omit<CartItem, "quantity">) => boolean;
  remove: (menuItemId: string) => void;
  setQty: (menuItemId: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "kisii-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({ restaurant_id: null, restaurant_name: null, items: [] });

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setState(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const add: CartCtx["add"] = (restaurantId, restaurantName, item) => {
    if (state.restaurant_id && state.restaurant_id !== restaurantId && state.items.length > 0) {
      const ok = typeof window !== "undefined"
        ? window.confirm(`Your cart has items from ${state.restaurant_name}. Start a new order from ${restaurantName}?`)
        : true;
      if (!ok) return false;
      setState({ restaurant_id: restaurantId, restaurant_name: restaurantName, items: [{ ...item, quantity: 1 }] });
      return true;
    }
    setState((s) => {
      const existing = s.items.find((i) => i.menu_item_id === item.menu_item_id);
      const items = existing
        ? s.items.map((i) => i.menu_item_id === item.menu_item_id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...s.items, { ...item, quantity: 1 }];
      return { restaurant_id: restaurantId, restaurant_name: restaurantName, items };
    });
    return true;
  };

  const remove = (id: string) => setState((s) => {
    const items = s.items.filter((i) => i.menu_item_id !== id);
    return items.length === 0 ? { restaurant_id: null, restaurant_name: null, items: [] } : { ...s, items };
  });

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) return remove(id);
    setState((s) => ({ ...s, items: s.items.map((i) => i.menu_item_id === id ? { ...i, quantity: qty } : i) }));
  };

  const clear = () => setState({ restaurant_id: null, restaurant_name: null, items: [] });

  const subtotal = state.items.reduce((sum, i) => sum + i.marked_up_price * i.quantity, 0);
  const count = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return <Ctx.Provider value={{ ...state, add, remove, setQty, clear, subtotal, count }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
