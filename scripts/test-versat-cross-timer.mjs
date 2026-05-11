import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Limpiar
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id)); }
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);
const { data: tC4 } = await sb.from("users").select("*").eq("email", "carril4@e5race.com").single();
const { data: tC6 } = await sb.from("users").select("*").eq("email", "carril6@e5race.com").single();

// ESCENARIO: el carril4 tiene test_type=velocity en user_assignments PERO
// el admin lo asigna como cronometrista de una manga de versatilidad
await sb.from("user_assignments").update({ test_type: "velocity" }).eq("user_id", tC4.id);

// Crear M1 de velocidad con tC6 (para que también tenga algo de velocidad)
const { data: hVel } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: hVel.id, team_id: teams[0].id, lane: "C6", timer_user_id: tC6.id });

// Crear M1 de versatilidad con tC4 como cronometrista (cross test_type!)
const { data: hVer } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: 1, status: "active" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: hVer.id, team_id: teams[1].id, lane: null, timer_user_id: tC4.id });

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const tests = [];

// === TEST: carril4 (user_assignments.test_type=velocity) ve la manga de versatilidad ===
console.log("\n=== TEST 1: carril4 (cuyo user_assignment es 'velocity') ve manga de VERSATILIDAD asignada ===");
const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
ctx.addCookies([{ name: "e5_session", value: await tok(tC4), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(`PAGE: ${e.message}`));
page.on("console", m => m.type()==="error" && errors.push(`CONSOLE: ${m.text()}`));
await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

const teamShown = await page.locator(".text-xl.font-bold").first().textContent().catch(()=>"");
const versatilityBadge = await page.locator("header .bg-green-700").first().isVisible().catch(() => false);
const startVisible = await page.locator("button:has-text('START')").isVisible();
console.log(`  Equipo mostrado: "${teamShown?.trim()}" (esperado: ${teams[1].name})`);
console.log(`  Badge Versatilidad visible: ${versatilityBadge}`);
console.log(`  Botón START visible: ${startVisible}`);
tests.push({ name: "carril4 ve manga de versatilidad", pass: teamShown?.includes(teams[1].name) && startVisible });
tests.push({ name: "Badge 'Versatilidad' visible", pass: versatilityBadge });

await page.screenshot({ path: "/tmp/versat-cross-c4.png" });

// === TEST 2: el botón +10s NO aparece (porque es versatilidad) ===
console.log("\n=== TEST 2: botón +10s no aparece en versatilidad ===");
const penaltyBtn = await page.locator("button:has-text('+10s PENALIZACIÓN')").count();
console.log(`  Botón +10s presente: ${penaltyBtn > 0 ? "SÍ (BUG)" : "no ✓"}`);
tests.push({ name: "+10s ausente en versatilidad", pass: penaltyBtn === 0 });

// === TEST 3: enviar tiempo correctamente ===
console.log("\n=== TEST 3: cronometrar y enviar tiempo en versatilidad ===");
await page.locator("button:has-text('START')").click();
await page.waitForTimeout(700);
await page.locator("button:has-text('STOP')").click();
await page.waitForTimeout(200);
await page.locator("button:has-text('ENVIAR TIEMPO')").click();
await page.waitForTimeout(500);
await page.locator("[role='dialog'] button:has-text('SÍ')").click();
await page.waitForTimeout(2500);

const { data: savedRuns } = await sb.from("runs").select("status, heat_assignments(heats(test_type))").eq("status", "recorded");
const versatRuns = savedRuns?.filter(r => r.heat_assignments?.heats?.test_type === "versatility").length ?? 0;
console.log(`  Runs de versatilidad recorded: ${versatRuns}`);
tests.push({ name: "Tiempo se guarda en manga de versatilidad", pass: versatRuns === 1 });

await ctx.close();
await browser.close();

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);
if (errors.length) console.log("Errores:", errors.slice(0,3).join("\n  "));
