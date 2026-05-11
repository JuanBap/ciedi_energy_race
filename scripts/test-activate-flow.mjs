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

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(2);
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();

// Crear manga PENDING (no activa)
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: "C2", timer_user_id: tC2.id });

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

// ABRIR DOS PESTAÑAS SIMULTÁNEAMENTE
console.log("\n=== Configurando 2 pestañas: admin en /admin/fixtures y timer en /timer ===");

const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
adminCtx.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const adminPage = await adminCtx.newPage();
const adminErrors = [];
adminPage.on("pageerror", e => adminErrors.push(`PAGE: ${e.message}`));

const timerCtx = await browser.newContext({ viewport: { width: 400, height: 800 } });
timerCtx.addCookies([{ name: "e5_session", value: await tok(tC2), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const timerPage = await timerCtx.newPage();
const timerErrors = [];
timerPage.on("pageerror", e => timerErrors.push(`PAGE: ${e.message}`));

await adminPage.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
await timerPage.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

const tests = [];

// === TEST 1: Estado inicial ===
console.log("\n=== TEST 1: Estado inicial (manga pending) ===");
const adminBadge1 = await adminPage.locator("td:has-text('Pendiente')").first().isVisible().catch(() => false);
const timerWaiting1 = await timerPage.locator("text=Esperando admin").isVisible().catch(() => false);
console.log(`  Admin ve 'Pendiente': ${adminBadge1}`);
console.log(`  Timer ve 'Esperando admin': ${timerWaiting1}`);
tests.push({ name: "Admin ve badge 'Pendiente'", pass: adminBadge1 });
tests.push({ name: "Timer ve 'Esperando admin'", pass: timerWaiting1 });

// === TEST 2: Admin presiona Activar y AMBAS pestañas se actualizan ===
console.log("\n=== TEST 2: Admin pulsa 'Activar' ===");
await adminPage.locator("button:has-text('▶ Activar')").first().click();
await adminPage.waitForTimeout(2500); // dar tiempo a realtime + router refresh

const adminBadge2 = await adminPage.locator("td:has-text('En curso')").first().isVisible().catch(() => false);
console.log(`  Admin ahora ve 'En curso': ${adminBadge2 ? "✓ sí" : "✗ NO"}`);
tests.push({ name: "Admin ve badge 'En curso' sin recargar", pass: adminBadge2 });

// Verificar status en DB
const { data: heatAfter } = await sb.from("heats").select("status").eq("id", h1.id).single();
console.log(`  DB confirma status: ${heatAfter?.status}`);

// === TEST 3: Timer ve la pantalla de cronómetro ===
await timerPage.waitForTimeout(2500);
const startVisible = await timerPage.locator("button:has-text('START')").isVisible().catch(() => false);
const teamShown = await timerPage.locator(".text-xl.font-bold").first().textContent().catch(() => "");
console.log(`  Timer ve START: ${startVisible ? "✓ sí" : "✗ NO"}`);
console.log(`  Timer ve equipo: "${teamShown?.trim()}"`);
tests.push({ name: "Timer pasa a pantalla activa con START sin recargar", pass: startVisible });
tests.push({ name: "Timer ve equipo correcto", pass: teamShown?.includes(teams[0].name) });

await adminPage.screenshot({ path: "/tmp/activate-admin.png", fullPage: true });
await timerPage.screenshot({ path: "/tmp/activate-timer.png", fullPage: false });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);
if (adminErrors.length) console.log("ADMIN errors:", adminErrors.slice(0,3).join("\n  "));
if (timerErrors.length) console.log("TIMER errors:", timerErrors.slice(0,3).join("\n  "));

await browser.close();
