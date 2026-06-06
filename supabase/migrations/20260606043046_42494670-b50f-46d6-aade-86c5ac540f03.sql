
-- 1. Remove anon access to restaurants (phone column was leaking)
DROP POLICY IF EXISTS "Public view active restaurants" ON public.restaurants;

-- 2. Allow public read of menu-uploads bucket so menu images render
DROP POLICY IF EXISTS "Public read menu-uploads" ON storage.objects;
CREATE POLICY "Public read menu-uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-uploads');
