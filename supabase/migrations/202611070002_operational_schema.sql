create extension if not exists pgcrypto with schema extensions;

create type public.plan_status as enum ('approved', 'used', 'completed', 'cancelled', 'expired');
create type public.movement_status as enum ('active', 'completed', 'admin_closed');
create type public.qr_status as enum ('active', 'disabled', 'revoked');
create type public.location_status as enum ('active', 'unavailable', 'completed');
create type public.guard_invite_status as enum ('pending', 'accepted', 'cancelled', 'expired');
create type public.visit_status as enum ('active', 'completed');
create type public.visitor_document_type as enum ('identity', 'vehicle', 'other');

alter table public.units add column updated_at timestamptz not null default now();
alter table public.profiles add constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 160);

create table public.personnel (
  id uuid primary key references public.profiles (id) on delete restrict,
  nrp text not null unique check (nrp ~ '^[0-9]{1,20}$'),
  rank text,
  position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_accounts (
  id uuid primary key references public.profiles (id) on delete restrict,
  family_code text not null check (family_code = upper(btrim(family_code)) and char_length(family_code) between 1 and 64),
  related_personnel_id uuid not null references public.personnel (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_code)
);

create index family_accounts_personnel_idx on public.family_accounts (related_personnel_id);
create index family_accounts_unit_idx on public.family_accounts (unit_id, id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  radius_meters integer check (radius_meters is null or radius_meters > 0),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, name),
  unique (id, unit_id)
);

create index posts_unit_status_idx on public.posts (unit_id, status);

create table public.post_qr_codes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  token_hash bytea not null unique,
  status public.qr_status not null default 'active',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  revoked_at timestamptz
);

create index post_qr_codes_post_status_idx on public.post_qr_codes (post_id, status);

create table public.movement_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  departure_at timestamptz not null,
  planned_return_at timestamptz not null,
  destination text not null check (char_length(btrim(destination)) between 1 and 240),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  status public.plan_status not null default 'approved',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  completed_at timestamptz,
  constraint movement_plans_valid_period check (planned_return_at > departure_at),
  unique (id, user_id, unit_id)
);

create index movement_plans_user_status_departure_idx on public.movement_plans (user_id, status, departure_at);
create index movement_plans_unit_departure_idx on public.movement_plans (unit_id, departure_at desc);

create table public.movement_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  plan_id uuid not null unique,
  departure_post_id uuid not null references public.posts (id) on delete restrict,
  return_post_id uuid references public.posts (id) on delete restrict,
  status public.movement_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  closed_by uuid references public.profiles (id) on delete restrict,
  close_reason text,
  constraint movement_sessions_plan_owner_fk foreign key (plan_id, user_id, unit_id)
    references public.movement_plans (id, user_id, unit_id) on delete restrict,
  constraint movement_sessions_end_state check (
    (status = 'active' and ended_at is null and return_post_id is null)
    or (status <> 'active' and ended_at is not null)
  )
);

create unique index movement_sessions_one_active_user_idx on public.movement_sessions (user_id) where ended_at is null;
create index movement_sessions_unit_status_idx on public.movement_sessions (unit_id, status, started_at desc);
create index movement_sessions_user_started_idx on public.movement_sessions (user_id, started_at desc);

create table public.location_sessions (
  id uuid primary key default gen_random_uuid(),
  movement_session_id uuid not null unique references public.movement_sessions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  status public.location_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_received_at timestamptz,
  constraint location_sessions_end_state check (
    (status = 'active' and ended_at is null)
    or (status = 'completed' and ended_at is not null)
    or status = 'unavailable'
  )
);

create unique index location_sessions_one_active_user_idx on public.location_sessions (user_id) where ended_at is null;
create index location_sessions_unit_status_idx on public.location_sessions (unit_id, status, last_received_at desc);

create table public.location_points (
  id uuid primary key default gen_random_uuid(),
  location_session_id uuid not null references public.location_sessions (id) on delete restrict,
  movement_session_id uuid not null references public.movement_sessions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision not null check (accuracy_meters >= 0),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  device_info jsonb check (device_info is null or pg_column_size(device_info) <= 4096),
  request_id uuid not null unique
);

create index location_points_session_time_idx on public.location_points (location_session_id, captured_at desc);
create index location_points_movement_time_idx on public.location_points (movement_session_id, captured_at desc);

create table public.movement_events (
  id uuid primary key default gen_random_uuid(),
  movement_session_id uuid not null references public.movement_sessions (id) on delete restrict,
  actor_user_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete restrict,
  event_type text not null check (event_type in ('exit', 'return', 'admin_close')),
  occurred_at timestamptz not null default now(),
  request_id uuid unique,
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 8192)
);

create index movement_events_session_time_idx on public.movement_events (movement_session_id, occurred_at desc);

create table public.qr_scan_receipts (
  request_id uuid primary key,
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create table public.guard_invites (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  post_id uuid not null references public.posts (id) on delete restrict,
  personnel_user_id uuid not null references public.personnel (id) on delete restrict,
  token_hash bytea not null unique,
  status public.guard_invite_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint guard_invites_valid_period check (ends_at > starts_at),
  unique (id, unit_id, post_id)
);

create index guard_invites_personnel_status_idx on public.guard_invites (personnel_user_id, status, starts_at);
create index guard_invites_unit_period_idx on public.guard_invites (unit_id, starts_at, ends_at);

create table public.temporary_assignments (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique,
  unit_id uuid not null references public.units (id) on delete restrict,
  post_id uuid not null references public.posts (id) on delete restrict,
  personnel_user_id uuid not null references public.personnel (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoke_reason text,
  created_at timestamptz not null default now(),
  constraint temporary_assignments_invite_fk foreign key (invite_id, unit_id, post_id)
    references public.guard_invites (id, unit_id, post_id) on delete restrict,
  constraint temporary_assignments_valid_period check (ends_at > starts_at),
  constraint temporary_assignments_revoke_state check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null and char_length(btrim(revoke_reason)) > 0)
  )
);

create index temporary_assignments_personnel_period_idx on public.temporary_assignments (personnel_user_id, starts_at, ends_at);
create index temporary_assignments_unit_period_idx on public.temporary_assignments (unit_id, starts_at, ends_at);

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  identity_type text not null check (identity_type in ('ktp', 'passport', 'other')),
  identity_number text not null check (char_length(btrim(identity_number)) between 1 and 80),
  phone text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now(),
  unique (id, unit_id)
);

create index visitors_unit_created_idx on public.visitors (unit_id, created_at desc);

create table public.visitor_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  unit_id uuid not null references public.units (id) on delete restrict,
  post_id uuid not null references public.posts (id) on delete restrict,
  assignment_id uuid not null references public.temporary_assignments (id) on delete restrict,
  handled_by_user_id uuid not null references public.profiles (id) on delete restrict,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  host_name text check (host_name is null or char_length(host_name) <= 160),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  status public.visit_status not null default 'active',
  exit_notes text check (exit_notes is null or char_length(exit_notes) <= 1000),
  constraint visitor_visits_visitor_unit_fk foreign key (visitor_id, unit_id)
    references public.visitors (id, unit_id) on delete restrict,
  constraint visitor_visits_end_state check (
    (status = 'active' and checked_out_at is null)
    or (status = 'completed' and checked_out_at is not null)
  ),
  unique (id, unit_id)
);

create unique index visitor_visits_one_active_identity_idx on public.visitor_visits (visitor_id) where status = 'active';
create index visitor_visits_unit_status_idx on public.visitor_visits (unit_id, status, checked_in_at desc);
create index visitor_visits_assignment_idx on public.visitor_visits (assignment_id, checked_in_at desc);

create table public.visitor_vehicles (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visitor_visits (id) on delete restrict,
  vehicle_type text not null check (char_length(btrim(vehicle_type)) between 1 and 80),
  make_model text check (make_model is null or char_length(make_model) <= 120),
  color text check (color is null or char_length(color) <= 60),
  plate_number text check (plate_number is null or char_length(plate_number) <= 24),
  created_at timestamptz not null default now()
);

create index visitor_vehicles_visit_idx on public.visitor_vehicles (visit_id);

create table public.visitor_documents (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visitor_visits (id) on delete restrict,
  document_type public.visitor_document_type not null,
  object_path text not null unique,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (object_path !~ '(^/|\\.\\.|//)')
);

create index visitor_documents_visit_idx on public.visitor_documents (visit_id, created_at desc);

create table public.guard_reports (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.temporary_assignments (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  generated_by uuid not null references public.profiles (id) on delete restrict,
  report_data jsonb not null check (pg_column_size(report_data) <= 1048576),
  generated_at timestamptz not null default now()
);

create index guard_reports_unit_generated_idx on public.guard_reports (unit_id, generated_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  unit_id uuid references public.units (id) on delete restrict,
  notification_type text not null check (char_length(notification_type) between 1 and 80),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16384),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles (id) on delete set null,
  unit_id uuid references public.units (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 100),
  entity_id text,
  reason text,
  request_id uuid,
  before_data jsonb check (before_data is null or pg_column_size(before_data) <= 32768),
  after_data jsonb check (after_data is null or pg_column_size(after_data) <= 32768),
  created_at timestamptz not null default now()
);

create index audit_logs_unit_time_idx on public.audit_logs (unit_id, created_at desc);
create index audit_logs_actor_time_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create table public.security_events (
  id bigint generated always as identity primary key,
  unit_id uuid references public.units (id) on delete restrict,
  actor_user_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 100),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 16384),
  occurred_at timestamptz not null default now()
);

create index security_events_unit_time_idx on public.security_events (unit_id, occurred_at desc);

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units (id) on delete restrict,
  setting_key text not null check (setting_key ~ '^[a-z][a-z0-9_.-]{1,80}$'),
  setting_value jsonb not null check (pg_column_size(setting_value) <= 16384),
  updated_by uuid not null references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (unit_id, setting_key)
);

create table public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete restrict,
  account_role public.account_role not null,
  identifier_hash text not null,
  auth_email text not null unique,
  created_at timestamptz not null default now(),
  unique (account_role, identifier_hash),
  check (identifier_hash ~ '^[0-9a-f]{64}$'),
  check (auth_email like '%@auth.gateops.invalid')
);

create table public.auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger units_set_updated_at before update on public.units
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger personnel_set_updated_at before update on public.personnel
for each row execute function public.set_updated_at();
create trigger family_accounts_set_updated_at before update on public.family_accounts
for each row execute function public.set_updated_at();
create trigger posts_set_updated_at before update on public.posts
for each row execute function public.set_updated_at();
create trigger system_settings_set_updated_at before update on public.system_settings
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitor-documents',
  'visitor-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;