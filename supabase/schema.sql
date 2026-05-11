-- ============================================================
-- E5 Energy Race 2026 — Schema SQL (sin Supabase Auth)
-- Ejecutar en Supabase SQL Editor (borrar todo y correr de cero)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type event_status  as enum ('draft','active','finished');
create type category_slug as enum ('pushcarts','hpvs');
create type test_type     as enum ('velocity','versatility');
create type lane_type     as enum ('C2','C4','C6');
create type run_status    as enum ('pending','recorded','failed','reprogrammed');
create type heat_status   as enum ('pending','active','finished','failed');
create type user_role     as enum ('admin','timer','judge');

-- ============================================================
-- USERS (tabla propia, sin auth.users)
-- ============================================================
create table users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null unique,
  password_hash text        not null,
  role          user_role   not null default 'timer',
  full_name     text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- EVENTO Y CATEGORÍAS
-- ============================================================
create table events (
  id         uuid         primary key default gen_random_uuid(),
  name       text         not null,
  start_date date         not null,
  status     event_status not null default 'draft',
  created_at timestamptz  not null default now()
);

create table categories (
  id       uuid          primary key default gen_random_uuid(),
  event_id uuid          not null references events(id) on delete cascade,
  slug     category_slug not null,
  name     text          not null,
  unique(event_id, slug)
);

-- ============================================================
-- EQUIPOS
-- ============================================================
create table teams (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references events(id) on delete cascade,
  category_id uuid        not null references categories(id) on delete cascade,
  name        text        not null,
  school      text        not null,
  color_hex   text        not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  shield_url  text,
  created_at  timestamptz not null default now(),
  unique(category_id, name)
);

-- ============================================================
-- ASIGNACIONES DE OPERADORES
-- ============================================================
create table user_assignments (
  id         uuid      primary key default gen_random_uuid(),
  user_id    uuid      not null references users(id) on delete cascade,
  event_id   uuid      not null references events(id) on delete cascade,
  test_type  test_type not null,
  created_at timestamptz not null default now(),
  unique(user_id, event_id, test_type)
);

-- ============================================================
-- MANGAS Y FIXTURE
-- ============================================================
create table heats (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references events(id) on delete cascade,
  test_type   test_type   not null,
  heat_number int         not null,
  status      heat_status not null default 'pending',
  started_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique(event_id, test_type, heat_number)
);

create table heat_assignments (
  id            uuid      primary key default gen_random_uuid(),
  heat_id       uuid      not null references heats(id) on delete cascade,
  team_id       uuid      not null references teams(id) on delete cascade,
  lane          lane_type,
  timer_user_id uuid      references users(id) on delete set null,
  unique (heat_id, team_id)
);

-- Un carril no puede tener dos equipos en la misma manga (solo aplica si lane no es null)
create unique index heat_assignments_heat_lane_unique
  on heat_assignments (heat_id, lane)
  where lane is not null;

-- Un cronometrista no puede estar en dos carriles de la misma manga
create unique index heat_assignments_heat_timer_unique
  on heat_assignments (heat_id, timer_user_id)
  where timer_user_id is not null;

-- ============================================================
-- TIEMPOS / RUNS
-- ============================================================
create table runs (
  id                              uuid        primary key default gen_random_uuid(),
  heat_assignment_id              uuid        not null references heat_assignments(id) on delete cascade,
  time_ms                         bigint,
  has_penalty_velocity            boolean     not null default false,
  penalty_versatility_count_out   int         not null default 0,
  penalty_versatility_count_crash int         not null default 0,
  penalty_versatility_count_cut   int         not null default 0,
  status                          run_status  not null default 'pending',
  recorded_by                     uuid        references users(id),
  recorded_at                     timestamptz,
  edited_by                       uuid        references users(id),
  edited_at                       timestamptz,
  created_at                      timestamptz not null default now()
);

-- ============================================================
-- NOTAS (Design Brief + Pitch)
-- ============================================================
create table scores (
  id                  uuid        primary key default gen_random_uuid(),
  team_id             uuid        not null references teams(id) on delete cascade unique,
  design_brief_score  int         not null default 0 check (design_brief_score between 0 and 30),
  pitch_score         int         not null default 0 check (pitch_score between 0 and 20),
  created_at          timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
create index idx_teams_event        on teams(event_id);
create index idx_teams_category     on teams(category_id);
create index idx_heats_event        on heats(event_id);
create index idx_heat_assign_heat   on heat_assignments(heat_id);
create index idx_runs_heat_assign   on runs(heat_assignment_id);
create index idx_runs_status        on runs(status);

-- ============================================================
-- FUNCIÓN: puntos por posición
-- ============================================================
create or replace function points_by_position(pos int) returns int as $$
begin
  return case pos
    when 1 then 25
    when 2 then 20
    when 3 then 15
    when 4 then 10
    when 5 then  5
    when 6 then  4
    when 7 then  3
    else 0
  end;
end;
$$ language plpgsql immutable;

-- ============================================================
-- VISTA: rankings calculados automáticamente
-- ============================================================
create or replace view v_rankings as
with velocity_totals as (
  select
    t.id as team_id,
    t.event_id,
    t.category_id,
    sum(r.time_ms + case when r.has_penalty_velocity then 10000 else 0 end) as raw_time_ms,
    min(r.time_ms + case when r.has_penalty_velocity then 10000 else 0 end) as best_run_ms
  from teams t
  join heat_assignments ha on ha.team_id = t.id
  join heats h             on h.id = ha.heat_id and h.test_type = 'velocity'
  join runs r              on r.heat_assignment_id = ha.id and r.status = 'recorded'
  group by t.id, t.event_id, t.category_id
),
versatility_totals as (
  select
    t.id as team_id,
    t.event_id,
    t.category_id,
    sum(r.time_ms +
        (r.penalty_versatility_count_out +
         r.penalty_versatility_count_crash +
         r.penalty_versatility_count_cut) * 5000) as raw_time_ms,
    min(r.time_ms +
        (r.penalty_versatility_count_out +
         r.penalty_versatility_count_crash +
         r.penalty_versatility_count_cut) * 5000) as best_run_ms
  from teams t
  join heat_assignments ha on ha.team_id = t.id
  join heats h             on h.id = ha.heat_id and h.test_type = 'versatility'
  join runs r              on r.heat_assignment_id = ha.id and r.status = 'recorded'
  group by t.id, t.event_id, t.category_id
),
ranked as (
  select
    t.id          as team_id,
    t.event_id,
    t.category_id,
    c.slug        as category_slug,
    t.name        as team_name,
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
    coalesce(s.pitch_score, 0)        as points_pitch
  from teams t
  join categories c on c.id = t.category_id
  left join velocity_totals    vt on vt.team_id = t.id
  left join versatility_totals vs on vs.team_id = t.id
  left join scores             s  on s.team_id  = t.id
)
select
  r.*,
  points_by_position(r.position_velocity::int)    as points_velocity,
  points_by_position(r.position_versatility::int) as points_versatility,
  (coalesce(points_by_position(r.position_velocity::int),0) +
   coalesce(points_by_position(r.position_versatility::int),0) +
   r.points_design_brief +
   r.points_pitch)                                as total_score,
  rank() over (
    partition by r.category_id
    order by (
      coalesce(points_by_position(r.position_velocity::int),0) +
      coalesce(points_by_position(r.position_versatility::int),0) +
      r.points_design_brief +
      r.points_pitch
    ) desc
  ) as final_position
from ranked r;

-- ============================================================
-- RLS: deshabilitado (validación en Next.js server actions)
-- La app usa service role key en el servidor — no necesita RLS.
-- ============================================================
-- No se habilita RLS en ninguna tabla.

-- ============================================================
-- SEEDS
-- ============================================================

-- Evento principal
insert into events (id, name, start_date, status) values
  ('00000000-0000-0000-0000-000000000001', 'Energy Race 2026', '2026-05-14', 'draft');

-- Categorías
insert into categories (id, event_id, slug, name) values
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'pushcarts', 'Pushcarts (Primaria 4° y 5°)'),
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'hpvs', 'HPV''s (Bachillerato 6° y 7°)');

-- Usuarios operadores (contraseñas en texto plano abajo)
-- admin     → admin2026
-- timer*    → timer2026
-- juez      → juez2026
insert into users (id, email, password_hash, role, full_name) values
  ('00000000-0000-0000-0000-000000000100',
   'admin@e5race.com',
   '$2b$10$998u3rZyW6N6arV7H4xXBuCKa0ENjWC41vdyEnV/KDeEkdxPpPmlO',
   'admin', 'Administrador'),
  ('00000000-0000-0000-0000-000000000101',
   'carril2@e5race.com',
   '$2b$10$PK/f7DP9tbqHgUP9ZcJp4uYjWQT/oV.8Lhe9Fv/qsGp7fkJfeKibG',
   'timer', 'Cronometrista C2'),
  ('00000000-0000-0000-0000-000000000102',
   'carril4@e5race.com',
   '$2b$10$zmty8BWpkH1MIkozIouz7udAnZlDC7rdSaXJ9g1OS43ifOetDgbzy',
   'timer', 'Cronometrista C4'),
  ('00000000-0000-0000-0000-000000000103',
   'carril6@e5race.com',
   '$2b$10$gAifp7nCMuIFcaqAOUPy9OYEeVo7EY0LF5l5ojyFlYg7jZokhcmeG',
   'timer', 'Cronometrista C6'),
  ('00000000-0000-0000-0000-000000000104',
   'juez@e5race.com',
   '$2b$10$OYCXOlxmf/9S.XXcL.DA7.gc2AT0Nfojg.SGR5HLy.XyIKiJ9HXxa',
   'judge', 'Juez Versatilidad');

-- Asignaciones de prueba de los operadores (carril ya no es fijo; se asigna por manga)
insert into user_assignments (user_id, event_id, test_type) values
  ('00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000001', 'velocity'),
  ('00000000-0000-0000-0000-000000000102',
   '00000000-0000-0000-0000-000000000001', 'velocity'),
  ('00000000-0000-0000-0000-000000000103',
   '00000000-0000-0000-0000-000000000001', 'velocity'),
  ('00000000-0000-0000-0000-000000000104',
   '00000000-0000-0000-0000-000000000001', 'versatility');
