drop policy if exists "Users and scoped admins can read profiles" on public.profiles;
create policy "Users and scoped admins can read profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = profiles.id
      and (select public.is_unit_admin(membership.unit_id))
  )
);

drop policy if exists "Self or unit admin reads personnel" on public.personnel;
create policy "Self or unit admin reads personnel"
on public.personnel for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = personnel.id
      and (select public.is_unit_admin(membership.unit_id))
  )
);