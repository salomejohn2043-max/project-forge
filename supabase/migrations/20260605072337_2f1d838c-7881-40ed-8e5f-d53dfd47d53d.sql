DROP VIEW IF EXISTS public.restaurant_public;

GRANT SELECT (
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
) ON public.restaurants TO anon;
REVOKE SELECT (phone, owner_id, rejection_reason) ON public.restaurants FROM anon;

DROP POLICY IF EXISTS "Public view active restaurants" ON public.restaurants;
CREATE POLICY "Public view active restaurants"
  ON public.restaurants FOR SELECT
  TO anon
  USING (status = 'active'::public.restaurant_status);

CREATE VIEW public.restaurant_public
WITH (security_invoker = true, security_barrier = true)
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