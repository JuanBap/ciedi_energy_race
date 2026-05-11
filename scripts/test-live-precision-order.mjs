import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup variado de estados
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(4);

// M1 finished con tiempo (debería ir AL FINAL)
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "finished" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: "C2" });
const { data: ha1 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).single();
await sb.from("runs").insert({ heat_assignment_id: ha1.id, time_ms: 154890, status: "recorded" });  // 2:34.89

// M2 finished con tiempo más reciente
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "finished" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h2.id, team_id: teams[1].id, lane: "C2" });
const { data: ha2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h2.id).single();
await sb.from("runs").insert({ heat_assignment_id: ha2.id, time_ms: 5230, status: "recorded" });  // 0:05.23

// M3 active
const { data: h3 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 3, status: "active", started_at: new Date().toISOString() }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h3.id, team_id: teams[2].id, lane: "C2" });

// M4 pending
const { data: h4 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 4, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h4.id, team_id: teams[3].id, lane: "C2" });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

console.log("\n=== TEST 1: Tiempos con centésimas visibles ===");
const time1 = await page.locator("text=/02:34\\.89/").isVisible().catch(() => false);
const time2 = await page.locator("text=/00:05\\.23/").isVisible().catch(() => false);
console.log(`  2:34.89 visible: ${time1 ? "✓" : "✗"}`);
console.log(`  0:05.23 visible: ${time2 ? "✓" : "✗"}`);

console.log("\n=== TEST 2: Orden de mangas (active → pending → finished) ===");
const headers = await page.locator(".text-2xl.font-black.text-yellow-400, .text-3xl.font-black.text-yellow-400").allTextContents();
console.log(`  Orden visual: ${headers.join(" → ")}`);
const expected = ["M3", "M4", "M2", "M1"];  // active, pending, finished más reciente primero, finished antiguo
const actualOrder = headers.filter(h => h.startsWith("M"));
const correctOrder = JSON.stringify(actualOrder) === JSON.stringify(expected);
console.log(`  Esperado: ${expected.join(" → ")}`);
console.log(`  ${correctOrder ? "✓ orden correcto" : "✗ orden incorrecto"}`);

await page.screenshot({ path: "/tmp/live-v4-order.png", fullPage: true });
console.log("\nScreenshot: /tmp/live-v4-order.png");

await browser.close();
