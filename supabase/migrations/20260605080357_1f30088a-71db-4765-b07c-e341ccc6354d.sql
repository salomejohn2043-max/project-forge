-- Restore column-level grants on orders to authenticated.
-- RLS already restricts rows to the customer, assigned rider, restaurant owner, or admin.
-- A customer SHOULD see their own order's breakdown; rider needs rider_payout; restaurant owner needs payouts.
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;

-- Restore phone read for authenticated (anonymous still blocked via restaurant_public view).
GRANT SELECT ON public.restaurants TO authenticated;

-- transactions: allow users to insert their own transaction rows (checkout flow).
-- service_role still used for server-side payment confirmations.
DROP POLICY IF EXISTS "Users insert own transactions" ON public.transactions;
CREATE POLICY "Users insert own transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.transactions TO authenticated;