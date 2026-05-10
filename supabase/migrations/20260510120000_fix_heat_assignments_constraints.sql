-- Fix: heat_assignments necesita UNIQUE para que upsert funcione
-- y para evitar duplicados de equipo en una manga o de dos equipos en el mismo carril.

-- Borrar asignaciones huérfanas/duplicadas si existen
delete from heat_assignments a
using heat_assignments b
where a.id < b.id
  and a.heat_id = b.heat_id
  and a.team_id = b.team_id;

-- Un equipo no puede aparecer dos veces en la misma manga
alter table heat_assignments
  add constraint heat_assignments_heat_team_unique unique (heat_id, team_id);

-- En velocidad, un carril no puede tener dos equipos en la misma manga
-- (lane es NULL en versatilidad, así que la unicidad solo aplica cuando lane no es null)
create unique index heat_assignments_heat_lane_unique
  on heat_assignments (heat_id, lane)
  where lane is not null;
