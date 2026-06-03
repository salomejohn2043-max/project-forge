
-- ============ Types ============
CREATE TYPE public.group_order_status AS ENUM ('open','locked','paying','awaiting_creator','confirmed','cancelled','completed');
CREATE TYPE public.group_member_payment_status AS ENUM ('pending','paid','failed','dropped');

-- ============ group_orders ============
CREATE TABLE public.group_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  invite_code text NOT NULL UNIQUE,
  status public.group_order_status NOT NULL DEFAULT 'open',
  delivery_address text NOT NULL,
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_distance_km numeric,
  base_delivery_fee numeric NOT NULL DEFAULT 0,
  delivery_discount_pct numeric NOT NULL DEFAULT 0,
  discounted_delivery_fee numeric NOT NULL DEFAULT 0,
  lock_at timestamptz NOT NULL,
  locked_at timestamptz,
  payment_deadline timestamptz,
  creator_decision_deadline timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  final_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_orders TO authenticated;
GRANT ALL ON public.group_orders TO service_role;
ALTER TABLE public.group_orders ENABLE ROW LEVEL SECURITY;

-- ============ group_order_members ============
CREATE TABLE public.group_order_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_order_id uuid NOT NULL REFERENCES public.group_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_creator boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  drop_reason text,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_share numeric NOT NULL DEFAULT 0,
  total_due numeric NOT NULL DEFAULT 0,
  payment_option int,
  amount_paid_upfront numeric NOT NULL DEFAULT 0,
  amount_remaining numeric NOT NULL DEFAULT 0,
  payment_status public.group_member_payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  UNIQUE(group_order_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_order_members TO authenticated;
GRANT ALL ON public.group_order_members TO service_role;
ALTER TABLE public.group_order_members ENABLE ROW LEVEL SECURITY;

-- ============ group_order_items ============
CREATE TABLE public.group_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_order_id uuid NOT NULL REFERENCES public.group_orders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.group_order_members(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL,
  name text NOT NULL,
  base_price numeric NOT NULL,
  marked_up_price numeric NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  subtotal numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_order_items TO authenticated;
GRANT ALL ON public.group_order_items TO service_role;
ALTER TABLE public.group_order_items ENABLE ROW LEVEL SECURITY;

-- ============ Helper (after tables exist) ============
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_order_members m
    WHERE m.group_order_id = _group_id AND m.user_id = _user_id AND m.removed_at IS NULL
  );
$$;

-- ============ RLS policies ============
CREATE POLICY "Members view group_orders" ON public.group_orders
  FOR SELECT USING (creator_id = auth.uid() OR public.is_group_member(id, auth.uid()));
CREATE POLICY "Creator inserts group_orders" ON public.group_orders
  FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creator updates group_orders" ON public.group_orders
  FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "Admin all group_orders" ON public.group_orders
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Members view co-members" ON public.group_order_members
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_group_member(group_order_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_orders g WHERE g.id = group_order_id AND g.creator_id = auth.uid())
  );
CREATE POLICY "User inserts self as member" ON public.group_order_members
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Member updates self" ON public.group_order_members
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Creator updates members" ON public.group_order_members
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.group_orders g WHERE g.id = group_order_id AND g.creator_id = auth.uid()));
CREATE POLICY "Admin all group_order_members" ON public.group_order_members
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Members view items" ON public.group_order_items
  FOR SELECT USING (
    public.is_group_member(group_order_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_orders g WHERE g.id = group_order_id AND g.creator_id = auth.uid())
  );
CREATE POLICY "Owner inserts own items when open" ON public.group_order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.group_order_members m
            WHERE m.id = member_id AND m.user_id = auth.uid() AND m.removed_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.group_orders g
                WHERE g.id = group_order_id AND g.status = 'open')
  );
CREATE POLICY "Owner updates own items when open" ON public.group_order_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.group_order_members m
            WHERE m.id = member_id AND m.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.group_orders g
                WHERE g.id = group_order_id AND g.status = 'open')
  );
CREATE POLICY "Owner deletes own items when open" ON public.group_order_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.group_order_members m
            WHERE m.id = member_id AND m.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.group_orders g
                WHERE g.id = group_order_id AND g.status = 'open')
  );
CREATE POLICY "Admin all group_order_items" ON public.group_order_items
  FOR ALL USING (is_admin(auth.uid()));

-- ============ updated_at trigger ============
CREATE TRIGGER trg_group_orders_updated
  BEFORE UPDATE ON public.group_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_order_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_order_items;
ALTER TABLE public.group_orders REPLICA IDENTITY FULL;
ALTER TABLE public.group_order_members REPLICA IDENTITY FULL;
ALTER TABLE public.group_order_items REPLICA IDENTITY FULL;

-- ============ Settings seed ============
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('group_delivery_discount_3','20','Delivery fee discount % for 3-member group'),
  ('group_delivery_discount_4','30','Delivery fee discount % for 4-member group'),
  ('group_delivery_discount_5','40','Delivery fee discount % for 5-member group'),
  ('group_min_members','3','Minimum members to lock a group order'),
  ('group_max_members','5','Maximum members per group order'),
  ('group_join_window_minutes','15','Minutes from creation to lock'),
  ('group_payment_window_minutes','10','Minutes to complete upfront payment after lock'),
  ('group_creator_decision_minutes','5','Minutes for creator to decide if members drop below min after lock'),
  ('cron_secret', encode(gen_random_bytes(16),'hex'), 'Shared secret for /api/public/* cron endpoints')
ON CONFLICT (key) DO NOTHING;

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_orders_customer_created    ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rider_status        ON public.orders(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status   ON public.orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_ready        ON public.orders(status) WHERE rider_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_online      ON public.rider_profiles(is_online, status);
CREATE INDEX IF NOT EXISTS idx_restaurants_active_open    ON public.restaurants(status, is_open);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant      ON public.menu_items(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON public.menu_categories(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_order_items_order          ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group        ON public.group_order_members(group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user         ON public.group_order_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_items_group          ON public.group_order_items(group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_items_member         ON public.group_order_items(member_id);
CREATE INDEX IF NOT EXISTS idx_group_orders_status_lock   ON public.group_orders(status, lock_at);
CREATE INDEX IF NOT EXISTS idx_group_orders_status_pay    ON public.group_orders(status, payment_deadline);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_mpesa_ref
  ON public.transactions(mpesa_reference)
  WHERE mpesa_reference IS NOT NULL;
