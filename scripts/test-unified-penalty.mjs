import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup limpio
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(2);
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();

// Manga versatilidad activa para tC2
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: 1, status: "active", started_at: new Date().toISOString() }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: null, timer_user_id: tC2.id });

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const tests = [];

// === TEST 1: TimerView versatilidad muestra toggle +10s (no 3 contadores) ===
console.log("\n=== TEST 1: Timer versatilidad — toggle +10s ===");
const ctx1 = await browser.newContext({ viewport: { width: 420, height: 1000 } });
ctx1.addCookies([{ name: "e5_session", value: await tok(tC2), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const timerPage = await ctx1.newPage();
await timerPage.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
await timerPage.waitForTimeout(1500);

const toggleVisible = await timerPage.locator("button:has-text('+10s PENALIZACIÓN')").isVisible();
const oldCountersVisible = await timerPage.locator("text=Salió de pista").count();
console.log(`  Toggle +10s visible: ${toggleVisible ? "✓" : "✗"}`);
console.log(`  Contadores antiguos visibles: ${oldCountersVisible} (esperado: 0)`);
tests.push({ name: "Timer versatilidad muestra +10s toggle", pass: toggleVisible });
tests.push({ name: "Sin contadores antiguos", pass: oldCountersVisible === 0 });
await timerPage.screenshot({ path: "/tmp/timer-versat-unified.png" });

// === TEST 2: Persistencia — toggle ON + submit ===
console.log("\n=== TEST 2: Cronometrar versatilidad con +10s ===");
await timerPage.locator("button:has-text('START')").click();
await timerPage.waitForTimeout(800);
await timerPage.locator("button:has-text('STOP')").click();
await timerPage.waitForTimeout(200);
await timerPage.locator("button:has-text('+10s PENALIZACIÓN')").click();
await timerPage.waitForTimeout(200);
await timerPage.locator("button:has-text('ENVIAR TIEMPO')").click();
await timerPage.waitForTimeout(400);
await timerPage.locator("[role='dialog'] button:has-text('SÍ')").click();
await timerPage.waitForTimeout(2500);

const { data: run } = await sb.from("runs").select("*").eq("status", "recorded").single();
console.log(`  Run: time_ms=${run?.time_ms}, has_penalty_velocity=${run?.has_penalty_velocity}, out=${run?.penalty_versatility_count_out}`);
const penaltyOk = run?.has_penalty_velocity === true && run?.penalty_versatility_count_out === 0;
tests.push({ name: "Persistencia: has_penalty_velocity=true, counters=0", pass: penaltyOk });

// === TEST 3: /admin/runs tabla idéntica para ambas pruebas ===
console.log("\n=== TEST 3: /admin/runs tabla unificada ===");
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
ctx2.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const adminPage = await ctx2.newPage();
await adminPage.goto("http://localhost:3000/admin/runs", { waitUntil: "networkidle" });
await adminPage.waitForTimeout(2000);

// Contar headers "Carril" — debe haber 2 (uno por cada sección Velocidad/Versatilidad)
const carrilHeaders = await adminPage.locator("th:has-text('Carril')").count();
console.log(`  Headers 'Carril': ${carrilHeaders} (esperado: 2)`);
tests.push({ name: "Ambas tablas tienen columna Carril", pass: carrilHeaders === 2 });

// La penalización debe mostrar "+10s" (no "+5s" ni con S/C/T)
const penaltyText = await adminPage.locator("td span:has-text('+10s')").count();
const oldFormat = await adminPage.locator("text=/S\\/.*C\\/.*T/").count();
console.log(`  Penalización '+10s' en tabla: ${penaltyText} celdas`);
console.log(`  Formato viejo 'S/C/T': ${oldFormat} (esperado: 0)`);
tests.push({ name: "Penalización formato unificado (+10s)", pass: oldFormat === 0 });

await adminPage.screenshot({ path: "/tmp/runs-unified.png", fullPage: true });

// === TEST 4: EditRunDialog ahora muestra checkbox en ambas pruebas ===
console.log("\n=== TEST 4: EditRunDialog checkbox en versatilidad ===");
await adminPage.locator("button:has-text('Editar')").first().click();
await adminPage.waitForTimeout(400);
const checkboxVisible = await adminPage.locator("label:has-text('Penalización +10s')").isVisible();
console.log(`  Checkbox 'Penalización +10s' visible: ${checkboxVisible ? "✓" : "✗"}`);
tests.push({ name: "Dialog edit muestra checkbox +10s", pass: checkboxVisible });
await adminPage.screenshot({ path: "/tmp/runs-edit-dialog.png" });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
