-- Unificar penalización de versatilidad con la de velocidad: ambas usan
-- has_penalty_velocity (+10s toggle simple), descartando los 3 contadores
-- granulares (out/crash/cut).
--
-- Las columnas penalty_versatility_count_* permanecen en la tabla por
-- compatibilidad con datos históricos pero ya no se suman en v_rankings.

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
    sum(r.time_ms + case when r.has_penalty_velocity then 10000 else 0 end) as raw_time_ms,
    min(r.time_ms + case when r.has_penalty_velocity then 10000 else 0 end) as best_run_ms
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
