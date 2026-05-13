import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup limpio: una manga versatilidad activa con el cronometrista carril2
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(1);
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();

const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: 1, status: "active", started_at: new Date().toISOString() }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: null, timer_user_id: tC2.id });

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 1100 } });
ctx.addCookies([{ name: "e5_session", value: await tok(tC2), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const tests = [];

console.log("\n=== TEST 1: Contadores de versatilidad visibles ===");
const labelOut = await page.locator("text=Salió de pista").isVisible();
const labelCrash = await page.locator("text=Chocó obstáculo").isVisible();
const labelCut = await page.locator("text=Cortó trayectoria").isVisible();
console.log(`  'Salió de pista': ${labelOut ? "✓" : "✗"}`);
console.log(`  'Chocó obstáculo': ${labelCrash ? "✓" : "✗"}`);
console.log(`  'Cortó trayectoria': ${labelCut ? "✓" : "✗"}`);
tests.push({ name: "Los 3 contadores visibles", pass: labelOut && labelCrash && labelCut });

await page.screenshot({ path: "/tmp/versat-timer-initial.png", fullPage: true });

console.log("\n=== TEST 2: Cronometrar + acumular penalizaciones ===");
await page.locator("button:has-text('START')").click();
await page.waitForTimeout(1000);

// Pulsar + en Salió (2 veces) y + en Chocó (1 vez)
const incButtons = await page.locator("button:has-text('+')").all();
console.log(`  Botones '+' encontrados: ${incButtons.length}`);
// Los primeros 3 son para los contadores (uno por cada)
await incButtons[0].click(); await page.waitForTimeout(150);
await incButtons[0].click(); await page.waitForTimeout(150);
await incButtons[1].click(); await page.waitForTimeout(300);

await page.locator("button:has-text('STOP')").click();
await page.waitForTimeout(300);

const penaltyText = await page.locator("text=/\\+15 SEG PENALIZACIÓN/").isVisible();
console.log(`  Texto '+15 SEG PENALIZACIÓN' (3 faltas × 5s): ${penaltyText ? "✓" : "✗"}`);
tests.push({ name: "Cálculo de penalizaciones (3 × 5s = 15s)", pass: penaltyText });

await page.screenshot({ path: "/tmp/versat-timer-with-penalties.png", fullPage: true });

console.log("\n=== TEST 3: Modal de confirmación detalla penalizaciones ===");
await page.locator("button:has-text('ENVIAR TIEMPO')").click();
await page.waitForTimeout(500);

const detailVisible = await page.locator("text=/Salió: 2/").isVisible();
console.log(`  Detalle 'Salió: 2 · Chocó: 1 · Cortó: 0': ${detailVisible ? "✓" : "✗"}`);
tests.push({ name: "Modal muestra desglose de penalizaciones", pass: detailVisible });
await page.screenshot({ path: "/tmp/versat-timer-modal.png" });

console.log("\n=== TEST 4: Persistencia en DB ===");
await page.locator("[role='dialog'] button:has-text('SÍ')").click();
await page.waitForTimeout(2500);

const { data: run } = await sb.from("runs").select("*").eq("status", "recorded").single();
console.log(`  Run guardado: time_ms=${run?.time_ms}, out=${run?.penalty_versatility_count_out}, crash=${run?.penalty_versatility_count_crash}, cut=${run?.penalty_versatility_count_cut}`);
const correctPersist = run?.penalty_versatility_count_out === 2 && run?.penalty_versatility_count_crash === 1 && run?.penalty_versatility_count_cut === 0;
console.log(`  Persistencia correcta: ${correctPersist ? "✓" : "✗"}`);
tests.push({ name: "Contadores se persisten en DB", pass: correctPersist });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
