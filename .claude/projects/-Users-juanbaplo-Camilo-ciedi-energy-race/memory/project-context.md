---
name: project-context
description: Sistema de cronometraje y rankings Energy Race 2026 — CIEDI E5 Challenge. Stack, rutas, modelo de datos, fechas clave.
type: project
---

Sistema web responsive para gestionar cronometraje, penalizaciones, rankings y scoreboard en tiempo real para la competencia Energy Race 2026 del E5 Challenge de CIEDI.

**Fecha competencia:** jueves 14 de mayo de 2026. Ensayo miércoles 13.

**Why:** Reemplaza cronómetros manuales + Excel. Cero margen de error, evento único.

**Stack:** Next.js 14 (App Router) + Supabase + shadcn/ui + Tailwind + Vercel.

**EVENT_ID fijo:** `00000000-0000-0000-0000-000000000001`

**Rutas:**
- `/` landing, `/login` auth, `/live` scoreboard público (sin login)
- `/admin` dashboard, `/admin/teams`, `/admin/fixtures`, `/admin/scores`, `/admin/runs`, `/admin/heats`, `/admin/users`
- `/timer` cronometrista, `/judge` juez versatilidad

**Roles:** admin / timer / judge + público (sin auth)

**Categorías hardcodeadas:** pushcarts (Primaria 4-5°) y hpvs (Bachillerato 6-7°)

**Scoring:** Design Brief (0-30) + Pitch (0-20) + Velocidad (posición→25/20/15/10/5/4/3) + Versatilidad (mismo) = 100 pts

**Penalizaciones:** Velocidad +10s toggle, Versatilidad +5s por (salió/chocó/cortó) acumulativo

**Vista SQL:** `v_rankings` en Supabase calcula posiciones y puntos automáticamente

**Realtime:** Canal `runs` en Supabase → scoreboard público se re-renderiza en <2s

**Supabase schema:** ver `supabase/schema.sql` — contiene tablas, RLS, vista v_rankings, trigger new user, seeds

**How to apply:** Al continuar desarrollo, el schema SQL ya está en `supabase/schema.sql`. Ejecutarlo en Supabase SQL Editor. Las env vars van en `.env.local`.
