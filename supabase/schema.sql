-- ============================================================
-- E5 Energy Race 2026 — Schema SQL completo
-- Ejecutar en Supabase SQL Editor en orden
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type event_status as enum ('draft', 'active', 'finished');
create type category_slug as enum ('pushcarts', 'hpvs');
create type test_type as enum ('velocity', 'versatility');
create type lane_type as enum ('C2', 'C4', 'C6');
create type run_status as enum ('pending', 'recorded', 'failed', 'reprogrammed');
create type heat_status as enum ('pending', 'active', 'finished', 'failed');
create type user_role as enum ('admin', 'timer', 'judge');

-- ============================================================
-- TABLES
-- ============================================================

create table events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  start_date date not null,
  status event_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  slug category_slug not null,
  name text not null,
  unique(event_id, slug)
);

create table teams (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  school text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  shield_url text,
  created_at timestamptz not null default now(),
  unique(category_id, name)
);

-- user_profiles mirrors auth.users with role info
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role user_role not null default 'timer',
  full_name text,
  created_at timestamptz not null default now()
);

create table user_assignments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  test_type test_type not null,
  lane lane_type,
  created_at timestamptz not null default now(),
  unique(user_id, event_id, test_type)
);

create table heats (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  test_type test_type not null,
  heat_number int not null,
  status heat_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique(event_id, test_type, heat_number)
);

create table heat_assignments (
  id uuid primary key default uuid_generate_v4(),
  heat_id uuid not null references heats(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  lane lane_type
);

create table runs (
  id uuid primary key default uuid_generate_v4(),
  heat_assignment_id uuid not null references heat_assignments(id) on delete cascade,
  time_ms bigint,
  has_penalty_velocity boolean not null default false,
  penalty_versatility_count_out int not null default 0,
  penalty_versatility_count_crash int not null default 0,
  penalty_versatility_count_cut int not null default 0,
  status run_status not null default 'pending',
  recorded_by uuid references user_profiles(id),
  recorded_at timestamptz,
  edited_by uuid references user_profiles(id),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create table scores (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references teams(id) on delete cascade unique,
  design_brief_score int not null default 0 check (design_brief_score between 0 and 30),
  pitch_score int not null default 0 check (pitch_score between 0 and 20),
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_teams_event on teams(event_id);
create index idx_teams_category on teams(category_id);
create index idx_heats_event on heats(event_id);
create index idx_heat_assignments_heat on heat_assignments(heat_id);
create index idx_runs_heat_assignment on runs(heat_assignment_id);
create index idx_runs_status on runs(status);

-- ============================================================
-- HELPER FUNCTION: points by position
-- ============================================================
create or replace function points_by_position(pos int) returns int as $$
begin
  return case pos
    when 1 then 25
    when 2 then 20
    when 3 then 15
    when 4 then 10
    when 5 then 5
    when 6 then 4
    when 7 then 3
    else 0
  end;
end;
$$ language plpgsql immutable;

-- ============================================================
-- RANKING VIEW
-- ============================================================
create or replace view v_rankings as
with velocity_totals as (
  select
    t.id as team_id,
    t.event_id,
    t.category_id,
    sum(
      r.time_ms +
      case when r.has_penalty_velocity then 10000 else 0 end
    ) as raw_time_ms,
    min(
      r.time_ms +
      case when r.has_penalty_velocity then 10000 else 0 end
    ) as best_run_ms
  from teams t
  join heat_assignments ha on ha.team_id = t.id
  join heats h on h.id = ha.heat_id and h.test_type = 'velocity'
  join runs r on r.heat_assignment_id = ha.id and r.status = 'recorded'
  group by t.id, t.event_id, t.category_id
),
versatility_totals as (
  select
    t.id as team_id,
    t.event_id,
    t.category_id,
    sum(
      r.time_ms +
      (r.penalty_versatility_count_out + r.penalty_versatility_count_crash + r.penalty_versatility_count_cut) * 5000
    ) as raw_time_ms,
    min(
      r.time_ms +
      (r.penalty_versatility_count_out + r.penalty_versatility_count_crash + r.penalty_versatility_count_cut) * 5000
    ) as best_run_ms
  from teams t
  join heat_assignments ha on ha.team_id = t.id
  join heats h on h.id = ha.heat_id and h.test_type = 'versatility'
  join runs r on r.heat_assignment_id = ha.id and r.status = 'recorded'
  group by t.id, t.event_id, t.category_id
),
ranked as (
  select
    t.id as team_id,
    t.event_id,
    t.category_id,
    c.slug as category_slug,
    t.name as team_name,
    t.school,
    t.color_hex,
    t.shield_url,
    vt.raw_time_ms as time_velocity_total,
    vs.raw_time_ms as time_versatility_total,
    rank() over (
      partition by t.category_id
      order by vt.raw_time_ms asc nulls last, vt.best_run_ms asc nulls last
    ) as position_velocity,
    rank() over (
      partition by t.category_id
      order by vs.raw_time_ms asc nulls last, vs.best_run_ms asc nulls last
    ) as position_versatility,
    coalesce(s.design_brief_score, 0) as points_design_brief,
    coalesce(s.pitch_score, 0) as points_pitch
  from teams t
  join categories c on c.id = t.category_id
  left join velocity_totals vt on vt.team_id = t.id
  left join versatility_totals vs on vs.team_id = t.id
  left join scores s on s.team_id = t.id
)
select
  r.*,
  points_by_position(r.position_velocity::int) as points_velocity,
  points_by_position(r.position_versatility::int) as points_versatility,
  (
    coalesce(points_by_position(r.position_velocity::int), 0) +
    coalesce(points_by_position(r.position_versatility::int), 0) +
    r.points_design_brief +
    r.points_pitch
  ) as total_score,
  rank() over (
    partition by r.category_id
    order by (
      coalesce(points_by_position(r.position_velocity::int), 0) +
      coalesce(points_by_position(r.position_versatility::int), 0) +
      r.points_design_brief +
      r.points_pitch
    ) desc
  ) as final_position
from ranked r;

-- ============================================================
-- TRIGGER: auto-create user_profile on signup
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'timer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table events enable row level security;
alter table categories enable row level security;
alter table teams enable row level security;
alter table user_profiles enable row level security;
alter table user_assignments enable row level security;
alter table heats enable row level security;
alter table heat_assignments enable row level security;
alter table runs enable row level security;
alter table scores enable row level security;

-- Public read for scoreboard
create policy "public_read_events" on events for select using (true);
create policy "public_read_categories" on categories for select using (true);
create policy "public_read_teams" on teams for select using (true);
create policy "public_read_heats" on heats for select using (true);
create policy "public_read_heat_assignments" on heat_assignments for select using (true);
create policy "public_read_runs" on runs for select using (true);
create policy "public_read_scores" on scores for select using (true);

-- user_profiles: each user sees their own, admin sees all
create policy "user_read_own_profile" on user_profiles
  for select using (auth.uid() = id);

create policy "admin_read_all_profiles" on user_profiles
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "user_update_own_profile" on user_profiles
  for update using (auth.uid() = id);

-- user_assignments: authenticated users read their own
create policy "user_read_own_assignments" on user_assignments
  for select using (auth.uid() = user_id);

create policy "admin_read_all_assignments" on user_assignments
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

-- Admin full write on most tables
create policy "admin_write_events" on events for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_categories" on categories for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_teams" on teams for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_user_profiles" on user_profiles for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_user_assignments" on user_assignments for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_heats" on heats for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_heat_assignments" on heat_assignments for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_runs" on runs for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

create policy "admin_write_scores" on scores for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

-- Timer: insert/update runs for their assigned lane
create policy "timer_insert_runs" on runs for insert with check (
  exists (
    select 1
    from user_profiles up
    join user_assignments ua on ua.user_id = up.id
    join heat_assignments ha on ha.id = runs.heat_assignment_id
    where up.id = auth.uid()
      and up.role = 'timer'
      and ua.lane = ha.lane
  )
);

create policy "timer_update_runs" on runs for update using (
  exists (
    select 1
    from user_profiles up
    join user_assignments ua on ua.user_id = up.id
    join heat_assignments ha on ha.id = runs.heat_assignment_id
    where up.id = auth.uid()
      and up.role = 'timer'
      and ua.lane = ha.lane
  )
);

-- Judge: update versatility penalty counts only
create policy "judge_update_penalty" on runs for update using (
  exists (
    select 1
    from user_profiles up
    join user_assignments ua on ua.user_id = up.id
    where up.id = auth.uid()
      and up.role = 'judge'
      and ua.test_type = 'versatility'
  )
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert the main event
insert into events (id, name, start_date, status)
values ('00000000-0000-0000-0000-000000000001', 'Energy Race 2026', '2026-05-14', 'draft');

-- Insert categories
insert into categories (id, event_id, slug, name) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'pushcarts', 'Pushcarts (Primaria 4° y 5°)'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'hpvs', 'HPV''s (Bachillerato 6° y 7°)');
