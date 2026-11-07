create type public.account_role as enum ('admin', 'personnel', 'family');
create type public.record_status as enum ('active', 'disabled');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text,
  account_role public.account_role not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unit_memberships (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (unit_id, user_id)
);

create index unit_memberships_user_unit_idx on public.unit_memberships (user_id, unit_id);

create function public.is_unit_admin(target_unit_id uuid)
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

revoke all on function public.is_unit_admin(uuid) from public, anon;
grant execute on function public.is_unit_admin(uuid) to authenticated;

alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.unit_memberships enable row level security;

revoke all on public.units, public.profiles, public.unit_memberships from anon, authenticated;
grant select on public.units, public.profiles, public.unit_memberships to authenticated;

create policy "Members can read their units"
on public.units for select to authenticated
using (
  exists (
    select 1
    from public.unit_memberships membership
    where membership.unit_id = units.id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy "Users and scoped admins can read profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.unit_memberships membership
    where membership.user_id = profiles.id
      and membership.status = 'active'
      and (select public.is_unit_admin(membership.unit_id))
  )
);

create policy "Users and scoped admins can read memberships"
on public.unit_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_unit_admin(unit_id))
);