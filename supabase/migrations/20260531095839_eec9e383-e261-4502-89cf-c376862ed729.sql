
-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('customer', 'rider', 'restaurant_admin', 'admin');
create type rider_status as enum ('pending', 'approved', 'suspended');
create type restaurant_status as enum ('active', 'suspended');
create type order_status as enum (
  'pending','confirmed','preparing','ready','picked_up','in_transit','delivered','cancelled'
);
create type payment_option as enum ('30','50','100');
create type payment_status as enum ('partial','complete','refunded','partially_refunded');
create type notification_type as enum (
  'order_placed','order_confirmed','order_preparing','order_ready','order_picked_up',
  'order_delivered','order_cancelled','payment_received','payment_remaining_due',
  'rider_approved','promotion_approved','refund_issued'
);
create type promotion_status as enum ('pending','approved','rejected','expired');
create type transaction_type as enum ('payment','refund','disbursement','commission');

-- ============================================================
-- updated_at trigger fn
-- ============================================================
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============================================================
-- 1. USERS  (id == auth.users.id)
-- ============================================================
create table public.users (
  id uuid primary key,
  full_name text not null default '',
  phone text unique,
  email text unique,
  role user_role not null default 'customer',
  is_email_verified boolean default false,
  is_phone_verified boolean default false,
  profile_photo_url text,
  wallet_balance numeric(10,2) default 0.00,
  referral_code text unique default substring(md5(random()::text),1,8),
  referred_by uuid references public.users(id),
  loyalty_points integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update on public.users to authenticated;
grant all on public.users to service_role;
alter table public.users enable row level security;
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.update_updated_at();

-- Security-definer helper to avoid recursive RLS when checking role
create or replace function public.get_user_role(uid uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = uid;
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users where id = uid and role = 'admin');
$$;

-- Auto-create user row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "Users view own" on public.users for select using (auth.uid() = id);
create policy "Users update own" on public.users for update using (auth.uid() = id);
create policy "Admin views all users" on public.users for select using (public.is_admin(auth.uid()));
create policy "Admin updates all users" on public.users for update using (public.is_admin(auth.uid()));

-- ============================================================
-- 2. RIDER PROFILES
-- ============================================================
create table public.rider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  id_number text not null,
  vehicle_type text not null,
  vehicle_plate text,
  id_document_url text,
  status rider_status default 'pending',
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  current_lat numeric(10,7),
  current_lng numeric(10,7),
  is_online boolean default false,
  total_deliveries integer default 0,
  average_rating numeric(3,2) default 0.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update on public.rider_profiles to authenticated;
grant all on public.rider_profiles to service_role;
alter table public.rider_profiles enable row level security;
create trigger trg_rider_profiles_updated_at before update on public.rider_profiles
  for each row execute function public.update_updated_at();

create policy "Rider views own profile" on public.rider_profiles for select using (auth.uid() = user_id);
create policy "Rider inserts own profile" on public.rider_profiles for insert with check (auth.uid() = user_id);
create policy "Rider updates own profile" on public.rider_profiles for update using (auth.uid() = user_id);
create policy "Admin all rider profiles" on public.rider_profiles for all using (public.is_admin(auth.uid()));
-- Approved riders visible to restaurants/admin via orders flow; expose minimal read to authenticated for assignment views
create policy "Authenticated can view approved riders" on public.rider_profiles for select
  using (status = 'approved');

-- ============================================================
-- 3. RESTAURANTS
-- ============================================================
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  phone text not null,
  address text not null,
  lat numeric(10,7),
  lng numeric(10,7),
  logo_url text,
  cover_image_url text,
  status restaurant_status default 'active',
  is_open boolean default true,
  opening_time time,
  closing_time time,
  average_rating numeric(3,2) default 0.00,
  total_orders integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select on public.restaurants to anon;
grant select, insert, update, delete on public.restaurants to authenticated;
grant all on public.restaurants to service_role;
alter table public.restaurants enable row level security;
create trigger trg_restaurants_updated_at before update on public.restaurants
  for each row execute function public.update_updated_at();

create policy "Public view active restaurants" on public.restaurants for select using (status = 'active');
create policy "Owner views own restaurant" on public.restaurants for select using (auth.uid() = owner_id);
create policy "Owner inserts own restaurant" on public.restaurants for insert with check (auth.uid() = owner_id);
create policy "Owner updates own restaurant" on public.restaurants for update using (auth.uid() = owner_id);
create policy "Admin all restaurants" on public.restaurants for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 4. MENU CATEGORIES
-- ============================================================
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  display_order integer default 0,
  created_at timestamptz default now()
);
grant select on public.menu_categories to anon;
grant select, insert, update, delete on public.menu_categories to authenticated;
grant all on public.menu_categories to service_role;
alter table public.menu_categories enable row level security;

create policy "Public view menu categories" on public.menu_categories for select using (true);
create policy "Owner manages own categories" on public.menu_categories for all
  using (exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Admin all categories" on public.menu_categories for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 5. MENU ITEMS
-- ============================================================
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  description text,
  base_price numeric(10,2) not null,
  image_url text,
  is_available boolean default true,
  total_orders integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select on public.menu_items to anon;
grant select, insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
alter table public.menu_items enable row level security;
create trigger trg_menu_items_updated_at before update on public.menu_items
  for each row execute function public.update_updated_at();

create policy "Public view menu items" on public.menu_items for select using (true);
create policy "Owner manages own menu items" on public.menu_items for all
  using (exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Admin all menu items" on public.menu_items for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 6. PLATFORM SETTINGS
-- ============================================================
create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  description text,
  updated_by uuid references public.users(id),
  updated_at timestamptz default now()
);
grant select on public.platform_settings to anon, authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
create policy "Public read settings" on public.platform_settings for select using (true);
create policy "Admin writes settings" on public.platform_settings for all using (public.is_admin(auth.uid()));

insert into public.platform_settings (key,value,description) values
  ('markup_percentage','10','Percentage added to restaurant price'),
  ('restaurant_commission_percentage','5','Percentage taken from restaurant per order'),
  ('rider_commission_percentage','5','Percentage taken from rider per delivery'),
  ('delivery_fee_per_km','30','Delivery fee in KES per kilometer'),
  ('min_delivery_fee','50','Minimum delivery fee in KES'),
  ('cancellation_refund_percentage','20','Percentage refunded to customer on self-cancellation'),
  ('loyalty_points_per_order','10','Loyalty points awarded per completed order'),
  ('referral_bonus_points','50','Loyalty points awarded for successful referral');

-- ============================================================
-- 7. ORDERS
-- ============================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id),
  restaurant_id uuid not null references public.restaurants(id),
  rider_id uuid references public.users(id),
  status order_status default 'pending',
  delivery_address text not null,
  delivery_lat numeric(10,7),
  delivery_lng numeric(10,7),
  delivery_distance_km numeric(6,2),
  delivery_fee numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  total_amount numeric(10,2) not null,
  payment_option payment_option not null,
  amount_paid_upfront numeric(10,2) not null,
  amount_remaining numeric(10,2) not null,
  payment_status payment_status default 'partial',
  markup_amount numeric(10,2),
  restaurant_commission numeric(10,2),
  rider_commission numeric(10,2),
  restaurant_payout numeric(10,2),
  rider_payout numeric(10,2),
  restaurant_confirmed_dispatch boolean default false,
  restaurant_confirmed_at timestamptz,
  rider_confirmed_pickup boolean default false,
  rider_confirmed_at timestamptz,
  customer_confirmed_delivery boolean default false,
  customer_confirmed_at timestamptz,
  is_disbursed boolean default false,
  disbursed_at timestamptz,
  cancelled_by uuid references public.users(id),
  cancellation_reason text,
  cancelled_at timestamptz,
  loyalty_points_awarded integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.update_updated_at();

create policy "Customer views own orders" on public.orders for select using (auth.uid() = customer_id);
create policy "Customer creates own orders" on public.orders for insert with check (auth.uid() = customer_id);
create policy "Customer updates own orders" on public.orders for update using (auth.uid() = customer_id);
create policy "Rider views assigned orders" on public.orders for select using (auth.uid() = rider_id);
create policy "Rider views unassigned ready orders" on public.orders for select using (
  rider_id is null and status = 'ready' and public.get_user_role(auth.uid()) = 'rider'
);
create policy "Rider updates assigned orders" on public.orders for update using (
  auth.uid() = rider_id or (rider_id is null and public.get_user_role(auth.uid()) = 'rider')
);
create policy "Restaurant views their orders" on public.orders for select using (
  exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
);
create policy "Restaurant updates their orders" on public.orders for update using (
  exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
);
create policy "Admin all orders" on public.orders for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 8. ORDER ITEMS
-- ============================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  name text not null,
  base_price numeric(10,2) not null,
  marked_up_price numeric(10,2) not null,
  quantity integer not null default 1,
  subtotal numeric(10,2) not null,
  created_at timestamptz default now()
);
grant select, insert on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;

create policy "View order items via order access" on public.order_items for select using (
  exists(
    select 1 from public.orders o
    where o.id = order_id and (
      o.customer_id = auth.uid()
      or o.rider_id = auth.uid()
      or exists(select 1 from public.restaurants r where r.id = o.restaurant_id and r.owner_id = auth.uid())
      or public.is_admin(auth.uid())
    )
  )
);
create policy "Customer inserts items for own order" on public.order_items for insert with check (
  exists(select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

-- ============================================================
-- 9. TRANSACTIONS
-- ============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  user_id uuid references public.users(id),
  type transaction_type not null,
  amount numeric(10,2) not null,
  mpesa_reference text,
  mpesa_phone text,
  description text,
  is_confirmed boolean default false,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);
grant select, insert on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "Users view own transactions" on public.transactions for select using (auth.uid() = user_id);
create policy "Users insert own transactions" on public.transactions for insert with check (auth.uid() = user_id);
create policy "Admin all transactions" on public.transactions for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 10. PROMOTIONS
-- ============================================================
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  title text not null,
  description text,
  discount_percentage numeric(5,2),
  discount_amount numeric(10,2),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status promotion_status default 'pending',
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select on public.promotions to anon;
grant select, insert, update, delete on public.promotions to authenticated;
grant all on public.promotions to service_role;
alter table public.promotions enable row level security;
create trigger trg_promotions_updated_at before update on public.promotions
  for each row execute function public.update_updated_at();

create policy "Public view approved promotions" on public.promotions for select using (status = 'approved');
create policy "Owner manages own promotions" on public.promotions for all
  using (exists(select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Admin all promotions" on public.promotions for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 11. REVIEWS
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  customer_id uuid not null references public.users(id),
  restaurant_id uuid not null references public.restaurants(id),
  rider_id uuid references public.users(id),
  restaurant_rating integer check (restaurant_rating between 1 and 5),
  restaurant_review text,
  rider_rating integer check (rider_rating between 1 and 5),
  rider_review text,
  created_at timestamptz default now()
);
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "Public view reviews" on public.reviews for select using (true);
create policy "Customer creates own review" on public.reviews for insert with check (auth.uid() = customer_id);

-- ============================================================
-- 12. NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id uuid references public.orders(id),
  type notification_type not null,
  title text not null,
  body text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Users view own notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications" on public.notifications for update using (auth.uid() = user_id);
create policy "Insert notifications for self" on public.notifications for insert with check (auth.uid() = user_id);
create policy "Admin all notifications" on public.notifications for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 13. REFERRALS
-- ============================================================
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id),
  referred_id uuid not null references public.users(id),
  bonus_awarded boolean default false,
  awarded_at timestamptz,
  created_at timestamptz default now(),
  unique(referrer_id, referred_id)
);
grant select, insert on public.referrals to authenticated;
grant all on public.referrals to service_role;
alter table public.referrals enable row level security;
create policy "Users view own referrals" on public.referrals for select using (
  auth.uid() = referrer_id or auth.uid() = referred_id
);
create policy "Admin all referrals" on public.referrals for all using (public.is_admin(auth.uid()));

-- ============================================================
-- 14. LOYALTY REDEMPTIONS
-- ============================================================
create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  order_id uuid references public.orders(id),
  points_used integer not null,
  discount_amount numeric(10,2) not null,
  created_at timestamptz default now()
);
grant select, insert on public.loyalty_redemptions to authenticated;
grant all on public.loyalty_redemptions to service_role;
alter table public.loyalty_redemptions enable row level security;
create policy "Users view own redemptions" on public.loyalty_redemptions for select using (auth.uid() = user_id);
create policy "Users create own redemptions" on public.loyalty_redemptions for insert with check (auth.uid() = user_id);
create policy "Admin all redemptions" on public.loyalty_redemptions for all using (public.is_admin(auth.uid()));

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_orders_customer_id on public.orders(customer_id);
create index idx_orders_restaurant_id on public.orders(restaurant_id);
create index idx_orders_rider_id on public.orders(rider_id);
create index idx_orders_status on public.orders(status);
create index idx_order_items_order_id on public.order_items(order_id);
create index idx_menu_items_restaurant_id on public.menu_items(restaurant_id);
create index idx_notifications_user_id on public.notifications(user_id);
create index idx_transactions_order_id on public.transactions(order_id);
create index idx_reviews_restaurant_id on public.reviews(restaurant_id);
create index idx_reviews_rider_id on public.reviews(rider_id);
create index idx_promotions_restaurant_id on public.promotions(restaurant_id);
create index idx_promotions_status on public.promotions(status);

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.order_items;
