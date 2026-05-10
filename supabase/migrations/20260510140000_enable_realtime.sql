-- Habilitar Realtime para todas las tablas críticas del flujo de cronometraje.
-- Sin esto, los clientes no reciben notificaciones de INSERT/UPDATE/DELETE.

alter publication supabase_realtime add table runs;
alter publication supabase_realtime add table heats;
alter publication supabase_realtime add table heat_assignments;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table scores;
alter publication supabase_realtime add table events;
