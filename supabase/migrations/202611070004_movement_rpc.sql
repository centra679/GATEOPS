create or replace function public._append_audit_log(
  p_actor uuid,
  p_unit uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_reason text default null,
  p_request_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_user_id, unit_id, action, entity_type, entity_id, reason,
    request_id, before_data, after_data
  ) values (
    p_actor, p_unit, p_action, p_entity_type, p_entity_id, p_reason,
    p_request_id, p_before, p_after
  );
$$;

create or replace function public._notify_user(
  p_user uuid,
  p_unit uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, unit_id, notification_type, payload)
  values (p_user, p_unit, p_type, coalesce(p_payload, '{}'::jsonb));
$$;

revoke all on function public._append_audit_log(uuid, uuid, text, text, text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public._notify_user(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.create_movement_plan(
  p_unit_id uuid,
  p_departure_at timestamptz,
  p_planned_return_at timestamptz,
  p_destination text,
  p_purpose text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  plan_id uuid;
  expired_plan record;
begin
  if actor_id is null or not public.is_unit_member(p_unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_id
      and profile.status = 'active'
      and profile.account_role in ('personnel', 'family')
  ) then
    raise exception using errcode = '42501', message = 'Akun tidak dapat membuat rencana izin.';
  end if;

  if not exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = actor_id and membership.unit_id = p_unit_id and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Satuan tidak valid.';
  end if;

  if exists (
    select 1 from public.profiles profile
    where profile.id = actor_id and profile.account_role = 'family'
  ) and not exists (
    select 1 from public.family_accounts family
    where family.id = actor_id and family.unit_id = p_unit_id
  ) then
    raise exception using errcode = '42501', message = 'Satuan akun keluarga tidak sesuai.';
  end if;

  if p_departure_at is null or p_planned_return_at is null
    or p_departure_at <= now() or p_planned_return_at <= p_departure_at
    or nullif(btrim(p_destination), '') is null
    or nullif(btrim(p_purpose), '') is null
  then
    raise exception using errcode = '22023', message = 'Tanggal, waktu, tujuan, dan keperluan harus valid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
  if exists (
    select 1 from public.movement_sessions session
    where session.user_id = actor_id and session.ended_at is null
  ) then
    raise exception using errcode = '23505', message = 'Sesi keluar aktif harus diselesaikan terlebih dahulu.';
  end if;

  for expired_plan in
    update public.movement_plans plan
    set status = 'expired'
    where plan.user_id = actor_id
      and plan.unit_id = p_unit_id
      and plan.status = 'approved'
      and plan.planned_return_at <= now()
    returning plan.id
  loop
    perform public._append_audit_log(actor_id, p_unit_id, 'plan_expired', 'movement_plan', expired_plan.id::text);
  end loop;

  insert into public.movement_plans (
    user_id, unit_id, departure_at, planned_return_at, destination, purpose, notes, status
  ) values (
    actor_id, p_unit_id, p_departure_at, p_planned_return_at,
    btrim(p_destination), btrim(p_purpose), nullif(btrim(p_notes), ''), 'approved'
  ) returning id into plan_id;

  perform public._append_audit_log(actor_id, p_unit_id, 'movement_plan_created', 'movement_plan', plan_id::text);
  perform public._notify_user(actor_id, p_unit_id, 'movement_plan_approved', jsonb_build_object('plan_id', plan_id));
  return plan_id;
end;
$$;

create or replace function public.cancel_movement_plan(p_plan_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  plan_row public.movement_plans%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;

  select * into plan_row
  from public.movement_plans
  where id = p_plan_id and user_id = actor_id
  for update;

  if not found or plan_row.status <> 'approved' then
    raise exception using errcode = '22023', message = 'Rencana tidak dapat dibatalkan.';
  end if;

  update public.movement_plans set status = 'cancelled' where id = plan_row.id;
  perform public._append_audit_log(actor_id, plan_row.unit_id, 'movement_plan_cancelled', 'movement_plan', plan_row.id::text, p_reason);
  perform public._notify_user(actor_id, plan_row.unit_id, 'movement_plan_cancelled', jsonb_build_object('plan_id', plan_row.id));
end;
$$;

create or replace function public.process_qr_scan(
  p_qr_token text,
  p_request_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters double precision default null,
  p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  qr_row record;
  plan_row public.movement_plans%rowtype;
  session_row public.movement_sessions%rowtype;
  location_id uuid;
  result jsonb;
  expired_plan record;
  now_at timestamptz := now();
begin
  if actor_id is null or p_request_id is null or p_qr_token is null
    or char_length(p_qr_token) < 32 or char_length(p_qr_token) > 128
  then
    raise exception using errcode = '22023', message = 'Permintaan scan tidak valid.';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_id and profile.status = 'active'
      and profile.account_role in ('personnel', 'family')
  ) then
    raise exception using errcode = '42501', message = 'Akun tidak dapat melakukan scan.';
  end if;

  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is null) <> (p_accuracy_meters is null)
    or (p_latitude is null) <> (p_captured_at is null)
    or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_meters < 0 or p_captured_at > now_at + interval '5 minutes'))
  then
    raise exception using errcode = '22023', message = 'Koordinat scan tidak valid.';
  end if;

  select receipt.actor_user_id, receipt.response into qr_row
  from public.qr_scan_receipts receipt
  where receipt.request_id = p_request_id;
  if found then
    if qr_row.actor_user_id <> actor_id then
      raise exception using errcode = '42501', message = 'Request ID tidak valid.';
    end if;
    return qr_row.response;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  select receipt.actor_user_id, receipt.response into qr_row
  from public.qr_scan_receipts receipt
  where receipt.request_id = p_request_id;
  if found then
    if qr_row.actor_user_id <> actor_id then
      raise exception using errcode = '42501', message = 'Request ID tidak valid.';
    end if;
    return qr_row.response;
  end if;

  select qr.id as qr_id, qr.status as qr_status, post.id as post_id, post.unit_id
  into qr_row
  from public.post_qr_codes qr
  join public.posts post on post.id = qr.post_id
  where qr.token_hash = extensions.digest(p_qr_token, 'sha256')
    and qr.status = 'active'
    and post.status = 'active'
  for update of qr;

  if not found or not public.is_unit_member(qr_row.unit_id) then
    raise exception using errcode = '22023', message = 'QR tidak valid atau tidak aktif.';
  end if;

  select * into session_row
  from public.movement_sessions session
  where session.user_id = actor_id and session.ended_at is null
  for update;

  if found then
    if session_row.unit_id <> qr_row.unit_id then
      raise exception using errcode = '42501', message = 'QR berada di luar satuan perjalanan aktif.';
    end if;

    update public.movement_sessions
    set status = 'completed', ended_at = now_at, return_post_id = qr_row.post_id
    where id = session_row.id;
    update public.movement_plans set status = 'completed', completed_at = now_at where id = session_row.plan_id;
    update public.location_sessions
    set status = 'completed', ended_at = now_at
    where movement_session_id = session_row.id and ended_at is null;

    insert into public.movement_events (movement_session_id, actor_user_id, post_id, event_type, occurred_at, request_id)
    values (session_row.id, actor_id, qr_row.post_id, 'return', now_at, p_request_id);

    result := jsonb_build_object(
      'event', 'return', 'movement_session_id', session_row.id,
      'occurred_at', now_at, 'location_status', 'completed'
    );
    perform public._append_audit_log(actor_id, session_row.unit_id, 'movement_return', 'movement_session', session_row.id::text, null, p_request_id);
    perform public._notify_user(actor_id, session_row.unit_id, 'movement_returned', jsonb_build_object('movement_session_id', session_row.id));
  else
    for expired_plan in
      update public.movement_plans plan
      set status = 'expired'
      where plan.user_id = actor_id
        and plan.unit_id = qr_row.unit_id
        and plan.status = 'approved'
        and plan.planned_return_at <= now_at
      returning plan.id
    loop
      perform public._append_audit_log(actor_id, qr_row.unit_id, 'plan_expired', 'movement_plan', expired_plan.id::text);
    end loop;

    select * into plan_row
    from public.movement_plans plan
    where plan.user_id = actor_id
      and plan.unit_id = qr_row.unit_id
      and plan.status = 'approved'
      and plan.departure_at <= now_at
      and plan.planned_return_at > now_at
    order by plan.departure_at
    limit 1
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'Rencana izin aktif tidak ditemukan.';
    end if;

    insert into public.movement_sessions (user_id, unit_id, plan_id, departure_post_id, started_at)
    values (actor_id, qr_row.unit_id, plan_row.id, qr_row.post_id, now_at)
    returning * into session_row;

    insert into public.location_sessions (movement_session_id, user_id, unit_id, started_at)
    values (session_row.id, actor_id, qr_row.unit_id, now_at)
    returning id into location_id;

    update public.movement_plans set status = 'used', used_at = now_at where id = plan_row.id;

    if p_latitude is not null then
      insert into public.location_points (
        location_session_id, movement_session_id, user_id,
        latitude, longitude, accuracy_meters, captured_at, received_at, request_id
      ) values (
        location_id, session_row.id, actor_id, p_latitude, p_longitude,
        p_accuracy_meters, p_captured_at, now_at, p_request_id
      );
      update public.location_sessions set last_received_at = now_at where id = location_id;
    end if;

    insert into public.movement_events (movement_session_id, actor_user_id, post_id, event_type, occurred_at, request_id)
    values (session_row.id, actor_id, qr_row.post_id, 'exit', now_at, p_request_id);

    result := jsonb_build_object(
      'event', 'exit', 'movement_session_id', session_row.id,
      'location_session_id', location_id, 'occurred_at', now_at,
      'location_status', case when p_latitude is null then 'active_no_fix' else 'active' end
    );
    perform public._append_audit_log(actor_id, qr_row.unit_id, 'movement_exit', 'movement_session', session_row.id::text, null, p_request_id);
    perform public._notify_user(actor_id, qr_row.unit_id, 'movement_exited', jsonb_build_object('movement_session_id', session_row.id));
  end if;

  insert into public.qr_scan_receipts (request_id, actor_user_id, response)
  values (p_request_id, actor_id, result);
  return result;
end;
$$;

create or replace function public.record_location_point(
  p_location_session_id uuid,
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_captured_at timestamptz,
  p_device_info jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.location_sessions%rowtype;
  point_id uuid;
begin
  if actor_id is null or p_request_id is null
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_accuracy_meters is null or p_accuracy_meters < 0
    or p_captured_at is null or p_captured_at > now() + interval '5 minutes'
    or (p_device_info is not null and pg_column_size(p_device_info) > 4096)
  then
    raise exception using errcode = '22023', message = 'Titik lokasi tidak valid.';
  end if;

  select * into session_row
  from public.location_sessions
  where id = p_location_session_id and user_id = actor_id
  for update;
  if not found or session_row.ended_at is not null or session_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'Sesi lokasi tidak aktif.';
  end if;

  if not exists (
    select 1 from public.movement_sessions movement
    join public.profiles profile on profile.id = movement.user_id
    where movement.id = session_row.movement_session_id
      and movement.user_id = actor_id and movement.ended_at is null
      and profile.status = 'active'
      and public.is_unit_member(session_row.unit_id)
  ) then
    raise exception using errcode = '42501', message = 'Sesi perjalanan tidak aktif.';
  end if;

  insert into public.location_points (
    location_session_id, movement_session_id, user_id,
    latitude, longitude, accuracy_meters, captured_at, received_at, device_info, request_id
  ) values (
    session_row.id, session_row.movement_session_id, actor_id,
    p_latitude, p_longitude, p_accuracy_meters, p_captured_at, now(), p_device_info, p_request_id
  ) returning id into point_id;

  update public.location_sessions set last_received_at = now(), status = 'active' where id = session_row.id;
  return point_id;
exception
  when unique_violation then
    select id into point_id from public.location_points where request_id = p_request_id and user_id = actor_id;
    if point_id is not null then return point_id; end if;
    raise;
end;
$$;

create or replace function public.admin_force_close_movement(p_movement_session_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.movement_sessions%rowtype;
begin
  if actor_id is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Alasan tindakan wajib diisi.';
  end if;

  select * into session_row
  from public.movement_sessions
  where id = p_movement_session_id
  for update;

  if not found or not public.is_unit_admin(session_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if session_row.ended_at is not null then
    raise exception using errcode = '22023', message = 'Sesi perjalanan sudah ditutup.';
  end if;

  update public.movement_sessions
  set status = 'admin_closed', ended_at = now(), closed_by = actor_id, close_reason = btrim(p_reason)
  where id = session_row.id;
  update public.movement_plans set status = 'completed', completed_at = now() where id = session_row.plan_id;
  update public.location_sessions set status = 'completed', ended_at = now()
  where movement_session_id = session_row.id and ended_at is null;
  insert into public.movement_events (movement_session_id, actor_user_id, event_type, details)
  values (session_row.id, actor_id, 'admin_close', jsonb_build_object('reason', btrim(p_reason)));

  perform public._append_audit_log(actor_id, session_row.unit_id, 'movement_admin_closed', 'movement_session', session_row.id::text, btrim(p_reason));
  perform public._notify_user(session_row.user_id, session_row.unit_id, 'movement_admin_closed', jsonb_build_object('movement_session_id', session_row.id));
end;
$$;

create or replace function public.admin_manage_qr(
  p_action text,
  p_post_id uuid,
  p_qr_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_row public.posts%rowtype;
  qr_row public.post_qr_codes%rowtype;
  raw_token text;
begin
  if actor_id is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Alasan tindakan wajib diisi.';
  end if;

  select * into post_row from public.posts where id = p_post_id;
  if not found or not public.is_unit_admin(post_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;

  if p_action = 'create' then
    raw_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
    insert into public.post_qr_codes (post_id, token_hash, created_by)
    values (post_row.id, extensions.digest(raw_token, 'sha256'), actor_id)
    returning * into qr_row;
    perform public._append_audit_log(actor_id, post_row.unit_id, 'qr_created', 'post_qr_code', qr_row.id::text, btrim(p_reason));
    return jsonb_build_object('id', qr_row.id, 'post_id', qr_row.post_id, 'status', qr_row.status, 'token', raw_token);
  end if;

  if p_action not in ('enable', 'disable', 'revoke') or p_qr_id is null then
    raise exception using errcode = '22023', message = 'Aksi QR tidak valid.';
  end if;

  select * into qr_row
  from public.post_qr_codes
  where id = p_qr_id and post_id = post_row.id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'QR tidak ditemukan.';
  end if;
  if qr_row.status = 'revoked' or (p_action = 'enable' and qr_row.status = 'revoked') then
    raise exception using errcode = '22023', message = 'QR yang dicabut tidak dapat diaktifkan kembali.';
  end if;

  if p_action = 'enable' then
    update public.post_qr_codes set status = 'active', disabled_at = null where id = qr_row.id returning * into qr_row;
  elsif p_action = 'disable' then
    update public.post_qr_codes set status = 'disabled', disabled_at = now() where id = qr_row.id returning * into qr_row;
  else
    update public.post_qr_codes set status = 'revoked', revoked_at = now() where id = qr_row.id returning * into qr_row;
  end if;

  perform public._append_audit_log(actor_id, post_row.unit_id, 'qr_' || p_action, 'post_qr_code', qr_row.id::text, btrim(p_reason));
  return jsonb_build_object('id', qr_row.id, 'post_id', qr_row.post_id, 'status', qr_row.status);
end;
$$;

create or replace function public.admin_manage_post(
  p_action text,
  p_unit_id uuid,
  p_post_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_meters integer default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_id uuid;
  previous_data jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id)
    or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '42501', message = 'Akses atau alasan tindakan tidak valid.';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180))
    or (p_radius_meters is not null and p_radius_meters <= 0)
  then
    raise exception using errcode = '22023', message = 'Koordinat atau radius pos tidak valid.';
  end if;

  if p_action = 'create' then
    if nullif(btrim(p_name), '') is null then
      raise exception using errcode = '22023', message = 'Nama pos wajib diisi.';
    end if;
    insert into public.posts (unit_id, name, description, latitude, longitude, radius_meters)
    values (p_unit_id, btrim(p_name), nullif(btrim(p_description), ''), p_latitude, p_longitude, p_radius_meters)
    returning id into post_id;
    perform public._append_audit_log(actor_id, p_unit_id, 'post_created', 'post', post_id::text, btrim(p_reason));
    return post_id;
  end if;

  select to_jsonb(post) into previous_data
  from public.posts post
  where post.id = p_post_id and post.unit_id = p_unit_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Pos tidak ditemukan.';
  end if;

  if p_action = 'update' then
    if nullif(btrim(p_name), '') is null then
      raise exception using errcode = '22023', message = 'Nama pos wajib diisi.';
    end if;
    update public.posts
    set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      latitude = p_latitude, longitude = p_longitude, radius_meters = p_radius_meters
    where id = p_post_id returning id into post_id;
  elsif p_action = 'disable' then
    update public.posts set status = 'disabled' where id = p_post_id returning id into post_id;
  else
    raise exception using errcode = '22023', message = 'Aksi pos tidak valid.';
  end if;

  perform public._append_audit_log(actor_id, p_unit_id, 'post_' || p_action, 'post', post_id::text, btrim(p_reason), null, previous_data,
    (select to_jsonb(post) from public.posts post where post.id = post_id));
  return post_id;
end;
$$;

create or replace function public.admin_set_unit_membership_status(
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
  previous_data jsonb;
begin
  if actor_id is null or p_user_id = actor_id or p_status is null
    or nullif(btrim(p_reason), '') is null or not public.is_unit_admin(p_unit_id)
  then
    raise exception using errcode = '42501', message = 'Akses atau data tindakan tidak valid.';
  end if;

  select to_jsonb(membership) into previous_data
  from public.unit_memberships membership
  where membership.user_id = p_user_id and membership.unit_id = p_unit_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Keanggotaan satuan tidak ditemukan.';
  end if;

  update public.unit_memberships set status = p_status
  where user_id = p_user_id and unit_id = p_unit_id;
  perform public._append_audit_log(actor_id, p_unit_id, 'unit_membership_' || p_status::text, 'unit_membership', p_user_id::text, btrim(p_reason), null, previous_data,
    (select to_jsonb(membership) from public.unit_memberships membership where membership.user_id = p_user_id and membership.unit_id = p_unit_id));
  if p_status = 'disabled' then
    perform public._notify_user(p_user_id, p_unit_id, 'unit_access_disabled', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.get_my_movement_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  active_session jsonb;
  history jsonb;
  plans jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;

  select to_jsonb(session_row) || jsonb_build_object(
    'plan', to_jsonb(plan_row),
    'location', to_jsonb(location_row)
  ) into active_session
  from public.movement_sessions session_row
  join public.movement_plans plan_row on plan_row.id = session_row.plan_id
  left join public.location_sessions location_row on location_row.movement_session_id = session_row.id
  where session_row.user_id = actor_id and session_row.ended_at is null
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(plan_row) order by plan_row.created_at desc), '[]'::jsonb)
  into plans from (
    select * from public.movement_plans
    where user_id = actor_id order by created_at desc limit 50
  ) plan_row;

  select coalesce(jsonb_agg(to_jsonb(session_row) || jsonb_build_object('plan', to_jsonb(plan_row)) order by session_row.started_at desc), '[]'::jsonb)
  into history
  from (
    select * from public.movement_sessions
    where user_id = actor_id order by started_at desc limit 50
  ) session_row
  join public.movement_plans plan_row on plan_row.id = session_row.plan_id;

  return jsonb_build_object('active_session', active_session, 'plans', plans, 'history', history);
end;
$$;

create or replace function public.get_admin_live_locations(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id) then
    raise exception using errcode = '42501', message = 'Akses lokasi tidak diizinkan.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', session.user_id,
    'display_name', profile.display_name,
    'account_role', profile.account_role,
    'nrp', personnel.nrp,
    'family_code', family.family_code,
    'movement_session_id', session.id,
    'started_at', session.started_at,
    'destination', plan.destination,
    'purpose', plan.purpose,
    'location_status', location.status,
    'latitude', point.latitude,
    'longitude', point.longitude,
    'accuracy_meters', point.accuracy_meters,
    'captured_at', point.captured_at,
    'received_at', point.received_at
  ) order by session.started_at), '[]'::jsonb)
  into result
  from public.movement_sessions session
  join public.profiles profile on profile.id = session.user_id
  join public.movement_plans plan on plan.id = session.plan_id
  join public.location_sessions location on location.movement_session_id = session.id
  left join public.personnel personnel on personnel.id = session.user_id
  left join public.family_accounts family on family.id = session.user_id
  left join lateral (
    select * from public.location_points location_point
    where location_point.location_session_id = location.id
    order by location_point.received_at desc
    limit 1
  ) point on true
  where session.unit_id = p_unit_id and session.ended_at is null;

  perform public._append_audit_log(actor_id, p_unit_id, 'gps_live_locations_accessed', 'location_session', null);
  return result;
end;
$$;

create or replace function public.get_admin_location_history(
  p_unit_id uuid,
  p_user_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id) then
    raise exception using errcode = '42501', message = 'Akses lokasi tidak diizinkan.';
  end if;

  if not exists (
    select 1 from public.unit_memberships membership
    where membership.user_id = p_user_id and membership.unit_id = p_unit_id and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Pengguna berada di luar cakupan satuan.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(point) order by point.captured_at), '[]'::jsonb)
  into result
  from (
    select location_point.*
    from public.location_points location_point
    join public.location_sessions location on location.id = location_point.location_session_id
    where location_point.user_id = p_user_id and location.unit_id = p_unit_id
    order by location_point.captured_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
  ) point;

  perform public._append_audit_log(actor_id, p_unit_id, 'gps_history_accessed', 'profile', p_user_id::text);
  return result;
end;
$$;

create or replace function public.get_admin_dashboard(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null or not public.is_unit_admin(p_unit_id) then
    raise exception using errcode = '42501', message = 'Akses dashboard tidak diizinkan.';
  end if;

  select jsonb_build_object(
    'total_personnel', (select count(*) from public.personnel p join public.unit_memberships m on m.user_id = p.id where m.unit_id = p_unit_id and m.status = 'active'),
    'total_family', (select count(*) from public.family_accounts f where f.unit_id = p_unit_id),
    'active_users', (select count(distinct m.user_id) from public.unit_memberships m join public.profiles p on p.id = m.user_id where m.unit_id = p_unit_id and m.status = 'active' and p.status = 'active'),
    'personnel_out', (select count(*) from public.movement_sessions s join public.personnel p on p.id = s.user_id where s.unit_id = p_unit_id and s.ended_at is null),
    'family_out', (select count(*) from public.movement_sessions s join public.family_accounts f on f.id = s.user_id where s.unit_id = p_unit_id and s.ended_at is null),
    'personnel_inside', greatest(0, (select count(*) from public.personnel p join public.unit_memberships m on m.user_id = p.id where m.unit_id = p_unit_id and m.status = 'active') - (select count(*) from public.movement_sessions s join public.personnel p on p.id = s.user_id where s.unit_id = p_unit_id and s.ended_at is null)),
    'family_inside', greatest(0, (select count(*) from public.family_accounts f where f.unit_id = p_unit_id) - (select count(*) from public.movement_sessions s join public.family_accounts f on f.id = s.user_id where s.unit_id = p_unit_id and s.ended_at is null)),
    'active_plans', (select count(*) from public.movement_plans p where p.unit_id = p_unit_id and p.status in ('approved', 'used')),
    'active_visitors', (select count(*) from public.visitor_visits v where v.unit_id = p_unit_id and v.status = 'active'),
    'active_guards', (select count(*) from public.temporary_assignments a where a.unit_id = p_unit_id and a.revoked_at is null and now() >= a.starts_at and now() < a.ends_at)
  ) into result;

  return result;
end;
$$;

revoke all on function public.create_movement_plan(uuid, timestamptz, timestamptz, text, text, text) from public, anon;
revoke all on function public.cancel_movement_plan(uuid, text) from public, anon;
revoke all on function public.process_qr_scan(text, uuid, double precision, double precision, double precision, timestamptz) from public, anon;
revoke all on function public.record_location_point(uuid, uuid, double precision, double precision, double precision, timestamptz, jsonb) from public, anon;
revoke all on function public.admin_force_close_movement(uuid, text) from public, anon;
revoke all on function public.admin_manage_qr(text, uuid, uuid, text) from public, anon;
revoke all on function public.admin_manage_post(text, uuid, uuid, text, text, double precision, double precision, integer, text) from public, anon;
revoke all on function public.admin_set_unit_membership_status(uuid, uuid, public.record_status, text) from public, anon;
revoke all on function public.get_my_movement_status() from public, anon;
revoke all on function public.get_admin_live_locations(uuid) from public, anon;
revoke all on function public.get_admin_location_history(uuid, uuid, integer) from public, anon;
revoke all on function public.get_admin_dashboard(uuid) from public, anon;

grant execute on function public.create_movement_plan(uuid, timestamptz, timestamptz, text, text, text) to authenticated, service_role;
grant execute on function public.cancel_movement_plan(uuid, text) to authenticated, service_role;
grant execute on function public.process_qr_scan(text, uuid, double precision, double precision, double precision, timestamptz) to authenticated, service_role;
grant execute on function public.record_location_point(uuid, uuid, double precision, double precision, double precision, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.admin_force_close_movement(uuid, text) to authenticated, service_role;
grant execute on function public.admin_manage_qr(text, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.admin_manage_post(text, uuid, uuid, text, text, double precision, double precision, integer, text) to authenticated, service_role;
grant execute on function public.admin_set_unit_membership_status(uuid, uuid, public.record_status, text) to authenticated, service_role;
grant execute on function public.get_my_movement_status() to authenticated, service_role;
grant execute on function public.get_admin_live_locations(uuid) to authenticated, service_role;
grant execute on function public.get_admin_location_history(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.get_admin_dashboard(uuid) to authenticated, service_role;