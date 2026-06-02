
-- Users: location persistence
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_lat numeric,
  ADD COLUMN IF NOT EXISTS last_lng numeric,
  ADD COLUMN IF NOT EXISTS last_location_name text;

-- Rider profiles: full body photo + rejection reason
ALTER TABLE public.rider_profiles
  ADD COLUMN IF NOT EXISTS full_body_photo_url text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Restaurants: rejection reason
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Storage buckets (private)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('rider-photos', 'rider-photos', false),
  ('menu-uploads', 'menu-uploads', false),
  ('restaurant-docs', 'restaurant-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Rider photos policies: rider manages own folder (user_id prefix), admin sees all
CREATE POLICY "Riders manage own photos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'rider-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'rider-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admin reads rider photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rider-photos' AND public.is_admin(auth.uid()));

-- Menu uploads policies: restaurant owners manage own, admin reads all
CREATE POLICY "Owners manage own menu uploads"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'menu-uploads' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'menu-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admin reads menu uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'menu-uploads' AND public.is_admin(auth.uid()));

-- Restaurant docs (logos, covers, etc.): owner manages, admin reads, public reads (so customers see logos)
CREATE POLICY "Owners manage own restaurant docs"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'restaurant-docs' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'restaurant-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public reads restaurant docs"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'restaurant-docs');
