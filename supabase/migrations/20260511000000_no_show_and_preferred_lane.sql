-- Soporte para equipos que no se presentan + carril preferido del cronometrista

-- 1) Marca de "no se presentó" en heat_assignments (por equipo × manga)
alter table heat_assignments
  add column no_show boolean not null default false;

-- 2) Carril preferido del cronometrista (default al cargar el fixture)
alter table users
  add column preferred_lane lane_type;

-- 3) Seed inicial de preferencia de carril para los cronometristas existentes
update users set preferred_lane = 'C2' where email = 'carril2@e5race.com';
update users set preferred_lane = 'C4' where email = 'carril4@e5race.com';
update users set preferred_lane = 'C6' where email = 'carril6@e5race.com';
