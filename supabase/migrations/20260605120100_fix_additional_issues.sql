-- ============================================================
-- Migration: Fix Additional Issues #2, #3, #4, #17, #18, #19
-- Date: 2026-06-05
-- ============================================================

-- ============================================================
-- ISSUE #2 & #17: Rider Approval and Role Validation
-- Add cached role lookup to avoid recursive RLS calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role_cached(uid uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = uid LIMIT 1),
    'customer'
  );
$$;

-- ============================================================
-- ISSUE #3: Order Cancellation Status Validation
-- Add trigger to prevent invalid status transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_order_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow cancellation from pending, confirmed, or preparing states
  -- Cannot cancel if already picked_up or in_transit
  IF NEW.cancelled_by IS NOT NULL AND NEW.cancelled_at IS NOT NULL THEN
    IF OLD.status IN ('picked_up', 'in_transit', 'delivered') THEN
      RAISE EXCEPTION 'Cannot cancel order in % state', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_order_cancellation_trigger ON public.orders;
CREATE TRIGGER validate_order_cancellation_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by)
  EXECUTE FUNCTION public.validate_order_cancellation();

-- ============================================================
-- ISSUE #4: Group Member Payment Option Validation
-- Add CHECK constraint to ensure payment_option is valid if set
-- ============================================================
ALTER TABLE public.group_order_members
  ADD CONSTRAINT check_payment_option_valid
  CHECK (payment_option IS NULL OR payment_option IN (30, 50, 100));

-- ============================================================
-- ISSUE #18: Order Rider Assignment Status Validation
-- Already handled by validate_rider_assignment trigger in main migration
-- ============================================================

-- ============================================================
-- ISSUE #19: Cart Item Validation at Checkout
-- Add function to verify menu items haven't changed
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_cart_items_available(
  p_restaurant_id uuid,
  p_items jsonb  -- array of {menu_item_id, quantity}
)
RETURNS TABLE(menu_item_id uuid, available boolean, current_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.id,
    (mi.is_available AND r.is_open AND r.status = 'active'),
    mi.base_price
  FROM public.menu_items mi
  JOIN public.restaurants r ON r.id = mi.restaurant_id
  WHERE r.id = p_restaurant_id
    AND mi.id = ANY(ARRAY(SELECT jsonb_array_elements(p_items)->>0)::uuid[])
$$;

-- ============================================================
-- ISSUE #22: Referral System Self-Reference Prevention
-- Drop old constraint and add proper trigger
-- ============================================================
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS check_referral_not_self,
  DROP CONSTRAINT IF EXISTS check_referral_exists;

CREATE OR REPLACE FUNCTION public.validate_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User cannot refer themselves
  IF NEW.referred_by IS NOT NULL AND NEW.referred_by = NEW.id THEN
    RAISE EXCEPTION 'User cannot refer themselves';
  END IF;

  -- Referred_by must exist and be a different user
  IF NEW.referred_by IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.referred_by) THEN
      RAISE EXCEPTION 'Referral code does not exist';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_referral_trigger ON public.users;
CREATE TRIGGER validate_referral_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_referral();

-- ============================================================
-- ISSUE #3: Financial Calculation Consistency
-- Add comment-based documentation on the expected behavior
-- ============================================================
COMMENT ON FUNCTION public.compute_order_financials() IS
'Order financial trigger: Accepts cart subtotal (which includes markup) and computes:
- markup_amount: difference from base_price to subtotal
- restaurant_commission: percentage of base_subtotal
- rider_commission: percentage of delivery_fee
- payouts: after commission deduction
Frontend and trigger must agree on: subtotal = base_subtotal * (1 + markup%)';

-- ============================================================
-- ISSUE #6: Order Cancellation Refund Logic
-- Add trigger to handle refunds when orders are cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_order_cancellation_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refund_amount numeric;
  cancellation_pct numeric;
BEGIN
  IF NEW.cancelled_by IS NOT NULL AND OLD.cancelled_by IS NULL THEN
    -- Get cancellation refund percentage from settings
    SELECT (value::numeric) INTO cancellation_pct
    FROM public.platform_settings
    WHERE key = 'cancellation_refund_percentage'
    LIMIT 1;
    
    cancellation_pct := COALESCE(cancellation_pct, 20);

    -- Only refund if customer cancelled and customer can be refunded
    IF NEW.cancelled_by = NEW.customer_id AND NEW.amount_paid_upfront > 0 THEN
      refund_amount := ROUND(NEW.amount_paid_upfront * cancellation_pct / 100.0);
      
      -- Add refund to customer wallet
      UPDATE public.users
      SET wallet_balance = wallet_balance + refund_amount
      WHERE id = NEW.customer_id;

      -- Record refund transaction
      INSERT INTO public.transactions(
        order_id, user_id, type, amount,
        description, is_confirmed, confirmed_at
      ) VALUES (
        NEW.id, NEW.customer_id, 'refund', refund_amount,
        'Order cancellation refund (' || cancellation_pct || '%)',
        true, NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS handle_order_cancellation_refund_trigger ON public.orders;
CREATE TRIGGER handle_order_cancellation_refund_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by)
  EXECUTE FUNCTION public.handle_order_cancellation_refund();
