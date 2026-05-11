#!/usr/bin/env node
/**
 * Seed de datos mock para demo de /scores.
 * Idempotente: si ya hay datos, los reemplaza.
 *
 * Resultado:
 * - 8 equipos (4 pushcarts + 4 hpvs) con notas Design + Pitch
 * - 3 mangas de velocidad finalizadas para cada categoría
 * - 2 mangas de versatilidad finalizadas para cada categoría
 * - Todos los runs con tiempos realistas y algunos con penalización
 * - results_published = false, podium_reveal_step = 0 (suspense activo)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";
const PUSH = "00000000-0000-0000-0000-000000000010";
const HPV = "00000000-0000-0000-0000-000000000011";

console.log("→ Limpiando datos previos…");
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) {
  await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a => a.id));
  await sb.from("heat_assignments").delete().in("id", ha0.map(a => a.id));
}
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h => h.id));
await sb.from("scores").delete().neq("id", "00000000-0000-0000-0000-000000000000");

console.log("→ Reset estado del evento (results_published=false, step=0)…");
await sb.from("events").update({ results_published: false, podium_reveal_step: 0, status: "active" }).eq("id", EVENT_ID);

const { data: pushTeams } = await sb.from("teams").select("id, name").eq("category_id", PUSH).order("name");
const { data: hpvTeams } = await sb.from("teams").select("id, name").eq("category_id", HPV).order("name");
console.log(`  ${pushTeams.length} pushcarts + ${hpvTeams.length} HPVs`);

// ── Notas Design Brief + Pitch ──────────────────────────────────────────────
console.log("→ Notas Design Brief + Pitch…");
// Pushcarts (con variedad para que el ranking final no quede determinado solo por la pista)
const pushScores = [
  { design: 28, pitch: 18 },  // teams[0]
  { design: 22, pitch: 15 },  // teams[1]
  { design: 25, pitch: 19 },  // teams[2]
  { design: 20, pitch: 14 },  // teams[3]
];
for (let i = 0; i < pushTeams.length && i < 4; i++) {
  await sb.from("scores").insert({
    team_id: pushTeams[i].id,
    design_brief_score: pushScores[i].design,
    pitch_score: pushScores[i].pitch,
  });
}

const hpvScores = [
  { design: 27, pitch: 17 },
  { design: 24, pitch: 16 },
  { design: 26, pitch: 18 },
  { design: 21, pitch: 13 },
];
for (let i = 0; i < hpvTeams.length && i < 4; i++) {
  await sb.from("scores").insert({
    team_id: hpvTeams[i].id,
    design_brief_score: hpvScores[i].design,
    pitch_score: hpvScores[i].pitch,
  });
}

// ── Velocidad: 3 mangas para Pushcarts, 3 mangas para HPVs ──────────────────
async function createVelocityHeats(teams, label) {
  console.log(`→ Velocidad ${label}: 3 mangas`);
  // Asegurar que tenemos 3 equipos (los primeros 3)
  const t = teams.slice(0, 3);
  const heatIds = [];
  for (let n = 1; n <= 3; n++) {
    const { data: h } = await sb
      .from("heats")
      .insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: n, status: "finished" })
      .select("id")
      .single();
    heatIds.push(h.id);
    await sb.from("heat_assignments").insert([
      { heat_id: h.id, team_id: t[0].id, lane: "C2" },
      { heat_id: h.id, team_id: t[1].id, lane: "C4" },
      { heat_id: h.id, team_id: t[2].id, lane: "C6" },
    ]);
    // Tiempos por equipo (ms) — el primer equipo es el más rápido
    const times = [
      // M1
      [5200, 5800, 5400],
      // M2
      [5100, 5900, 5350],
      // M3
      [5050, 6000, 5300],
    ];
    const { data: has } = await sb.from("heat_assignments").select("id, team_id").eq("heat_id", h.id);
    for (let i = 0; i < has.length; i++) {
      const ha = has[i];
      const teamIdx = t.findIndex(x => x.id === ha.team_id);
      await sb.from("runs").insert({
        heat_assignment_id: ha.id,
        time_ms: times[n - 1][teamIdx],
        has_penalty_velocity: (n === 2 && teamIdx === 1),  // teams[1] tiene una penalización en M2
        status: "recorded",
      });
    }
  }
}

await createVelocityHeats(pushTeams, "pushcarts");

// HPV: usar números 4-6 para no chocar con pushcarts
async function createVelocityHeatsHpv(teams) {
  console.log("→ Velocidad HPVs: 3 mangas");
  const t = teams.slice(0, 3);
  for (let n = 4; n <= 6; n++) {
    const { data: h } = await sb
      .from("heats")
      .insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: n, status: "finished" })
      .select("id").single();
    await sb.from("heat_assignments").insert([
      { heat_id: h.id, team_id: t[0].id, lane: "C2" },
      { heat_id: h.id, team_id: t[1].id, lane: "C4" },
      { heat_id: h.id, team_id: t[2].id, lane: "C6" },
    ]);
    const times = [
      [4800, 5300, 5000],
      [4900, 5200, 5100],
      [4750, 5400, 5050],
    ];
    const { data: has } = await sb.from("heat_assignments").select("id, team_id").eq("heat_id", h.id);
    for (const ha of has) {
      const teamIdx = t.findIndex(x => x.id === ha.team_id);
      await sb.from("runs").insert({
        heat_assignment_id: ha.id,
        time_ms: times[n - 4][teamIdx],
        status: "recorded",
      });
    }
  }
}
await createVelocityHeatsHpv(hpvTeams);

// ── Versatilidad: cada equipo corre 2 mangas (una manga = un equipo) ────────
async function createVersatilityHeats(teams, startN, label) {
  console.log(`→ Versatilidad ${label}: 2 mangas por equipo`);
  let heatNum = startN;
  for (let runIdx = 0; runIdx < 2; runIdx++) {
    for (const t of teams.slice(0, 3)) {
      const { data: h, error } = await sb
        .from("heats")
        .insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: heatNum, status: "finished" })
        .select("id")
        .single();
      if (error) { console.error("heat err:", error.message); continue; }
      await sb.from("heat_assignments").insert({ heat_id: h.id, team_id: t.id, lane: null });
      const { data: ha } = await sb.from("heat_assignments").select("id").eq("heat_id", h.id).single();
      const baseTime = 95000 + teams.indexOf(t) * 5000 + runIdx * 2000;
      await sb.from("runs").insert({
        heat_assignment_id: ha.id,
        time_ms: baseTime,
        penalty_versatility_count_out: runIdx === 0 ? 1 : 0,
        penalty_versatility_count_crash: 0,
        penalty_versatility_count_cut: 0,
        status: "recorded",
      });
      heatNum++;
    }
  }
}
// Pushcarts: heats 1-6 de versatilidad
await createVersatilityHeats(pushTeams, 1, "pushcarts");
// HPVs: heats 7-12 de versatilidad
await createVersatilityHeats(hpvTeams, 7, "HPVs");

// ── Resumen ──────────────────────────────────────────────────────────────────
const { data: finalRanks } = await sb.from("v_rankings").select("category_slug, team_name, total_score, final_position").eq("event_id", EVENT_ID).order("category_slug").order("final_position");
console.log("\n=== Ranking Final ===");
for (const r of finalRanks) {
  console.log(`  ${r.category_slug.padEnd(10)} ${r.final_position}° ${r.team_name.padEnd(20)} ${r.total_score}/100`);
}
console.log("\n✓ Datos demo cargados. /scores muestra mensaje de suspense.");
console.log("✓ Admin debe pulsar 'Publicar resultados' en /admin para activar el podio.");
