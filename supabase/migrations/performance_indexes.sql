/**
 * DATABASE PERFORMANCE — Indexes & Query Optimization
 * 
 * Apply these indexes to your Supabase database to handle 500+ concurrent users.
 * Run in Supabase SQL Editor.
 */

-- ============================================================
-- INDEXES FOR HIGH-TRAFFIC TABLES
-- ============================================================

-- Orders table — most queried
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

-- Notifications — realtime queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- Rider profiles — filtering & approval
CREATE INDEX IF NOT EXISTS idx_rider_profiles_status ON rider_profiles(status);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_user_id ON rider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_online ON rider_profiles(status) WHERE status = 'approved';

-- Restaurants — filtering & search
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner_id ON restaurants(owner_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_open ON restaurants(is_open);

-- Menu items — category filtering
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);

-- Group orders — time-based expiry queries
CREATE INDEX IF NOT EXISTS idx_group_orders_status ON group_orders(status);
CREATE INDEX IF NOT EXISTS idx_group_orders_created ON group_orders(created_at DESC);

-- Transactions — reporting & reconciliation
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_ref ON transactions(mpesa_reference);

-- Users — authentication & role-based queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_by_restaurant_status 
  ON orders(restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_by_rider_status 
  ON orders(rider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_by_user_read 
  ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- CONFIGURATION FOR CONNECTION POOLING (Supabase)
-- ============================================================

-- In Supabase dashboard:
-- Database > Connection Pooling > Enable Pooling
-- - Mode: Transaction
-- - Min pool size: 5 (for 500 concurrent users, recommended 50+)
-- - Max pool size: 100

-- For Cloudflare Workers (your deployment target):
-- Use D1 connector with connection limits

-- ============================================================
-- QUERY OPTIMIZATION TIPS
-- ============================================================

-- ✓ Always use SELECT with specific columns (not SELECT *)
-- ✓ Use .limit() to cap result sets
-- ✓ Add .eq(), .gt(), etc. filters before fetching
-- ✓ Use realtime subscriptions only for critical flows
-- ✓ Cache static data (platform_settings, restaurant lists)
-- ✓ Use React Query's staleTime to reduce API calls
-- ✓ Batch multiple small queries into one RPC call if possible

-- ============================================================
-- UPDATE QUERY PLANNER STATISTICS
-- ============================================================

-- Run ANALYZE after creating indexes so PostgreSQL knows about them
ANALYZE orders;
ANALYZE notifications;
ANALYZE rider_profiles;
ANALYZE restaurants;
ANALYZE menu_items;
ANALYZE group_orders;
ANALYZE transactions;
ANALYZE users;
