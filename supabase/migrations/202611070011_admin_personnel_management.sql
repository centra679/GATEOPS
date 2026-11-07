create or replace function public.admin_update_personnel(
  p_actor_user_id uuid,
  p_unit_id uuid,
  p_personnel_user_id uuid,
  p_nrp text,
  p_identifier_hash text,
  p_display_name text,
  p_rank text,
  p_position text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := p_actor_user_id;
  old_data jsonb;
begin
  if actor_id is null or auth.role() <> 'service_role' or not exists (
    select 1
    from public.profiles actor
    join public.unit_memberships membership on membership.user_id = actor.id
    where actor.id = p_actor_user_id
      and actor.account_role = 'admin'
      and actor.status = 'active'
      and membership.unit_id = p_unit_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if p_personnel_user_id is null
    or p_nrp is null or p_nrp !~ '^[0-9]{1,20}$'
    or p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_display_name), '') is null or char_length(btrim(p_display_name)) > 160
    or char_length(coalesce(p_rank, '')) > 80
    or char_length(coalesce(p_position, '')) > 120
    or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '22023', message = 'Data personel atau alasan perubahan tidak valid.';
  end if;

  select jsonb_build_object(
    'display_name', profile.display_name,
    'nrp', personnel.nrp,
    'rank', personnel.rank,
    'position', personnel.position
  ) into old_data
  from public.personnel personnel
  join public.profiles profile on profile.id = personnel.id
  join public.unit_memberships membership on membership.user_id = personnel.id
  where personnel.id = p_personnel_user_id and membership.unit_id = p_unit_id
  for update of personnel, profile;
  if not found then
    raise exception using errcode = '22023', message = 'Personel tidak ditemukan dalam satuan ini.';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name)
  where id = p_personnel_user_id;
  update public.personnel
  set nrp = p_nrp,
      rank = nullif(btrim(coalesce(p_rank, '')), ''),
      position = nullif(btrim(coalesce(p_position, '')), '')
  where id = p_personnel_user_id;
  update public.auth_identities
  set identifier_hash = p_identifier_hash
  where user_id = p_personnel_user_id and account_role = 'personnel';
  if not found then
    raise exception using errcode = '22023', message = 'Identitas autentikasi personel tidak ditemukan.';
  end if;

  perform public._append_audit_log(
    actor_id, p_unit_id, 'personnel_updated', 'personnel', p_personnel_user_id::text,
    btrim(p_reason), null, old_data,
    jsonb_build_object(
      'display_name', btrim(p_display_name),
      'nrp', p_nrp,
      'rank', nullif(btrim(coalesce(p_rank, '')), ''),
      'position', nullif(btrim(coalesce(p_position, '')), '')
    )
  );
  return p_personnel_user_id;
end;
$$;

create or replace function public.admin_update_family_account(
  p_unit_id uuid,
  p_family_user_id uuid,
  p_display_name text,
  p_related_personnel_id uuid,
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
  if actor_id is null or not public.is_unit_admin(p_unit_id) then
    raise exception using errcode = '42501', message = 'Akses tidak diizinkan.';
  end if;
  if p_family_user_id is null or p_related_personnel_id is null
    or nullif(btrim(p_display_name), '') is null or char_length(btrim(p_display_name)) > 160
    or nullif(btrim(p_reason), '') is null
  then
    raise exception using errcode = '22023', message = 'Data akun keluarga atau alasan perubahan tidak valid.';
  end if;

  select jsonb_build_object(
    'display_name', profile.display_name,
    'related_personnel_id', family.related_personnel_id
  ) into old_data
  from public.family_accounts family
  join public.profiles profile on profile.id = family.id
  where family.id = p_family_user_id and family.unit_id = p_unit_id
  for update of family, profile;
  if not found then
    raise exception using errcode = '22023', message = 'Akun keluarga tidak ditemukan dalam satuan ini.';
  end if;

  if not exists (
    select 1
    from public.personnel personnel
    join public.profiles profile on profile.id = personnel.id
    join public.unit_memberships membership on membership.user_id = personnel.id
    where personnel.id = p_related_personnel_id
      and membership.unit_id = p_unit_id
      and membership.status = 'active'
      and profile.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Personel penghubung harus aktif pada satuan ini.';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name)
  where id = p_family_user_id;
  update public.family_accounts
  set related_personnel_id = p_related_personnel_id
  where id = p_family_user_id;

  perform public._append_audit_log(
    actor_id, p_unit_id, 'family_account_updated', 'family_account', p_family_user_id::text,
    btrim(p_reason), null, old_data,
    jsonb_build_object('display_name', btrim(p_display_name), 'related_personnel_id', p_related_personnel_id)
  );
  return p_family_user_id;
end;
$$;

revoke all on function public.admin_update_personnel(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_family_account(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.admin_update_personnel(uuid, uuid, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_update_family_account(uuid, uuid, text, uuid, text) to authenticated, service_role;