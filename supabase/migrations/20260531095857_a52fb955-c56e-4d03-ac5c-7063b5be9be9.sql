
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.get_user_role(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
-- keep execute for authenticated (used inside RLS policies)
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
