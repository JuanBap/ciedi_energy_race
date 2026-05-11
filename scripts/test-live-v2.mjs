import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup con variedad: 1 active, 1 finished, 1 pending — de velocidad y versatilidad
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name, category_id").order("name");
console.log("teams:", teams.length);

// Categoría pushcarts
const PUSH = "00000000-0000-0000-0000-000000000010";
const HPV = "00000000-0000-0000-0000-000000000011";
const pushTeams = teams.filter(t => t.category_id === PUSH);
const hpvTeams = teams.filter(t => t.category_id === HPV);
console.log("pushcarts:", pushTeams.length, "hpvs:", hpvTeams.length);

// Velocidad M1 - ACTIVE (pushcarts)
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active", started_at: new Date(Date.now() - 6000).toISOString() }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: pushTeams[0].id, lane: "C2" },
  { heat_id: h1.id, team_id: pushTeams[1].id, lane: "C4" },
  { heat_id: h1.id, team_id: pushTeams[2].id, lane: "C6" },
]);
const { data: hasH1 } = await sb.from("heat_assignments").select("id, lane").eq("heat_id", h1.id);
const c2 = hasH1.find(x => x.lane === "C2");
const c4 = hasH1.find(x => x.lane === "C4");
await sb.from("runs").insert({ heat_assignment_id: c2.id, time_ms: 5200, status: "recorded" });
await sb.from("runs").insert({ heat_assignment_id: c4.id, time_ms: 4800, has_penalty_velocity: true, status: "recorded" });

// Velocidad M2 - PENDING (pushcarts)
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h2.id, team_id: pushTeams[0].id, lane: "C2" },
  { heat_id: h2.id, team_id: pushTeams[1].id, lane: "C4" },
]);

// Versatilidad M1 - FINISHED (hpvs)
const { data: h3 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: 1, status: "finished" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h3.id, team_id: hpvTeams[0].id, lane: null });
const { data: hasH3 } = await sb.from("heat_assignments").select("id").eq("heat_id", h3.id).single();
await sb.from("runs").insert({ heat_assignment_id: hasH3.id, time_ms: 95000, status: "recorded" });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/live-v2-all.png", fullPage: true });
console.log("\n→ all heats:", "/tmp/live-v2-all.png");

// Filtrar velocidad
await page.locator("button:has-text('Velocidad')").first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/live-v2-velocidad.png", fullPage: true });
console.log("→ velocidad only:", "/tmp/live-v2-velocidad.png");

// Verificar que no se muestra la tabla de rankings
const rankingsTable = await page.locator("text=Total").count();
console.log("\nTabla rankings presente?:", rankingsTable > 0 ? "SÍ (mal)" : "no (OK)");

// Mobile
const mobileCtx = await browser.newContext({ viewport: { width: 414, height: 900 } });
const mobilePage = await mobileCtx.newPage();
await mobilePage.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await mobilePage.waitForTimeout(2000);
await mobilePage.screenshot({ path: "/tmp/live-v2-mobile.png", fullPage: true });
console.log("→ mobile:", "/tmp/live-v2-mobile.png");

await browser.close();
