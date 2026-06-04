
-- 1) Users: prevent privilege escalation via trigger (allow service_role bypass)
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role / admin calls have no auth.uid() OR are admins; allow them
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
     OR NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Cannot modify privileged fields (role, wallet_balance, loyalty_points, is_active)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_prevent_escalation ON public.users;
CREATE TRIGGER users_prevent_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- 2) Orders: recompute derived financial fields on INSERT; lock them on UPDATE
CREATE OR REPLACE FUNCTION public.compute_order_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_markup numeric;
  s_rest_comm numeric;
  s_rider_comm numeric;
  base_subtotal numeric;
  payment_pct int;
BEGIN
  -- service_role bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value::numeric INTO s_markup FROM public.platform_settings WHERE key = 'markup_percentage';
  SELECT value::numeric INTO s_rest_comm FROM public.platform_settings WHERE key = 'restaurant_commission_percentage';
  SELECT value::numeric INTO s_rider_comm FROM public.platform_settings WHERE key = 'rider_commission_percentage';
  s_markup    := COALESCE(s_markup, 10);
  s_rest_comm := COALESCE(s_rest_comm, 5);
  s_rider_comm:= COALESCE(s_rider_comm, 5);

  -- Sanity: positive numbers
  IF NEW.subtotal < 0 OR NEW.delivery_fee < 0 THEN
    RAISE EXCEPTION 'Invalid order amounts';
  END IF;

  -- Derive base subtotal from declared subtotal (subtotal includes markup)
  base_subtotal := NEW.subtotal / (1 + s_markup / 100.0);

  NEW.markup_amount         := ROUND(NEW.subtotal - base_subtotal);
  NEW.restaurant_commission := ROUND(base_subtotal * s_rest_comm / 100.0);
  NEW.rider_commission      := ROUND(NEW.delivery_fee * s_rider_comm / 100.0);
  NEW.restaurant_payout     := ROUND(base_subtotal - NEW.restaurant_commission);
  NEW.rider_payout          := ROUND(NEW.delivery_fee - NEW.rider_commission);
  NEW.total_amount          := NEW.subtotal + NEW.delivery_fee;

  payment_pct := COALESCE(NULLIF(NEW.payment_option::text, '')::int, 100);
  IF payment_pct NOT IN (30, 50, 100) THEN
    RAISE EXCEPTION 'Invalid payment_option';
  END IF;

  NEW.amount_paid_upfront := ROUND(NEW.total_amount * payment_pct / 100.0);
  NEW.amount_remaining    := NEW.total_amount - NEW.amount_paid_upfront;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_compute_financials ON public.orders;
CREATE TRIGGER orders_compute_financials
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_order_financials();

CREATE OR REPLACE FUNCTION public.lock_order_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.subtotal              IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee       IS DISTINCT FROM OLD.delivery_fee
     OR NEW.total_amount       IS DISTINCT FROM OLD.total_amount
     OR NEW.markup_amount      IS DISTINCT FROM OLD.markup_amount
     OR NEW.restaurant_commission IS DISTINCT FROM OLD.restaurant_commission
     OR NEW.rider_commission   IS DISTINCT FROM OLD.rider_commission
     OR NEW.restaurant_payout  IS DISTINCT FROM OLD.restaurant_payout
     OR NEW.rider_payout       IS DISTINCT FROM OLD.rider_payout
     OR NEW.amount_paid_upfront IS DISTINCT FROM OLD.amount_paid_upfront
     OR NEW.amount_remaining   IS DISTINCT FROM OLD.amount_remaining
     OR NEW.customer_id        IS DISTINCT FROM OLD.customer_id
     OR NEW.restaurant_id      IS DISTINCT FROM OLD.restaurant_id
     OR NEW.payment_option     IS DISTINCT FROM OLD.payment_option
  THEN
    RAISE EXCEPTION 'Cannot modify locked order financial/identity fields';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_lock_financials ON public.orders;
CREATE TRIGGER orders_lock_financials
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.lock_order_financials();

-- 3) Orders: tighten rider self-assign policy
DROP POLICY IF EXISTS "Rider updates assigned orders" ON public.orders;

CREATE POLICY "Rider claims unassigned ready order"
  ON public.orders FOR UPDATE
  USING (rider_id IS NULL AND status = 'ready'::order_status AND public.get_user_role(auth.uid()) = 'rider'::user_role)
  WITH CHECK (rider_id = auth.uid());

CREATE POLICY "Rider updates own assigned order"
  ON public.orders FOR UPDATE
  USING (auth.uid() = rider_id)
  WITH CHECK (auth.uid() = rider_id);

-- 4) rider_profiles: drop broad SELECT, replace with order-party scope
DROP POLICY IF EXISTS "Authenticated can view approved riders" ON public.rider_profiles;

CREATE POLICY "Order parties view assigned rider"
  ON public.rider_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.rider_id = rider_profiles.user_id
        AND (
          o.customer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.restaurants r
            WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()
          )
        )
    )
  );

-- 5) platform_settings: restrict reads to signed-in users only
DROP POLICY IF EXISTS "Public read settings" ON public.platform_settings;
CREATE POLICY "Authenticated read settings"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (true);

-- 6) Storage: remove public read on restaurant-docs, add owner+admin reads
DROP POLICY IF EXISTS "Public reads restaurant docs" ON storage.objects;

CREATE POLICY "Owners read own restaurant docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'restaurant-docs'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin(auth.uid())
    )
  );

-- 7) Storage: allow public read on menu-uploads (needed for menu item images)
DROP POLICY IF EXISTS "Public reads menu uploads" ON storage.objects;
CREATE POLICY "Public reads menu uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-uploads');
