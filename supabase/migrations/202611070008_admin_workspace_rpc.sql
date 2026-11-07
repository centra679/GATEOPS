create or replace function public.admin_manage_unit(
  p_unit_id uuid,
  p_name text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  old_data jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id)
    or nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 160
    or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '42501', message = 'Akses atau data satuan tidak valid.';
  end if;

  select jsonb_build_object('name', name) into old_data
  from public.units where id = p_unit_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Satuan tidak ditemukan.';
  end if;

  update public.units set name = btrim(p_name) where id = p_unit_id;
  perform public._append_audit_log(
    actor_id, p_unit_id, 'unit_renamed', 'unit', p_unit_id::text,
    btrim(p_reason), null, old_data, jsonb_build_object('name', btrim(p_name))
  );
  return p_unit_id;
end;
$$;

create or replace function public.admin_manage_setting(
  p_unit_id uuid,
  p_setting_key text,
  p_setting_value jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  setting_id uuid;
  old_value jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id)
    or p_setting_key is null or p_setting_key !~ '^[a-z][a-z0-9_.-]{1,80}$'
    or p_setting_value is null or pg_column_size(p_setting_value) > 16384
    or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '42501', message = 'Akses atau pengaturan tidak valid.';
  end if;

  select id, setting_value into setting_id, old_value
  from public.system_settings
  where unit_id = p_unit_id and setting_key = p_setting_key
  for update;

  insert into public.system_settings (unit_id, setting_key, setting_value, updated_by)
  values (p_unit_id, p_setting_key, p_setting_value, actor_id)
  on conflict (unit_id, setting_key) do update
  set setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = now()
  returning id into setting_id;

  perform public._append_audit_log(
    actor_id, p_unit_id, 'setting_updated', 'system_setting', setting_id::text,
    btrim(p_reason), null, old_value,
    jsonb_build_object('key', p_setting_key, 'value', p_setting_value)
  );
  return setting_id;
end;
$$;

revoke all on function public.admin_manage_unit(uuid, text, text) from public, anon;
revoke all on function public.admin_manage_setting(uuid, text, jsonb, text) from public, anon;
grant execute on function public.admin_manage_unit(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_manage_setting(uuid, text, jsonb, text) to authenticated, service_role;