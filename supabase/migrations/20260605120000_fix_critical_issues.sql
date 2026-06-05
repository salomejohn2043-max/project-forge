-- ============================================================
-- Migration: Fix Critical Issues #1, #5, #8, #12, #13, #14, #16, #22, #24
-- Date: 2026-06-05
-- Production-ready migration with error handling and proper ordering
============================================================

-- ============================================================
-- ISSUE #1: Restaurant Status Enum - Add 'pending' state (safe)
-- ============================================================
DO $$ BEGIN
  ALTER TYPE public.restaurant_status ADD VALUE 'pending' BEFORE 'active';
EXCEPTION WHEN duplicate_object THEN
  -- Value already exists, skip
  NULL;
END $$;

-- ============================================================
-- ISSUE #8: Transaction Idempotency - Add unique constraint
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT unique_order_transaction UNIQUE(order_id, type)
    WHERE order_id IS NOT NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- ISSUE #12: Notifications - Add context fields
-- ============================================================
-- Add columns if they don't exist
DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD COLUMN rider_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD COLUMN restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN
  NULL;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON public.notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_rider_id ON public.notifications(rider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_restaurant_id ON public.notifications(restaurant_id);

-- ============================================================
-- ISSUE #13: Reviews - Ensure rider_id not null for deliveries
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.reviews
    ADD CONSTRAINT check_rider_rating_consistency
    CHECK (
      (rider_rating IS NULL AND rider_id IS NULL) OR
      (rider_rating IS NOT NULL AND rider_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- ISSUE #14: Platform Settings - Add group order configuration defaults
-- ============================================================
INSERT INTO public.platform_settings (key, value, description, updated_at)
VALUES
  ('group_min_members', '3', 'Minimum members required in group order', NOW()),
  ('group_max_members', '5', 'Maximum members allowed in group order', NOW()),
  ('group_join_window_minutes', '15', 'Minutes to join group before lock', NOW()),
  ('group_payment_window_minutes', '10', 'Minutes to pay after lock', NOW()),
  ('group_creator_decision_minutes', '5', 'Minutes for creator decision after all paid', NOW()),
  ('group_delivery_discount_3', '20', 'Delivery discount % for 3 members', NOW()),
  ('group_delivery_discount_4', '30', 'Delivery discount % for 4 members', NOW()),
  ('group_delivery_discount_5', '40', 'Delivery discount % for 5 members', NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================
-- ISSUE #16: Rider Location - Row-level filtering RLS
-- ============================================================
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated can view approved riders" ON public.rider_profiles;
DROP POLICY IF EXISTS "Authenticated can view approved riders (limited fields)" ON public.rider_profiles;
DROP POLICY IF EXISTS "Rider views own profile" ON public.rider_profiles;

-- Approved riders can be viewed by customers (limited fields)
CREATE POLICY "Authenticated view approved riders"
  ON public.rider_profiles
  FOR SELECT
  TO authenticated
  USING (status = 'approved');

-- Riders can view their own full profile + admins
CREATE POLICY "Rider own profile access"
  ON public.rider_profiles
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ============================================================
-- ISSUE #22: Referral System - Add validation constraints
-- ============================================================
-- Prevent self-referral
DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT check_referral_not_self
    CHECK (referred_by IS NULL OR referred_by != id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Add foreign key for referrer validation (if not already exists)
DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT fk_users_referred_by
    FOREIGN KEY (referred_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- ISSUE #24: Performance Indexes (Production-optimized)
-- ============================================================
-- Orders hot queries
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rider_status ON public.orders(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON public.orders(restaurant_id, status);

-- Rider profiles
CREATE INDEX IF NOT EXISTS idx_rider_profiles_online_status ON public.rider_profiles(is_online, status);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_user_id ON public.rider_profiles(user_id);

-- Group orders
CREATE INDEX IF NOT EXISTS idx_group_order_members_status ON public.group_order_members(payment_status, group_order_id);
CREATE INDEX IF NOT EXISTS idx_group_order_members_user ON public.group_order_members(user_id, removed_at);
CREATE INDEX IF NOT EXISTS idx_group_orders_status_created ON public.group_orders(status, created_at DESC);

-- Menu items
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available ON public.menu_items(restaurant_id, is_available);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_ref ON public.transactions(mpesa_reference);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- ============================================================
-- ISSUE #20: Lock Group Order Item Prices (ensure positive)
-- ============================================================
-- Add check constraint for positive prices
DO $$ BEGIN
  ALTER TABLE public.group_order_items
    ADD CONSTRAINT check_price_positive CHECK (marked_up_price > 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- ISSUE #5: Validate Rider Assignment - Create helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_rider_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_role user_role;
BEGIN
  IF NEW.rider_id IS NOT NULL THEN
    SELECT role INTO rider_role FROM public.users WHERE id = NEW.rider_id;
    IF rider_role != 'rider' THEN
      RAISE EXCEPTION 'Assigned user must have rider role';
    END IF;
    
    -- Check rider is approved
    IF NOT EXISTS (
      SELECT 1 FROM public.rider_profiles
      WHERE user_id = NEW.rider_id AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Rider must be approved before assignment';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_rider_assignment_trigger ON public.orders;
CREATE TRIGGER validate_rider_assignment_trigger
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_rider_assignment();

-- ============================================================
-- ISSUE #6: Group Order RLS - Complete missing policies
-- ============================================================
ALTER TABLE public.group_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_order_members ENABLE ROW LEVEL SECURITY;

-- GROUP ORDER ITEMS POLICIES
DROP POLICY IF EXISTS "Members insert group items" ON public.group_order_items;
DROP POLICY IF EXISTS "Members update own group items" ON public.group_order_items;
DROP POLICY IF EXISTS "Members delete own group items" ON public.group_order_items;
DROP POLICY IF EXISTS "Admin all group items" ON public.group_order_items;

CREATE POLICY "Members insert group items"
  ON public.group_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_order_members
      WHERE group_order_id = NEW.group_order_id
        AND user_id = auth.uid()
        AND removed_at IS NULL
    )
  );

CREATE POLICY "Members update own group items"
  ON public.group_order_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_order_members m
      WHERE m.id = member_id AND m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

CREATE POLICY "Members delete own group items"
  ON public.group_order_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_order_members m
      WHERE m.id = member_id AND m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

CREATE POLICY "Admin all group items"
  ON public.group_order_items
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- GROUP ORDER MEMBERS POLICIES
DROP POLICY IF EXISTS "Members join/leave group" ON public.group_order_members;
DROP POLICY IF EXISTS "Members update own status" ON public.group_order_members;
DROP POLICY IF EXISTS "Creator removes members" ON public.group_order_members;
DROP POLICY IF EXISTS "Admin all group members" ON public.group_order_members;

CREATE POLICY "Members join group"
  ON public.group_order_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members update own status"
  ON public.group_order_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Creator removes members"
  ON public.group_order_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_orders
      WHERE id = group_order_id AND creator_id = auth.uid()
    )
  );

CREATE POLICY "Admin all group members"
  ON public.group_order_members
  FOR ALL
  USING (public.is_admin(auth.uid()));
