create table public.bootstrap_state (
  singleton boolean primary key default true check (singleton),
  completed_by uuid references public.profiles (id) on delete restrict,
  completed_at timestamptz
);

insert into public.bootstrap_state (singleton) values (true);
alter table public.bootstrap_state enable row level security;
revoke all on public.bootstrap_state from public, anon, authenticated;
grant all on public.bootstrap_state to service_role;

create or replace function public.consume_auth_attempt(p_identity_hash text, p_ip_hash text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  limit_row public.auth_rate_limits%rowtype;
  next_count integer;
  now_at timestamptz := now();
begin
  if p_identity_hash is null or p_identity_hash !~ '^[0-9a-f]{64}$'
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
  then
    raise exception using errcode = '22023', message = 'Rate limit key tidak valid.';
  end if;

  for candidate in
    select key_hash, max_attempts
    from (values (p_identity_hash, 8), (p_ip_hash, 30)) as keys(key_hash, max_attempts)
    where key_hash is not null
    order by key_hash
  loop
    insert into public.auth_rate_limits (key_hash)
    values (candidate.key_hash)
    on conflict (key_hash) do nothing;

    select * into limit_row
    from public.auth_rate_limits
    where key_hash = candidate.key_hash
    for update;

    if limit_row.locked_until is not null and limit_row.locked_until > now_at then
      return false;
    end if;

    if limit_row.window_started_at <= now_at - interval '15 minutes' then
      update public.auth_rate_limits
      set attempt_count = 0, window_started_at = now_at, locked_until = null
      where key_hash = candidate.key_hash;
      limit_row.attempt_count := 0;
    end if;

    if limit_row.attempt_count >= candidate.max_attempts then
      update public.auth_rate_limits
      set locked_until = now_at + interval '15 minutes', updated_at = now_at
      where key_hash = candidate.key_hash;
      return false;
    end if;

    next_count := limit_row.attempt_count + 1;
    update public.auth_rate_limits
    set attempt_count = next_count, updated_at = now_at
    where key_hash = candidate.key_hash;
  end loop;

  return true;
end;
$$;

create or replace function public.clear_auth_attempt(p_identity_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_rate_limits where key_hash = p_identity_hash;
$$;

create or replace function public.record_auth_event(
  p_user_id uuid,
  p_role public.account_role,
  p_action text,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_id uuid;
begin
  if p_action not in ('login_success', 'login_failure', 'login_rate_limited')
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
  then
    raise exception using errcode = '22023', message = 'Peristiwa autentikasi tidak valid.';
  end if;

  if p_user_id is not null then
    select membership.unit_id into unit_id
    from public.unit_memberships membership
    where membership.user_id = p_user_id and membership.status = 'active'
    order by membership.created_at
    limit 1;
  end if;

  insert into public.audit_logs (actor_user_id, unit_id, action, entity_type, entity_id, after_data)
  values (
    p_user_id, unit_id, p_action, 'authentication', p_user_id::text,
    jsonb_build_object('role', p_role, 'ip_hash', p_ip_hash)
  );

  if p_action <> 'login_success' then
    insert into public.security_events (unit_id, actor_user_id, event_type, severity, details)
    values (unit_id, p_user_id, p_action, 'warning', jsonb_build_object('role', p_role, 'ip_hash', p_ip_hash));
  end if;
end;
$$;

create or replace function public.provision_account(
  p_actor_user_id uuid,
  p_new_user_id uuid,
  p_role public.account_role,
  p_identifier text,
  p_identifier_hash text,
  p_auth_email text,
  p_display_name text,
  p_unit_id uuid,
  p_related_personnel_id uuid default null,
  p_rank text default null,
  p_position text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if p_actor_user_id is null or p_new_user_id is null or p_actor_user_id = p_new_user_id
    or p_role is null or p_identifier_hash !~ '^[0-9a-f]{64}$'
    or p_auth_email is null or p_auth_email !~ '^[0-9a-f-]{36}@auth[.]gateops[.]invalid$'
    or nullif(btrim(p_display_name), '') is null or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '22023', message = 'Data akun tidak valid.';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    join public.unit_memberships membership on membership.user_id = actor.id
    where actor.id = p_actor_user_id and actor.account_role = 'admin'
      and actor.status = 'active' and membership.unit_id = p_unit_id and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Admin tidak berwenang pada satuan ini.';
  end if;
  if not exists (select 1 from auth.users where id = p_new_user_id) then
    raise exception using errcode = '22023', message = 'Akun autentikasi belum tersedia.';
  end if;
  if not exists (select 1 from public.units where id = p_unit_id) then
    raise exception using errcode = '22023', message = 'Satuan tidak ditemukan.';
  end if;

  if p_role in ('admin', 'personnel') and p_identifier !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'NRP tidak valid.';
  end if;
  if p_role = 'admin' and p_identifier !~ '^[0-9]{7}$' then
    raise exception using errcode = '22023', message = 'NRP admin harus tujuh digit.';
  end if;
  if p_role = 'family' and (p_identifier <> upper(btrim(p_identifier)) or p_identifier !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$') then
    raise exception using errcode = '22023', message = 'Kode akun keluarga tidak valid.';
  end if;
  if p_role = 'family' and p_related_personnel_id is null then
    raise exception using errcode = '22023', message = 'Personel penghubung wajib dipilih.';
  end if;
  if p_role <> 'family' and p_related_personnel_id is not null then
    raise exception using errcode = '22023', message = 'Relasi keluarga tidak sesuai jenis akun.';
  end if;

  insert into public.profiles (id, display_name, account_role, status)
  values (p_new_user_id, btrim(p_display_name), p_role, 'active');
  insert into public.unit_memberships (unit_id, user_id, status)
  values (p_unit_id, p_new_user_id, 'active');

  if p_role = 'personnel' then
    insert into public.personnel (id, nrp, rank, position)
    values (p_new_user_id, p_identifier, nullif(btrim(p_rank), ''), nullif(btrim(p_position), ''));
  elsif p_role = 'family' then
    if not exists (
      select 1 from public.personnel personnel
      join public.unit_memberships membership on membership.user_id = personnel.id
      where personnel.id = p_related_personnel_id
        and membership.unit_id = p_unit_id and membership.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Personel penghubung tidak berada di satuan ini.';
    end if;
    insert into public.family_accounts (id, family_code, related_personnel_id, unit_id)
    values (p_new_user_id, p_identifier, p_related_personnel_id, p_unit_id);
  end if;

  insert into public.auth_identities (user_id, account_role, identifier_hash, auth_email)
  values (p_new_user_id, p_role, p_identifier_hash, p_auth_email);
  perform public._append_audit_log(p_actor_user_id, p_unit_id, 'account_created', 'profile', p_new_user_id::text, btrim(p_reason), null, null,
    jsonb_build_object('role', p_role));
  return p_new_user_id;
end;
$$;

create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_identifier text,
  p_identifier_hash text,
  p_auth_email text,
  p_display_name text,
  p_unit_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.bootstrap_state%rowtype;
  unit_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Bootstrap requires an auth user.';
  end if;
  if p_identifier is null or p_identifier !~ '^[0-9]{7}$' then
    raise exception using errcode = '22023', message = 'Bootstrap requires a seven-digit admin identifier.';
  end if;
  if p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Bootstrap identity hash is invalid.';
  end if;
  if p_auth_email is null or p_auth_email !~ '^[0-9a-f-]{36}@auth[.]gateops[.]invalid$' then
    raise exception using errcode = '22023', message = 'Bootstrap auth mapping is invalid.';
  end if;
  if nullif(btrim(p_display_name), '') is null or char_length(btrim(p_display_name)) > 160
    or nullif(btrim(p_unit_name), '') is null or char_length(btrim(p_unit_name)) > 160
  then
    raise exception using errcode = '22023', message = 'Bootstrap profile data is invalid.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = '22023', message = 'Akun autentikasi belum tersedia.';
  end if;

  select * into state_row from public.bootstrap_state where singleton for update;
  if state_row.completed_at is not null or exists (
    select 1 from public.profiles where account_role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Bootstrap admin sudah ditutup.';
  end if;

  select id into unit_id from public.units where lower(name) = lower(btrim(p_unit_name)) limit 1;
  if unit_id is null then
    insert into public.units (name) values (btrim(p_unit_name)) returning id into unit_id;
  end if;

  insert into public.profiles (id, display_name, account_role, status)
  values (p_user_id, btrim(p_display_name), 'admin', 'active');
  insert into public.unit_memberships (unit_id, user_id, status)
  values (unit_id, p_user_id, 'active');
  insert into public.auth_identities (user_id, account_role, identifier_hash, auth_email)
  values (p_user_id, 'admin', p_identifier_hash, p_auth_email);
  update public.bootstrap_state set completed_by = p_user_id, completed_at = now() where singleton;
  insert into public.audit_logs (actor_user_id, unit_id, action, entity_type, entity_id, after_data)
  values (p_user_id, unit_id, 'bootstrap_admin_created', 'profile', p_user_id::text, jsonb_build_object('role', 'admin'));
  return unit_id;
end;
$$;

revoke all on function public.consume_auth_attempt(text, text) from public, anon, authenticated;
revoke all on function public.clear_auth_attempt(text) from public, anon, authenticated;
revoke all on function public.record_auth_event(uuid, public.account_role, text, text) from public, anon, authenticated;
revoke all on function public.provision_account(uuid, uuid, public.account_role, text, text, text, text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bootstrap_first_admin(uuid, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.consume_auth_attempt(text, text) to service_role;
grant execute on function public.clear_auth_attempt(text) to service_role;
grant execute on function public.record_auth_event(uuid, public.account_role, text, text) to service_role;
grant execute on function public.provision_account(uuid, uuid, public.account_role, text, text, text, text, uuid, uuid, text, text, text) to service_role;
grant execute on function public.bootstrap_first_admin(uuid, text, text, text, text, text) to service_role;