import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup
console.log("→ setup");
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name, color_hex").order("name").limit(3);

// Crear manga ACTIVA con 3 carriles, started_at hace 8 segundos
const startedAt = new Date(Date.now() - 8000).toISOString();
const { data: h1 } = await sb.from("heats").insert({
  event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active", started_at: startedAt
}).select("id").single();

await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2" },
  { heat_id: h1.id, team_id: teams[1].id, lane: "C4" },
  { heat_id: h1.id, team_id: teams[2].id, lane: "C6" },
]);

// El C2 ya terminó con tiempo 5.2s
const { data: haC2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).eq("lane", "C2").single();
await sb.from("runs").insert({ heat_assignment_id: haC2.id, time_ms: 5200, status: "recorded" });

// El C4 con penalización
const { data: haC4 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).eq("lane", "C4").single();
await sb.from("runs").insert({ heat_assignment_id: haC4.id, time_ms: 4800, has_penalty_velocity: true, status: "recorded" });

// El C6 todavía no terminó (sigue en pista)

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

await page.screenshot({ path: "/tmp/live-desktop.png", fullPage: true });
console.log("  screenshot desktop: /tmp/live-desktop.png");

// Móvil
const mobileCtx = await browser.newContext({ viewport: { width: 414, height: 900 } });
const mobilePage = await mobileCtx.newPage();
await mobilePage.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await mobilePage.waitForTimeout(2000);
await mobilePage.screenshot({ path: "/tmp/live-mobile.png", fullPage: true });
console.log("  screenshot mobile: /tmp/live-mobile.png");

await browser.close();
