create unique index visitors_identity_per_unit_idx
on public.visitors (unit_id, identity_type, lower(identity_number));

alter table public.guard_reports alter column generated_by drop not null;

create or replace function public.admin_create_guard_invite(
  p_personnel_user_id uuid,
  p_post_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_row public.posts%rowtype;
  invite_id uuid;
  raw_token text;
begin
  if actor_id is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Alasan tindakan wajib diisi.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'Rentang waktu penugasan tidak valid.';
  end if;

  select * into post_row from public.posts where id = p_post_id and status = 'active';
  if not found or not public.is_unit_admin(post_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if not exists (
    select 1 from public.personnel personnel
    join public.profiles profile on profile.id = personnel.id
    join public.unit_memberships membership on membership.user_id = personnel.id
    where personnel.id = p_personnel_user_id
      and membership.unit_id = post_row.unit_id and membership.status = 'active'
      and profile.status = 'active' and profile.account_role = 'personnel'
  ) then
    raise exception using errcode = '22023', message = 'Personel tidak aktif atau berada di luar satuan.';
  end if;

  raw_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.guard_invites (
    unit_id, post_id, personnel_user_id, token_hash, starts_at, ends_at, note, created_by
  ) values (
    post_row.unit_id, post_row.id, p_personnel_user_id,
    extensions.digest(raw_token, 'sha256'), p_starts_at, p_ends_at,
    nullif(btrim(p_note), ''), actor_id
  ) returning id into invite_id;

  perform public._append_audit_log(actor_id, post_row.unit_id, 'guard_invite_created', 'guard_invite', invite_id::text, btrim(p_reason));
  perform public._notify_user(p_personnel_user_id, post_row.unit_id, 'guard_invite', jsonb_build_object('invite_id', invite_id, 'post_id', post_row.id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return jsonb_build_object('invite_id', invite_id, 'token', raw_token, 'starts_at', p_starts_at, 'ends_at', p_ends_at);
end;
$$;

create or replace function public.accept_guard_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invite_row public.guard_invites%rowtype;
  assignment_id uuid;
begin
  if actor_id is null or p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    raise exception using errcode = '22023', message = 'Undangan tidak valid.';
  end if;
  if not exists (
    select 1 from public.profiles profile
    join public.personnel personnel on personnel.id = profile.id
    where profile.id = actor_id and profile.status = 'active' and profile.account_role = 'personnel'
  ) then
    raise exception using errcode = '42501', message = 'Akun bukan personel aktif.';
  end if;

  select * into invite_row
  from public.guard_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;
  if not found or invite_row.personnel_user_id <> actor_id or invite_row.status <> 'pending'
    or invite_row.ends_at <= now()
  then
    raise exception using errcode = '22023', message = 'Undangan tidak valid atau sudah berakhir.';
  end if;
  if not public.is_unit_member(invite_row.unit_id) then
    raise exception using errcode = '42501', message = 'Satuan penugasan tidak lagi berlaku.';
  end if;

  insert into public.temporary_assignments (
    invite_id, unit_id, post_id, personnel_user_id, starts_at, ends_at
  ) values (
    invite_row.id, invite_row.unit_id, invite_row.post_id,
    actor_id, invite_row.starts_at, invite_row.ends_at
  ) returning id into assignment_id;
  update public.guard_invites set status = 'accepted', accepted_at = now() where id = invite_row.id;

  perform public._append_audit_log(actor_id, invite_row.unit_id, 'guard_invite_accepted', 'guard_invite', invite_row.id::text);
  perform public._notify_user(actor_id, invite_row.unit_id, 'guard_assignment_accepted', jsonb_build_object('assignment_id', assignment_id));
  return assignment_id;
end;
$$;

create or replace function public.revoke_guard_assignment(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  assignment_row public.temporary_assignments%rowtype;
begin
  if actor_id is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Alasan pencabutan wajib diisi.';
  end if;
  select * into assignment_row from public.temporary_assignments where id = p_assignment_id for update;
  if not found or not public.is_unit_admin(assignment_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if assignment_row.revoked_at is not null then
    raise exception using errcode = '22023', message = 'Penugasan sudah dicabut.';
  end if;

  update public.temporary_assignments
  set revoked_at = now(), revoked_by = actor_id, revoke_reason = btrim(p_reason)
  where id = assignment_row.id;
  update public.guard_invites set status = 'cancelled', revoked_at = now() where id = assignment_row.invite_id;

  perform public._append_audit_log(actor_id, assignment_row.unit_id, 'guard_assignment_revoked', 'temporary_assignment', assignment_row.id::text, btrim(p_reason));
  perform public._notify_user(assignment_row.personnel_user_id, assignment_row.unit_id, 'guard_assignment_revoked', jsonb_build_object('assignment_id', assignment_row.id));
end;
$$;

create or replace function public.create_visitor_visit(
  p_unit_id uuid,
  p_post_id uuid,
  p_full_name text,
  p_identity_type text,
  p_identity_number text,
  p_purpose text,
  p_host_name text default null,
  p_phone text default null,
  p_vehicle jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  assignment_row public.temporary_assignments%rowtype;
  created_visitor_id uuid;
  visit_id uuid;
  vehicle_id uuid;
begin
  if actor_id is null or not public.is_active_guard(p_unit_id, p_post_id) then
    raise exception using errcode = '42501', message = 'Penugasan jaga tidak aktif.';
  end if;
  if nullif(btrim(p_full_name), '') is null
    or p_identity_type not in ('ktp', 'passport', 'other')
    or nullif(btrim(p_identity_number), '') is null
    or nullif(btrim(p_purpose), '') is null
  then
    raise exception using errcode = '22023', message = 'Identitas dan keperluan kunjungan wajib diisi.';
  end if;
  if p_vehicle is not null and jsonb_typeof(p_vehicle) <> 'object' then
    raise exception using errcode = '22023', message = 'Data kendaraan tidak valid.';
  end if;
  if p_vehicle is not null and nullif(btrim(p_vehicle->>'vehicle_type'), '') is null then
    raise exception using errcode = '22023', message = 'Jenis kendaraan wajib diisi.';
  end if;

  select * into assignment_row
  from public.temporary_assignments assignment
  where assignment.personnel_user_id = actor_id
    and assignment.unit_id = p_unit_id and assignment.post_id = p_post_id
    and assignment.revoked_at is null and now() >= assignment.starts_at and now() < assignment.ends_at
  order by assignment.ends_at
  limit 1
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Penugasan jaga tidak aktif.';
  end if;

  insert into public.visitors (unit_id, full_name, identity_type, identity_number, phone)
  values (p_unit_id, btrim(p_full_name), p_identity_type, btrim(p_identity_number), nullif(btrim(p_phone), ''))
  on conflict (unit_id, identity_type, (lower(identity_number)))
  do update set full_name = excluded.full_name, phone = coalesce(excluded.phone, public.visitors.phone)
  returning id into created_visitor_id;

  if exists (select 1 from public.visitor_visits visit where visit.visitor_id = created_visitor_id and visit.status = 'active') then
    raise exception using errcode = '23505', message = 'Kunjungan aktif untuk identitas ini sudah tercatat.';
  end if;

  insert into public.visitor_visits (
    visitor_id, unit_id, post_id, assignment_id, handled_by_user_id,
    purpose, host_name
  ) values (
    created_visitor_id, p_unit_id, p_post_id, assignment_row.id, actor_id,
    btrim(p_purpose), nullif(btrim(p_host_name), '')
  ) returning id into visit_id;

  if p_vehicle is not null then
    insert into public.visitor_vehicles (visit_id, vehicle_type, make_model, color, plate_number)
    values (
      visit_id,
      btrim(p_vehicle->>'vehicle_type'),
      nullif(btrim(p_vehicle->>'make_model'), ''),
      nullif(btrim(p_vehicle->>'color'), ''),
      nullif(upper(btrim(p_vehicle->>'plate_number')), '')
    ) returning id into vehicle_id;
  end if;

  perform public._append_audit_log(actor_id, p_unit_id, 'visitor_checked_in', 'visitor_visit', visit_id::text);
  insert into public.notifications (user_id, unit_id, notification_type, payload)
  select membership.user_id, p_unit_id, 'visitor_checked_in', jsonb_build_object('visit_id', visit_id)
  from public.unit_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.unit_id = p_unit_id and membership.status = 'active'
    and profile.account_role = 'admin' and profile.status = 'active';

  return jsonb_build_object('visit_id', visit_id, 'visitor_id', created_visitor_id, 'vehicle_id', vehicle_id, 'checked_in_at', now());
end;
$$;

create or replace function public.record_visitor_exit(p_visit_id uuid, p_notes text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  visit_row public.visitor_visits%rowtype;
  exit_time timestamptz := now();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  select * into visit_row from public.visitor_visits where id = p_visit_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Kunjungan tidak ditemukan.';
  end if;
  if not public.is_unit_admin(visit_row.unit_id) and not exists (
    select 1 from public.temporary_assignments assignment
    join public.profiles profile on profile.id = assignment.personnel_user_id
    where assignment.id = visit_row.assignment_id
      and assignment.personnel_user_id = actor_id
      and assignment.revoked_at is null
      and now() >= assignment.starts_at and now() < assignment.ends_at
      and profile.account_role = 'personnel' and profile.status = 'active'
      and public.is_unit_member(visit_row.unit_id)
  ) then
    raise exception using errcode = '42501', message = 'Akses pencatatan keluar tidak diizinkan.';
  end if;
  if visit_row.status <> 'active' or visit_row.checked_out_at is not null then
    raise exception using errcode = '23505', message = 'Kunjungan sudah ditutup.';
  end if;

  update public.visitor_visits
  set status = 'completed', checked_out_at = exit_time, exit_notes = nullif(btrim(p_notes), '')
  where id = visit_row.id;
  perform public._append_audit_log(actor_id, visit_row.unit_id, 'visitor_checked_out', 'visitor_visit', visit_row.id::text, p_notes);
  insert into public.notifications (user_id, unit_id, notification_type, payload)
  select membership.user_id, visit_row.unit_id, 'visitor_checked_out', jsonb_build_object('visit_id', visit_row.id)
  from public.unit_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.unit_id = visit_row.unit_id and membership.status = 'active'
    and profile.account_role = 'admin' and profile.status = 'active';
  return exit_time;
end;
$$;

create or replace function public.register_visitor_document(
  p_visit_id uuid,
  p_document_type public.visitor_document_type,
  p_object_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  visit_row public.visitor_visits%rowtype;
  document_id uuid;
begin
  if actor_id is null or p_object_path is null then
    raise exception using errcode = '22023', message = 'Dokumen tidak valid.';
  end if;
  select * into visit_row from public.visitor_visits where id = p_visit_id;
  if not found or not public.can_read_visitor_visit(visit_row.id, visit_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses dokumen tidak diizinkan.';
  end if;
  if split_part(p_object_path, '/', 1) <> visit_row.unit_id::text
    or split_part(p_object_path, '/', 2) <> visit_row.id::text
    or public.can_access_visitor_object(p_object_path, true) is false
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'visitor-documents' and object.name = p_object_path
    )
  then
    raise exception using errcode = '42501', message = 'Dokumen tidak ditemukan atau tidak berizin.';
  end if;

  insert into public.visitor_documents (visit_id, document_type, object_path, uploaded_by)
  values (visit_row.id, p_document_type, p_object_path, actor_id)
  returning id into document_id;
  perform public._append_audit_log(actor_id, visit_row.unit_id, 'visitor_document_uploaded', 'visitor_document', document_id::text);
  return document_id;
end;
$$;

create or replace function public._build_guard_report(p_assignment_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assignment_id', assignment.id,
    'unit_id', assignment.unit_id,
    'post_id', post.id,
    'post_name', post.name,
    'personnel_user_id', assignment.personnel_user_id,
    'personnel_name', profile.display_name,
    'starts_at', assignment.starts_at,
    'ends_at', assignment.ends_at,
    'revoked_at', assignment.revoked_at,
    'visitor_entries', count(visit.id),
    'visitor_exits', count(visit.id) filter (where visit.checked_out_at is not null),
    'visitors_not_checked_out', count(visit.id) filter (where visit.status = 'active'),
    'visits', coalesce(jsonb_agg(
      jsonb_build_object(
        'visit_id', visit.id,
        'visitor_name', visitor.full_name,
        'identity_type', visitor.identity_type,
        'identity_number', visitor.identity_number,
        'purpose', visit.purpose,
        'host_name', visit.host_name,
        'checked_in_at', visit.checked_in_at,
        'checked_out_at', visit.checked_out_at,
        'status', visit.status,
        'vehicles', coalesce(vehicle_rows.rows, '[]'::jsonb)
      ) order by visit.checked_in_at
    ) filter (where visit.id is not null), '[]'::jsonb)
  )
  from public.temporary_assignments assignment
  join public.posts post on post.id = assignment.post_id
  join public.profiles profile on profile.id = assignment.personnel_user_id
  left join public.visitor_visits visit on visit.assignment_id = assignment.id
  left join public.visitors visitor on visitor.id = visit.visitor_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'vehicle_type', vehicle.vehicle_type,
      'make_model', vehicle.make_model,
      'color', vehicle.color,
      'plate_number', vehicle.plate_number
    )) as rows
    from public.visitor_vehicles vehicle where vehicle.visit_id = visit.id
  ) vehicle_rows on true
  where assignment.id = p_assignment_id
  group by assignment.id, post.id, profile.display_name
$$;

create or replace function public.generate_guard_report(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  assignment_row public.temporary_assignments%rowtype;
  report_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  select * into assignment_row from public.temporary_assignments where id = p_assignment_id;
  if not found or not public.is_unit_admin(assignment_row.unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if now() < assignment_row.ends_at and assignment_row.revoked_at is null then
    raise exception using errcode = '22023', message = 'Laporan tersedia setelah tugas berakhir atau dicabut.';
  end if;

  insert into public.guard_reports (assignment_id, unit_id, generated_by, report_data)
  values (assignment_row.id, assignment_row.unit_id, actor_id, public._build_guard_report(assignment_row.id))
  on conflict (assignment_id) do update
  set generated_by = excluded.generated_by, report_data = excluded.report_data, generated_at = now()
  returning id into report_id;
  perform public._append_audit_log(actor_id, assignment_row.unit_id, 'guard_report_generated', 'guard_report', report_id::text);
  return report_id;
end;
$$;

create or replace function public.generate_due_guard_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.temporary_assignments%rowtype;
  generated_count integer := 0;
begin
  for assignment_row in
    select assignment.* from public.temporary_assignments assignment
    left join public.guard_reports report on report.assignment_id = assignment.id
    where report.id is null
      and (assignment.ends_at <= now() or assignment.revoked_at is not null)
    order by assignment.ends_at
    limit 500
    for update of assignment skip locked
  loop
    insert into public.guard_reports (assignment_id, unit_id, generated_by, report_data)
    values (assignment_row.id, assignment_row.unit_id, null, public._build_guard_report(assignment_row.id));
    perform public._append_audit_log(null, assignment_row.unit_id, 'guard_report_auto_generated', 'temporary_assignment', assignment_row.id::text);
    generated_count := generated_count + 1;
  end loop;
  return generated_count;
end;
$$;

revoke all on function public.admin_create_guard_invite(uuid, uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.accept_guard_invite(text) from public, anon;
revoke all on function public.revoke_guard_assignment(uuid, text) from public, anon;
revoke all on function public.create_visitor_visit(uuid, uuid, text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.record_visitor_exit(uuid, text) from public, anon;
revoke all on function public.register_visitor_document(uuid, public.visitor_document_type, text) from public, anon;
revoke all on function public._build_guard_report(uuid) from public, anon, authenticated, service_role;
revoke all on function public.generate_guard_report(uuid) from public, anon;
revoke all on function public.generate_due_guard_reports() from public, anon, authenticated;

grant execute on function public.admin_create_guard_invite(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.accept_guard_invite(text) to authenticated, service_role;
grant execute on function public.revoke_guard_assignment(uuid, text) to authenticated, service_role;
grant execute on function public.create_visitor_visit(uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.record_visitor_exit(uuid, text) to authenticated, service_role;
grant execute on function public.register_visitor_document(uuid, public.visitor_document_type, text) to authenticated, service_role;
grant execute on function public.generate_guard_report(uuid) to authenticated, service_role;
grant execute on function public.generate_due_guard_reports() to service_role;