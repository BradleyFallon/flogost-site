create or replace function public.spring_balls_interval_pattern_is_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) between 1 and 16
    and not exists (
      select 1
      from jsonb_array_elements(value) as item
      where jsonb_typeof(item) <> 'number'
        or (item #>> '{}')::numeric < 1
        or (item #>> '{}')::numeric > 128
        or trunc((item #>> '{}')::numeric) <> (item #>> '{}')::numeric
    );
$$;

create or replace function public.spring_balls_settings_are_valid(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return
    jsonb_typeof(value) = 'object'
    and jsonb_typeof(value -> 'bpm') = 'number'
    and (value ->> 'bpm')::numeric between 20 and 300
    and jsonb_typeof(value -> 'rotationDegrees') = 'number'
    and (value ->> 'rotationDegrees')::numeric between 0 and 360
    and jsonb_typeof(value -> 'rotationVariance') = 'number'
    and (value ->> 'rotationVariance')::numeric between 0 and 180
    and (value ->> 'direction')::integer in (-1, 1)
    and jsonb_typeof(value -> 'autoBeat') = 'boolean'
    and jsonb_typeof(value -> 'scrambleEnabled') = 'boolean'
    and public.spring_balls_interval_pattern_is_valid(value -> 'scramblePattern')
    and jsonb_typeof(value -> 'kickEnabled') = 'boolean'
    and public.spring_balls_interval_pattern_is_valid(value -> 'kickPattern')
    and (value ->> 'kickStrength')::numeric between 0 and 500
    and jsonb_typeof(value -> 'breatheEnabled') = 'boolean'
    and public.spring_balls_interval_pattern_is_valid(value -> 'breathePattern')
    and (value ->> 'breatheAmount')::numeric between -200 and 200
    and jsonb_typeof(value -> 'inversionEnabled') = 'boolean'
    and public.spring_balls_interval_pattern_is_valid(value -> 'inversionPattern')
    and (value ->> 'trailFade')::numeric between 2 and 100
    and (value ->> 'triangleStiffness')::numeric between 5 and 400
    and (value ->> 'triangleDamping')::numeric between 0 and 40
    and (value ->> 'triangleInertia')::numeric between 0.1 and 10
    and (value ->> 'ballStiffness')::numeric between 5 and 400
    and (value ->> 'ballDamping')::numeric between 0 and 40
    and (value ->> 'ballMass')::numeric between 0.1 and 10
    and (value ->> 'repulsion')::numeric between 0 and 800
    and octet_length(value::text) <= 8000;
exception
  when others then
    return false;
end;
$$;

create table if not exists public.spring_balls_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  version smallint not null default 1 check (version = 1),
  settings jsonb not null check (public.spring_balls_settings_are_valid(settings)),
  created_at timestamptz not null default now()
);

create index if not exists spring_balls_presets_created_at_idx
  on public.spring_balls_presets (created_at desc);

alter table public.spring_balls_presets enable row level security;

revoke all on table public.spring_balls_presets from anon, authenticated;
grant select on table public.spring_balls_presets to anon, authenticated;
grant insert, delete on table public.spring_balls_presets to authenticated;

drop policy if exists "Spring Balls presets are public" on public.spring_balls_presets;
create policy "Spring Balls presets are public"
  on public.spring_balls_presets
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Visitors publish their own Spring Balls presets" on public.spring_balls_presets;
create policy "Visitors publish their own Spring Balls presets"
  on public.spring_balls_presets
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Visitors delete their own Spring Balls presets" on public.spring_balls_presets;
create policy "Visitors delete their own Spring Balls presets"
  on public.spring_balls_presets
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
