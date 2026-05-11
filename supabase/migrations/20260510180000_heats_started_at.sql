-- Timestamp de cuándo el admin activó la manga.
-- Sirve para mostrar un cronómetro aproximado en /live mientras los
-- cronometristas pulsan START en pista. Cuando llega el run.time_ms
-- recorded, el tiempo real reemplaza al aproximado.

alter table heats
  add column started_at timestamptz;
