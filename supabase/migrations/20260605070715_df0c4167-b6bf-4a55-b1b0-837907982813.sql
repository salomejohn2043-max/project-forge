
-- 1) restaurants.phone: revoke from anon, keep for authenticated
REVOKE SELECT (phone) ON public.restaurants FROM anon;
-- ensure authenticated keeps full read
GRANT SELECT ON public.restaurants TO authenticated;

-- 2) orders financial fields: revoke from authenticated (only service_role reads)
REVOKE SELECT (markup_amount, restaurant_commission, rider_commission, restaurant_payout, rider_payout)
  ON public.orders FROM authenticated;
REVOKE SELECT (markup_amount, restaurant_commission, rider_commission, restaurant_payout, rider_payout)
  ON public.orders FROM anon;
GRANT ALL ON public.orders TO service_role;

-- 3) group_order_members: trigger to prevent creator from editing financial/payment fields of others
CREATE OR REPLACE FUNCTION public.guard_group_member_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_self boolean;
  is_admin_user boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role bypass
  END IF;
  is_self := (OLD.user_id = auth.uid());
  is_admin_user := public.is_admin(auth.uid());
  IF is_self OR is_admin_user THEN
    RETURN NEW;
  END IF;
  -- Caller is the creator (or someone else): allow only removed_at + drop_reason changes
  IF NEW.subtotal             IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_share    IS DISTINCT FROM OLD.delivery_share
     OR NEW.total_due         IS DISTINCT FROM OLD.total_due
     OR NEW.amount_paid_upfront IS DISTINCT FROM OLD.amount_paid_upfront
     OR NEW.amount_remaining  IS DISTINCT FROM OLD.amount_remaining
     OR NEW.payment_status    IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at           IS DISTINCT FROM OLD.paid_at
     OR NEW.payment_option    IS DISTINCT FROM OLD.payment_option
     OR NEW.user_id           IS DISTINCT FROM OLD.user_id
     OR NEW.group_order_id    IS DISTINCT FROM OLD.group_order_id
     OR NEW.is_creator        IS DISTINCT FROM OLD.is_creator
  THEN
    RAISE EXCEPTION 'Only the member or an admin can modify payment fields';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_group_member_updates ON public.group_order_members;
CREATE TRIGGER guard_group_member_updates
BEFORE UPDATE ON public.group_order_members
FOR EACH ROW EXECUTE FUNCTION public.guard_group_member_updates();

-- 4) menu-uploads bucket: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Public reads menu uploads" ON storage.objects;
CREATE POLICY "Authenticated reads menu uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'menu-uploads');

-- 5) transactions: drop client INSERT policy (server-side only via service role)
DROP POLICY IF EXISTS "Users insert own transactions" ON public.transactions;
GRANT ALL ON public.transactions TO service_role;
