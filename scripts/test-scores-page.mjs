import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup: limpiar
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));
await sb.from("scores").delete().neq("id", "00000000-0000-0000-0000-000000000000");

const { data: pushTeams } = await sb.from("teams").select("id, name").eq("category_id", "00000000-0000-0000-0000-000000000010");
console.log("Pushcarts teams:", pushTeams.length);

// Notas Design Brief y Pitch para 4 pushcarts
for (let i = 0; i < pushTeams.length; i++) {
  await sb.from("scores").insert({ team_id: pushTeams[i].id, design_brief_score: 25 - i*2, pitch_score: 18 - i });
}

// Crear 3 mangas de velocidad para pushcarts
const heatIds = [];
for (let n = 1; n <= 3; n++) {
  const { data: h } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: n, status: "finished" }).select("id").single();
  heatIds.push(h.id);
  await sb.from("heat_assignments").insert([
    { heat_id: h.id, team_id: pushTeams[0].id, lane: "C2" },
    { heat_id: h.id, team_id: pushTeams[1].id, lane: "C4" },
    { heat_id: h.id, team_id: pushTeams[2].id, lane: "C6" },
  ]);
}

// El equipo 4 solo corrió en M1 (faltan mangas — para probar el warning)
await sb.from("heat_assignments").insert({ heat_id: heatIds[0], team_id: pushTeams[3].id, lane: null });
// Oops el lane no puede ser null para velocidad y choca con C2. Mejor lo agrego sin esto.
await sb.from("heat_assignments").delete().eq("team_id", pushTeams[3].id).eq("heat_id", heatIds[0]);

// Insertar runs
// Team0: 5.20s, 5.50s, 5.10s = 15.80
// Team1: 5.80s, 6.00s, 5.90s = 17.70
// Team2: 5.40s, 5.30s, 5.20s = 15.90
for (let h = 0; h < 3; h++) {
  const { data: has } = await sb.from("heat_assignments").select("id, team_id").eq("heat_id", heatIds[h]);
  for (const ha of has) {
    let time;
    if (ha.team_id === pushTeams[0].id) time = [5200, 5500, 5100][h];
    else if (ha.team_id === pushTeams[1].id) time = [5800, 6000, 5900][h];
    else if (ha.team_id === pushTeams[2].id) time = [5400, 5300, 5200][h];
    await sb.from("runs").insert({ heat_assignment_id: ha.id, time_ms: time, status: "recorded" });
  }
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

console.log("\n=== TESTS ===");
const top1Name = await page.locator(".text-lg.font-bold, .text-xl.font-bold").first().textContent();
console.log(`  Top 1 mostrado: ${top1Name?.trim()}`);

// Verificar que está la tabla con columnas correctas
const headerExists = await page.locator("th:has-text('Velocidad')").isVisible();
console.log(`  Header 'Velocidad' visible: ${headerExists ? "✓" : "✗"}`);

// Verificar tiempos con centésimas
const time1 = await page.locator("text=/00:15\\.80/").first().isVisible().catch(() => false);
console.log(`  Tiempo 00:15.80 visible: ${time1 ? "✓" : "✗"}`);

// Tab a HPV's
await page.locator("button:has-text(\"HPV's\")").click();
await page.waitForTimeout(800);
const sinDatos = await page.locator("text=Sin datos disponibles").isVisible().catch(() => false);
console.log(`  HPVs sin datos (esperado): ${sinDatos ? "✓" : "✗"}`);

await page.screenshot({ path: "/tmp/scores-page.png", fullPage: true });

// Volver a pushcarts y ver completo
await page.locator("button:has-text('Pushcarts')").click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/scores-pushcarts.png", fullPage: true });

console.log("\n  screenshots: /tmp/scores-pushcarts.png");

await browser.close();
