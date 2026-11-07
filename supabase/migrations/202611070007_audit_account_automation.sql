create or replace function public.audit_profile_display_name_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership_row record;
  found_membership boolean := false;
begin
  if new.display_name is not distinct from old.display_name then
    return new;
  end if;

  for membership_row in
    select unit_id from public.unit_memberships
    where user_id = new.id and status = 'active'
  loop
    found_membership := true;
    perform public._append_audit_log(
      actor_id, membership_row.unit_id, 'profile_display_name_changed', 'profile', new.id::text,
      null, null, jsonb_build_object('display_name', old.display_name),
      jsonb_build_object('display_name', new.display_name)
    );
  end loop;
  if not found_membership then
    perform public._append_audit_log(
      actor_id, null, 'profile_display_name_changed', 'profile', new.id::text,
      null, null, jsonb_build_object('display_name', old.display_name),
      jsonb_build_object('display_name', new.display_name)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_profile_display_name_change() from public, anon, authenticated, service_role;

create trigger profiles_audit_display_name
after update of display_name on public.profiles
for each row execute function public.audit_profile_display_name_change();

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_unit_id uuid,
  p_status public.record_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  old_status public.record_status;
begin
  if actor_id is null or actor_id = p_user_id or p_status is null
    or nullif(btrim(p_reason), '') is null or not public.is_unit_admin(p_unit_id)
  then
    raise exception using errcode = '42501', message = 'Akses atau data tindakan tidak valid.';
  end if;

  if not exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = p_user_id and membership.unit_id = p_unit_id and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Akun berada di luar cakupan satuan.';
  end if;

  select status into old_status from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Akun tidak ditemukan.';
  end if;
  if old_status = p_status then
    raise exception using errcode = '22023', message = 'Status akun sudah sesuai.';
  end if;

  update public.profiles set status = p_status where id = p_user_id;
  perform public._append_audit_log(actor_id, p_unit_id, 'account_' || p_status::text, 'profile', p_user_id::text,
    btrim(p_reason), null, jsonb_build_object('status', old_status), jsonb_build_object('status', p_status));
  perform public._notify_user(p_user_id, p_unit_id, 'account_status_changed', jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.expire_due_movement_plans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_row record;
  affected integer := 0;
begin
  for plan_row in
    update public.movement_plans plan
    set status = 'expired'
    where plan.status = 'approved' and plan.planned_return_at <= now()
    returning plan.id, plan.unit_id, plan.user_id
  loop
    perform public._append_audit_log(null, plan_row.unit_id, 'movement_plan_expired', 'movement_plan', plan_row.id::text);
    perform public._notify_user(plan_row.user_id, plan_row.unit_id, 'movement_plan_expired', jsonb_build_object('plan_id', plan_row.id));
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

create or replace function public.run_scheduled_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_plans integer;
  generated_reports integer;
begin
  expired_plans := public.expire_due_movement_plans();
  generated_reports := public.generate_due_guard_reports();
  return jsonb_build_object('expired_plans', expired_plans, 'generated_reports', generated_reports);
end;
$$;

revoke all on function public.admin_set_account_status(uuid, uuid, public.record_status, text) from public, anon;
revoke all on function public.expire_due_movement_plans() from public, anon, authenticated;
revoke all on function public.run_scheduled_maintenance() from public, anon, authenticated;
grant execute on function public.admin_set_account_status(uuid, uuid, public.record_status, text) to authenticated, service_role;
grant execute on function public.expire_due_movement_plans() to service_role;
grant execute on function public.run_scheduled_maintenance() to service_role;