-- Control de "publicación de resultados" desde admin.
-- results_published: si false, /scores muestra mensaje de suspense
-- podium_reveal_step: 0 = todos de espaldas, 1 = 3er puesto revelado,
--                     2 = 2do revelado (3 y 2 visibles), 3 = todos revelados (incluye tabla)
alter table events
  add column results_published boolean not null default false,
  add column podium_reveal_step int not null default 0;
