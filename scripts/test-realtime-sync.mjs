import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup: limpiar y crear 2 heats con asignaciones
console.log("→ setup…");
const { data: heats0 } = await sb.from("heats").select("id");
if (heats0?.length) {
  const ids = heats0.map(h => h.id);
  const { data: has } = await sb.from("heat_assignments").select("id").in("heat_id", ids);
  if (has?.length) await sb.from("runs").delete().in("heat_assignment_id", has.map(a=>a.id));
  await sb.from("heat_assignments").delete().in("heat_id", ids);
  await sb.from("heats").delete().in("id", ids);
}
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(2);
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: "C2" });
const { data: ha } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).single();

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083", email: "admin@gmail.com", role: "admin", full_name: "Administrador",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`); });

// ── TEST 1: Dashboard ───────────────────────────────────────────────────────
console.log("\n=== TEST 1: Dashboard se actualiza al insertar run ===");
await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
await page.waitForSelector("text=Datos en vivo", { timeout: 10000 });
console.log("  ✓ Status 'Datos en vivo' visible");

const tiemposBefore = await page.locator("text=Tiempos Registrados").locator("..").locator("p.text-3xl").innerText();
console.log(`  Tiempos antes: ${tiemposBefore}`);

// Insertar un run desde la DB simulando un cronometrista
console.log("  → Insertando run desde el servidor…");
await sb.from("runs").insert({
  heat_assignment_id: ha.id,
  time_ms: 5000,
  has_penalty_velocity: false,
  status: "recorded",
});

// Esperar la propagación realtime
await page.waitForTimeout(3000);

const tiemposAfter = await page.locator("text=Tiempos Registrados").locator("..").locator("p.text-3xl").innerText();
console.log(`  Tiempos después: ${tiemposAfter}`);
const dashboardUpdated = parseInt(tiemposAfter) > parseInt(tiemposBefore);
console.log(`  ${dashboardUpdated ? "✓" : "✗"} Dashboard se actualizó sin recargar (${tiemposBefore} → ${tiemposAfter})`);

await page.screenshot({ path: "/tmp/realtime-dashboard.png", fullPage: false });

// ── TEST 2: Runs page ──────────────────────────────────────────────────────
console.log("\n=== TEST 2: /admin/runs se actualiza al insertar otro run ===");
await page.goto("http://localhost:3000/admin/runs", { waitUntil: "networkidle" });
await page.waitForSelector("text=Sincronizado en vivo", { timeout: 10000 });

const rowsBefore = await page.locator("tbody tr").count();
console.log(`  Filas antes: ${rowsBefore}`);

// Agregar otro heat con asignación
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "active" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h2.id, team_id: teams[1].id, lane: "C4" });
const { data: ha2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h2.id).single();
console.log("  → Insertando segundo run…");
await sb.from("runs").insert({
  heat_assignment_id: ha2.id,
  time_ms: 7500,
  has_penalty_velocity: true,
  status: "recorded",
});

await page.waitForTimeout(3000);
const rowsAfter = await page.locator("tbody tr").count();
console.log(`  Filas después: ${rowsAfter}`);
const runsUpdated = rowsAfter > rowsBefore;
console.log(`  ${runsUpdated ? "✓" : "✗"} Runs page se actualizó sin recargar (${rowsBefore} → ${rowsAfter})`);
await page.screenshot({ path: "/tmp/realtime-runs.png", fullPage: true });

// ── TEST 3: Heats page ─────────────────────────────────────────────────────
console.log("\n=== TEST 3: /admin/heats se actualiza al cambiar status ===");
await page.goto("http://localhost:3000/admin/heats", { waitUntil: "networkidle" });
await page.waitForSelector("text=Sincronizado en vivo", { timeout: 10000 });

// Verificar que h1 está como 'active'
const heat1ActiveBefore = await page.locator("text=Manga 1").locator("..").locator("text=active").count();
console.log(`  M1 con badge 'active' antes: ${heat1ActiveBefore > 0 ? "sí" : "NO"}`);

// Cambiar h1 a finished desde la DB
console.log("  → Cambiando M1 a 'finished' desde DB…");
await sb.from("heats").update({ status: "finished" }).eq("id", h1.id);

await page.waitForTimeout(3000);
const heat1FinishedAfter = await page.locator("text=Manga 1").locator("..").locator("text=finished").count();
console.log(`  M1 con badge 'finished' después: ${heat1FinishedAfter > 0 ? "✓ sí" : "✗ NO"}`);
await page.screenshot({ path: "/tmp/realtime-heats.png", fullPage: true });

if (errors.length) console.log(`\n⚠ ${errors.length} errores:\n  ${errors.join("\n  ")}`);
else console.log("\n✓ Sin errores");

await browser.close();
