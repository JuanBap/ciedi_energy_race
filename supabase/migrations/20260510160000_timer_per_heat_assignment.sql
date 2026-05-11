-- Cronometrista por carril × manga.
-- Antes: user_assignments.lane definía un carril FIJO para todo el evento.
-- Ahora: heat_assignments.timer_user_id define qué cronometrista opera
--        ese carril en esa manga específica. Puede ser NULL si el carril
--        está sin cronometrista todavía o está vacío.

-- 1) Añadir columna a heat_assignments
alter table heat_assignments
  add column timer_user_id uuid references users(id) on delete set null;

-- Un mismo cronometrista no puede estar en dos carriles de la misma manga
create unique index heat_assignments_heat_timer_unique
  on heat_assignments (heat_id, timer_user_id)
  where timer_user_id is not null;

-- 2) Quitar lane de user_assignments (carriles ya no son fijos por usuario)
alter table user_assignments drop column if exists lane;

-- 3) Realtime ya está habilitado para heat_assignments (migración anterior)
