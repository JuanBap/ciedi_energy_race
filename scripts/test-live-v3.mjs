import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);

// M1 active sin tiempos aún (todos "en curso")
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active", started_at: new Date().toISOString() }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2" },
  { heat_id: h1.id, team_id: teams[1].id, lane: "C4" },
  { heat_id: h1.id, team_id: teams[2].id, lane: "C6" },
]);

// M2 que vamos a borrar después
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h2.id, team_id: teams[0].id, lane: "C2" });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

console.log("=== TEST 1: 'EN CURSO' palpitando (sin cronómetro) ===");
const cronometroCorriendo = await page.locator("text=en pista").count();
const enCursoPalpitando = await page.locator("[role='dialog']").or(page.locator("body")).getByText(/^en curso$/i).count();
const m2Visible = await page.locator("text=M2").isVisible();
console.log(`  Texto 'en pista' (cronómetro corriendo): ${cronometroCorriendo} (esperado: 0)`);
console.log(`  Texto 'En curso' visible: ${enCursoPalpitando > 0 ? "sí" : "NO"}`);
console.log(`  M2 visible inicialmente: ${m2Visible ? "sí" : "NO"}`);

await page.screenshot({ path: "/tmp/live-v3-active.png", fullPage: true });

console.log("\n=== TEST 2: Borrar manga M2 y ver desaparecer ===");
await sb.from("heat_assignments").delete().eq("heat_id", h2.id);
await sb.from("heats").delete().eq("id", h2.id);

const startTime = Date.now();
let m2Gone = false;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(500);
  const stillVisible = await page.locator("text=M2").isVisible().catch(() => false);
  if (!stillVisible) {
    m2Gone = true;
    console.log(`  M2 desapareció en ~${Date.now() - startTime}ms ✓`);
    break;
  }
}
if (!m2Gone) console.log(`  M2 NO desapareció en 5s ✗`);

await page.screenshot({ path: "/tmp/live-v3-after-delete.png", fullPage: true });

console.log("\n=== TEST 3: Llega un tiempo recorded → reemplaza 'EN CURSO' por tiempo ===");
const { data: haC2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).eq("lane", "C2").single();
await sb.from("runs").insert({ heat_assignment_id: haC2.id, time_ms: 5350, status: "recorded" });

await page.waitForTimeout(2500);
const tiempoVisible = await page.locator("text=00:05").first().isVisible().catch(() => false);
console.log(`  Tiempo 00:05 visible para C2 después de submit: ${tiempoVisible ? "✓" : "✗"}`);

await page.screenshot({ path: "/tmp/live-v3-with-time.png", fullPage: true });

await browser.close();
