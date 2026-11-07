create or replace function public.is_unit_admin(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.user_id = (select auth.uid())
      and membership.unit_id = target_unit_id
      and membership.status = 'active'
      and profile.status = 'active'
      and profile.account_role = 'admin'
  );
$$;

create or replace function public.is_unit_member(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.user_id = (select auth.uid())
      and membership.unit_id = target_unit_id
      and membership.status = 'active'
      and profile.status = 'active'
  );
$$;

create or replace function public.is_active_guard(target_unit_id uuid, target_post_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.temporary_assignments assignment
    join public.profiles profile on profile.id = assignment.personnel_user_id
    where assignment.personnel_user_id = (select auth.uid())
      and assignment.unit_id = target_unit_id
      and (target_post_id is null or assignment.post_id = target_post_id)
      and assignment.revoked_at is null
      and now() >= assignment.starts_at
      and now() < assignment.ends_at
      and public.is_unit_member(target_unit_id)
      and profile.status = 'active'
      and profile.account_role = 'personnel'
  );
$$;

create or replace function public.can_read_visitor_visit(target_visit_id uuid, target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_unit_admin(target_unit_id)
    or exists (
      select 1
      from public.visitor_visits visit
      where visit.id = target_visit_id
        and visit.unit_id = target_unit_id
        and visit.handled_by_user_id = (select auth.uid())
        and public.is_unit_member(target_unit_id)
        and exists (
          select 1
          from public.temporary_assignments assignment
          where assignment.id = visit.assignment_id
            and assignment.personnel_user_id = (select auth.uid())
            and assignment.unit_id = target_unit_id
        )
    );
$$;

create or replace function public.can_access_visitor_object(object_name text, allow_upload boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_unit_id uuid;
  target_visit_id uuid;
begin
  if object_name is null or split_part(object_name, '/', 1) !~ '^[0-9a-fA-F-]{36}$'
    or split_part(object_name, '/', 2) !~ '^[0-9a-fA-F-]{36}$'
    or split_part(object_name, '/', 3) = ''
  then
    return false;
  end if;

  begin
    target_unit_id := split_part(object_name, '/', 1)::uuid;
    target_visit_id := split_part(object_name, '/', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if public.is_unit_admin(target_unit_id) then
    return true;
  end if;

  if allow_upload then
    return exists (
      select 1
      from public.visitor_visits visit
      join public.temporary_assignments assignment on assignment.id = visit.assignment_id
      where visit.id = target_visit_id
        and visit.unit_id = target_unit_id
        and visit.handled_by_user_id = (select auth.uid())
        and assignment.personnel_user_id = (select auth.uid())
        and public.is_active_guard(target_unit_id, visit.post_id)
    );
  end if;

  return public.can_read_visitor_visit(target_visit_id, target_unit_id);
end;
$$;

revoke all on function public.is_unit_admin(uuid) from public, anon;
revoke all on function public.is_unit_member(uuid) from public, anon;
revoke all on function public.is_active_guard(uuid, uuid) from public, anon;
revoke all on function public.can_read_visitor_visit(uuid, uuid) from public, anon;
revoke all on function public.can_access_visitor_object(text, boolean) from public, anon;
grant execute on function public.is_unit_admin(uuid) to authenticated, service_role;
grant execute on function public.is_unit_member(uuid) to authenticated, service_role;
grant execute on function public.is_active_guard(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_read_visitor_visit(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_visitor_object(text, boolean) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'units', 'profiles', 'unit_memberships', 'personnel', 'family_accounts', 'posts',
    'post_qr_codes', 'movement_plans', 'movement_sessions', 'location_sessions',
    'location_points', 'movement_events', 'qr_scan_receipts', 'guard_invites',
    'temporary_assignments', 'visitors', 'visitor_visits', 'visitor_vehicles',
    'visitor_documents', 'guard_reports', 'notifications', 'audit_logs',
    'security_events', 'system_settings', 'auth_identities', 'auth_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

grant select on public.units, public.profiles, public.unit_memberships,
  public.personnel, public.family_accounts, public.posts, public.movement_plans,
  public.movement_sessions, public.movement_events,
  public.temporary_assignments, public.visitors, public.visitor_visits,
  public.visitor_vehicles, public.visitor_documents, public.guard_reports,
  public.notifications, public.audit_logs, public.security_events,
  public.system_settings to authenticated;
grant select (id, unit_id, post_id, personnel_user_id, status, starts_at, ends_at,
  note, created_by, created_at, accepted_at, revoked_at)
  on public.guard_invites to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "Members can read their units" on public.units;
create policy "Members can read their units"
on public.units for select to authenticated
using ((select public.is_unit_member(id)));

drop policy if exists "Users and scoped admins can read profiles" on public.profiles;
create policy "Users and scoped admins can read profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = profiles.id
      and membership.status = 'active'
      and (select public.is_unit_admin(membership.unit_id))
  )
);
create policy "Users update own display name"
on public.profiles for update to authenticated
using (id = (select auth.uid()) and status = 'active')
with check (id = (select auth.uid()) and status = 'active');

drop policy if exists "Users and scoped admins can read memberships" on public.unit_memberships;
create policy "Users and scoped admins can read memberships"
on public.unit_memberships for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_unit_admin(unit_id)));

create policy "Self or unit admin reads personnel"
on public.personnel for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = personnel.id
      and membership.status = 'active'
      and (select public.is_unit_admin(membership.unit_id))
  )
);

create policy "Self or unit admin reads family accounts"
on public.family_accounts for select to authenticated
using (id = (select auth.uid()) or (select public.is_unit_admin(unit_id)));

create policy "Unit members read active posts"
on public.posts for select to authenticated
using ((select public.is_unit_member(unit_id)) and status = 'active');
create policy "Unit admins read all posts"
on public.posts for select to authenticated
using ((select public.is_unit_admin(unit_id)));

create policy "Unit admins read QR codes"
on public.post_qr_codes for select to authenticated
using (exists (select 1 from public.posts post where post.id = post_qr_codes.post_id and (select public.is_unit_admin(post.unit_id))));

create policy "Owners and unit admins read movement plans"
on public.movement_plans for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_unit_admin(unit_id)));

create policy "Owners and unit admins read movement sessions"
on public.movement_sessions for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_unit_admin(unit_id)));

create policy "Owners and unit admins read movement events"
on public.movement_events for select to authenticated
using (
  exists (
    select 1 from public.movement_sessions session
    where session.id = movement_events.movement_session_id
      and (session.user_id = (select auth.uid()) or (select public.is_unit_admin(session.unit_id)))
  )
);

create policy "Users read own location sessions"
on public.location_sessions for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users read own location points"
on public.location_points for select to authenticated
using (user_id = (select auth.uid()));

create policy "Admins read scoped guard invites"
on public.guard_invites for select to authenticated
using ((select public.is_unit_admin(unit_id)) or personnel_user_id = (select auth.uid()));

create policy "Assigned personnel and unit admins read assignments"
on public.temporary_assignments for select to authenticated
using (personnel_user_id = (select auth.uid()) or (select public.is_unit_admin(unit_id)));

create policy "Admins and assigned handlers read visitors"
on public.visitors for select to authenticated
using (
  (select public.is_unit_admin(unit_id))
  or exists (
    select 1 from public.visitor_visits visit
    where visit.visitor_id = visitors.id
      and public.can_read_visitor_visit(visit.id, visitors.unit_id)
  )
);

create policy "Admins and assigned handlers read visits"
on public.visitor_visits for select to authenticated
using (public.can_read_visitor_visit(id, unit_id));

create policy "Admins and assigned handlers read vehicles"
on public.visitor_vehicles for select to authenticated
using (
  exists (
    select 1 from public.visitor_visits visit
    where visit.id = visitor_vehicles.visit_id
      and public.can_read_visitor_visit(visit.id, visit.unit_id)
  )
);

create policy "Admins and assigned handlers read visitor documents"
on public.visitor_documents for select to authenticated
using (
  exists (
    select 1 from public.visitor_visits visit
    where visit.id = visitor_documents.visit_id
      and public.can_read_visitor_visit(visit.id, visit.unit_id)
  )
);

create policy "Admins read guard reports and personnel read own reports"
on public.guard_reports for select to authenticated
using (
  (select public.is_unit_admin(unit_id))
  or exists (
    select 1 from public.temporary_assignments assignment
    where assignment.id = guard_reports.assignment_id
      and assignment.personnel_user_id = (select auth.uid())
  )
);

create policy "Users read own notifications"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users mark own notifications read"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Unit admins read audit logs"
on public.audit_logs for select to authenticated
using (unit_id is not null and (select public.is_unit_admin(unit_id)));
create policy "Unit admins read security events"
on public.security_events for select to authenticated
using (unit_id is not null and (select public.is_unit_admin(unit_id)));
create policy "Unit admins read settings"
on public.system_settings for select to authenticated
using (unit_id is null or (select public.is_unit_admin(unit_id)));

create policy "Authorized users read visitor documents"
on storage.objects for select to authenticated
using (bucket_id = 'visitor-documents' and public.can_access_visitor_object(name, false));
create policy "Authorized handlers upload visitor documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'visitor-documents' and public.can_access_visitor_object(name, true));
create policy "Unit admins delete visitor documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'visitor-documents'
  and public.can_access_visitor_object(name, false)
  and public.is_unit_admin(split_part(name, '/', 1)::uuid)
);