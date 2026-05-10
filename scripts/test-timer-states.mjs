import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

async function reset() {
  const { data: ha } = await sb.from("heat_assignments").select("id");
  if (ha?.length) await sb.from("runs").delete().in("heat_assignment_id", ha.map(x=>x.id));
  const { data: hs } = await sb.from("heats").select("id");
  if (hs?.length) {
    await sb.from("heat_assignments").delete().in("heat_id", hs.map(h=>h.id));
    await sb.from("heats").delete().in("id", hs.map(h=>h.id));
  }
}

async function getToken(email) {
  const { data: u } = await sb.from("users").select("*").eq("email", email).single();
  const token = await new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
  return { token, user: u };
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

async function openTimer(email) {
  const { token } = await getToken(email);
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`); });
  await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
  return { page, ctx, errors };
}

const tests = [];

// === ESCENARIO A: sin mangas en el fixture ===
console.log("\n=== A: sin fixture cargado ===");
await reset();
const a = await openTimer("carril4@e5race.com");
const aTitle = await a.page.locator("p.text-xl.font-bold").first().textContent();
const aMsg = await a.page.locator("p.text-zinc-500.text-sm").first().textContent();
console.log(`  carril4 ve: "${aTitle?.trim()}" / "${aMsg?.trim().slice(0,60)}…"`);
tests.push({ name: "A: sin fixture", pass: aTitle?.includes("Sin mangas") });
await a.page.screenshot({ path: "/tmp/timer-A-no-fixture.png" });
await a.ctx.close();

// === ESCENARIO B: fixture cargado pero ninguna manga active ===
console.log("\n=== B: fixture pendiente (admin no ha activado) ===");
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "pending" }).select("id").single();
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C4" },
  { heat_id: h2.id, team_id: teams[1].id, lane: "C4" },
]);

const b = await openTimer("carril4@e5race.com");
const bTitle = await b.page.locator(".text-yellow-400.text-sm.uppercase").first().textContent();
console.log(`  carril4 ve título: "${bTitle?.trim()}"`);
const nextHeat = await b.page.locator(".text-yellow-400.text-3xl").first().textContent();
const nextTeam = await b.page.locator(".bg-zinc-900 .text-white.font-medium").first().textContent();
console.log(`  Próxima manga mostrada: ${nextHeat?.trim()} con ${nextTeam?.trim()}`);
tests.push({ name: "B: muestra próxima manga al esperar", pass: nextHeat?.includes("M1") && nextTeam?.length > 0 });
await b.page.screenshot({ path: "/tmp/timer-B-waiting.png" });
await b.ctx.close();

// === ESCENARIO C: una manga activa con asignación al carril ===
console.log("\n=== C: admin activa M1 ===");
await sb.from("heats").update({ status: "active" }).eq("id", h1.id);
const c = await openTimer("carril4@e5race.com");
const cTeam = await c.page.locator(".text-xl.font-bold").first().textContent().catch(() => null);
const startVisible = await c.page.locator("button:has-text('START')").isVisible();
console.log(`  Equipo mostrado: ${cTeam?.trim()}, botón START visible: ${startVisible}`);
tests.push({ name: "C: muestra runner activo con START", pass: startVisible && cTeam?.length > 0 });
await c.page.screenshot({ path: "/tmp/timer-C-active.png" });
await c.ctx.close();

// === ESCENARIO D: carril6 sin asignaciones aunque haya fixture ===
console.log("\n=== D: carril6 sin asignaciones ===");
const d = await openTimer("carril6@e5race.com");
const dTitle = await d.page.locator("p.text-xl.font-bold").first().textContent();
const dMsg = await d.page.locator("p.text-zinc-500.text-sm").first().textContent();
console.log(`  carril6 ve: "${dTitle?.trim()}"`);
console.log(`  mensaje: "${dMsg?.trim().slice(0,80)}…"`);
tests.push({ name: "D: carril6 mensaje específico de carril sin asignación", pass: dMsg?.includes("C6") });
await d.page.screenshot({ path: "/tmp/timer-D-c6-empty.png" });
await d.ctx.close();

// === ESCENARIO E: todas las mangas completadas ===
console.log("\n=== E: todas las mangas de carril4 completadas ===");
const { data: ha1 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).single();
const { data: ha2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h2.id).single();
await sb.from("runs").insert([
  { heat_assignment_id: ha1.id, time_ms: 5000, status: "recorded" },
  { heat_assignment_id: ha2.id, time_ms: 5200, status: "recorded" },
]);
await sb.from("heats").update({ status: "finished" }).eq("id", h1.id);
await sb.from("heats").update({ status: "finished" }).eq("id", h2.id);

const e = await openTimer("carril4@e5race.com");
const eTitle = await e.page.locator("p.text-xl.font-bold").first().textContent();
const eMsg = await e.page.locator("p.text-zinc-500.text-sm").first().textContent();
console.log(`  carril4 ve: "${eTitle?.trim()}" / "${eMsg?.trim()}"`);
tests.push({ name: "E: mensaje de 'completadas' con conteo", pass: eTitle?.includes("completadas") || eMsg?.includes("cronometrado") });
await e.page.screenshot({ path: "/tmp/timer-E-completed.png" });
await e.ctx.close();

// === ESCENARIO F: Realtime — admin activa M1, carril ve cambio automático ===
console.log("\n=== F: Realtime — carril ve cambio al activar manga ===");
await reset();
const { data: h3 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h3.id, team_id: teams[0].id, lane: "C4" });

const f = await openTimer("carril4@e5race.com");
await f.page.waitForTimeout(1500);
const beforeActivate = await f.page.locator("text=Esperando admin").count();
console.log(`  Antes: 'Esperando admin' visible: ${beforeActivate > 0 ? "sí" : "NO"}`);

// Activar manga desde DB
await sb.from("heats").update({ status: "active" }).eq("id", h3.id);
await f.page.waitForTimeout(3000);

const startNowVisible = await f.page.locator("button:has-text('START')").isVisible();
console.log(`  Después: botón START visible sin recargar: ${startNowVisible ? "✓" : "✗"}`);
tests.push({ name: "F: Realtime activación", pass: startNowVisible });
await f.page.screenshot({ path: "/tmp/timer-F-realtime.png" });
await f.ctx.close();

// Resumen
console.log("\n=== RESUMEN ===");
const passed = tests.filter(t => t.pass).length;
for (const t of tests) console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`);
console.log(`\n${passed}/${tests.length} tests pasan`);

await browser.close();
