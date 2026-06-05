-- Public-safe restaurant projection that excludes sensitive owner phone numbers.
CREATE OR REPLACE VIEW public.restaurant_public
WITH (security_barrier = true)
AS
SELECT
  id,
  name,
  description,
  address,
  lat,
  lng,
  logo_url,
  cover_image_url,
  status,
  is_open,
  opening_time,
  closing_time,
  average_rating,
  total_orders,
  created_at,
  updated_at
FROM public.restaurants
WHERE status = 'active'::public.restaurant_status;

GRANT SELECT ON public.restaurant_public TO anon, authenticated;
GRANT ALL ON public.restaurant_public TO service_role;

-- Remove direct anonymous table reads; public pages must use the safe view above.
REVOKE SELECT ON public.restaurants FROM anon;
DROP POLICY IF EXISTS "Public view active restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Authenticated view active restaurants" ON public.restaurants;
CREATE POLICY "Authenticated view active restaurants"
  ON public.restaurants FOR SELECT
  TO authenticated
  USING (status = 'active'::public.restaurant_status);

-- Recompute order delivery fee and all derived financials for user-created orders.
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
  s_delivery_per_km numeric;
  s_min_delivery_fee numeric;
  base_subtotal numeric;
  payment_pct int;
  rest_lat numeric;
  rest_lng numeric;
  km_float double precision;
BEGIN
  -- Trusted server flows compute their own financials, including group-order discounts.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value::numeric INTO s_markup FROM public.platform_settings WHERE key = 'markup_percentage';
  SELECT value::numeric INTO s_rest_comm FROM public.platform_settings WHERE key = 'restaurant_commission_percentage';
  SELECT value::numeric INTO s_rider_comm FROM public.platform_settings WHERE key = 'rider_commission_percentage';
  SELECT value::numeric INTO s_delivery_per_km FROM public.platform_settings WHERE key = 'delivery_fee_per_km';
  SELECT value::numeric INTO s_min_delivery_fee FROM public.platform_settings WHERE key = 'min_delivery_fee';
  s_markup := COALESCE(s_markup, 10);
  s_rest_comm := COALESCE(s_rest_comm, 5);
  s_rider_comm := COALESCE(s_rider_comm, 5);
  s_delivery_per_km := COALESCE(s_delivery_per_km, 30);
  s_min_delivery_fee := COALESCE(s_min_delivery_fee, 50);

  IF NEW.subtotal < 0 THEN
    RAISE EXCEPTION 'Invalid order amounts';
  END IF;

  SELECT r.lat, r.lng INTO rest_lat, rest_lng
  FROM public.restaurants r
  WHERE r.id = NEW.restaurant_id;

  IF NEW.delivery_lat IS NOT NULL AND NEW.delivery_lng IS NOT NULL AND rest_lat IS NOT NULL AND rest_lng IS NOT NULL THEN
    km_float := 2 * 6371 * asin(sqrt(
      power(sin(radians((NEW.delivery_lat::double precision - rest_lat::double precision) / 2)), 2) +
      cos(radians(rest_lat::double precision)) *
      cos(radians(NEW.delivery_lat::double precision)) *
      power(sin(radians((NEW.delivery_lng::double precision - rest_lng::double precision) / 2)), 2)
    ));
    NEW.delivery_distance_km := round(km_float::numeric, 2);
  ELSE
    NEW.delivery_distance_km := round(greatest(coalesce(NEW.delivery_distance_km, 0), 0), 2);
  END IF;

  NEW.delivery_fee := greatest(s_min_delivery_fee, round(NEW.delivery_distance_km * s_delivery_per_km));

  -- Derive base subtotal from declared subtotal (subtotal includes markup).
  base_subtotal := NEW.subtotal / (1 + s_markup / 100.0);

  NEW.markup_amount := round(NEW.subtotal - base_subtotal);
  NEW.restaurant_commission := round(base_subtotal * s_rest_comm / 100.0);
  NEW.rider_commission := round(NEW.delivery_fee * s_rider_comm / 100.0);
  NEW.restaurant_payout := round(base_subtotal - NEW.restaurant_commission);
  NEW.rider_payout := round(NEW.delivery_fee - NEW.rider_commission);
  NEW.total_amount := NEW.subtotal + NEW.delivery_fee;

  payment_pct := COALESCE(NULLIF(NEW.payment_option::text, '')::int, 100);
  IF payment_pct NOT IN (30, 50, 100) THEN
    RAISE EXCEPTION 'Invalid payment_option';
  END IF;

  NEW.amount_paid_upfront := round(NEW.total_amount * payment_pct / 100.0);
  NEW.amount_remaining := NEW.total_amount - NEW.amount_paid_upfront;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_compute_financials ON public.orders;
CREATE TRIGGER orders_compute_financials
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_order_financials();

-- Recompute group order item prices from trusted menu data on every insert/update.
CREATE OR REPLACE FUNCTION public.compute_group_order_item_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_markup numeric;
  menu_base numeric;
  menu_name text;
  menu_restaurant_id uuid;
  menu_available boolean;
  group_restaurant_id uuid;
  group_status public.group_order_status;
  member_ok boolean;
BEGIN
  SELECT value::numeric INTO s_markup FROM public.platform_settings WHERE key = 'markup_percentage';
  s_markup := COALESCE(s_markup, 10);

  SELECT mi.base_price, mi.name, mi.restaurant_id, COALESCE(mi.is_available, true)
    INTO menu_base, menu_name, menu_restaurant_id, menu_available
  FROM public.menu_items mi
  WHERE mi.id = NEW.menu_item_id;

  IF menu_base IS NULL THEN
    RAISE EXCEPTION 'Menu item not found';
  END IF;
  IF NOT menu_available THEN
    RAISE EXCEPTION 'Menu item is unavailable';
  END IF;

  SELECT g.restaurant_id, g.status INTO group_restaurant_id, group_status
  FROM public.group_orders g
  WHERE g.id = NEW.group_order_id;

  IF group_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Group order not found';
  END IF;
  IF group_status <> 'open'::public.group_order_status THEN
    RAISE EXCEPTION 'Group order is not open for item changes';
  END IF;
  IF menu_restaurant_id <> group_restaurant_id THEN
    RAISE EXCEPTION 'Menu item does not belong to this restaurant';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.group_order_members m
    WHERE m.id = NEW.member_id
      AND m.group_order_id = NEW.group_order_id
      AND m.removed_at IS NULL
  ) INTO member_ok;
  IF NOT member_ok THEN
    RAISE EXCEPTION 'Invalid group order member';
  END IF;

  IF COALESCE(NEW.quantity, 0) < 1 OR NEW.quantity > 99 THEN
    RAISE EXCEPTION 'Invalid item quantity';
  END IF;

  NEW.name := menu_name;
  NEW.base_price := menu_base;
  NEW.marked_up_price := round(menu_base * (1 + s_markup / 100.0));
  NEW.subtotal := NEW.marked_up_price * NEW.quantity;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS group_order_items_compute_financials ON public.group_order_items;
CREATE TRIGGER group_order_items_compute_financials
  BEFORE INSERT OR UPDATE ON public.group_order_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_group_order_item_financials();

-- Reset financial fields on group membership insert so clients cannot self-assign totals/payments.
CREATE OR REPLACE FUNCTION public.compute_group_order_member_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_creator uuid;
  group_status public.group_order_status;
BEGIN
  SELECT g.creator_id, g.status INTO group_creator, group_status
  FROM public.group_orders g
  WHERE g.id = NEW.group_order_id;

  IF group_creator IS NULL THEN
    RAISE EXCEPTION 'Group order not found';
  END IF;
  IF group_status <> 'open'::public.group_order_status THEN
    RAISE EXCEPTION 'Group order is not open for joining';
  END IF;

  NEW.is_creator := (NEW.user_id = group_creator);
  NEW.subtotal := 0;
  NEW.delivery_share := 0;
  NEW.total_due := 0;
  NEW.amount_paid_upfront := 0;
  NEW.amount_remaining := 0;
  NEW.payment_status := 'pending'::public.group_member_payment_status;
  NEW.paid_at := NULL;
  NEW.payment_option := NULL;
  NEW.removed_at := NULL;
  NEW.drop_reason := NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS group_order_members_insert_defaults ON public.group_order_members;
CREATE TRIGGER group_order_members_insert_defaults
  BEFORE INSERT ON public.group_order_members
  FOR EACH ROW EXECUTE FUNCTION public.compute_group_order_member_insert_defaults();

-- Remove broad read access to private menu upload files.
DROP POLICY IF EXISTS "Public reads menu uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated reads menu uploads" ON storage.objects;