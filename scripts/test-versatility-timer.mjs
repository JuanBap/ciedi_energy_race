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

// Asegurar que el usuario carril2 tenga test_type=versatility temporalmente para este test
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(2);
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();

// Cambiar test_type del carril2 a versatility para que el test funcione
await sb.from("user_assignments").update({ test_type: "versatility" }).eq("user_id", tC2.id);

// Crear manga de versatilidad
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: 1, status: "pending" }).select("id").single();

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
adminCtx.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const adminPage = await adminCtx.newPage();
const tests = [];

console.log("\n=== TEST 1: Pestaña Versatilidad muestra columna Cronometrista ===");
await adminPage.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
await adminPage.locator("button[role='tab']:has-text('Versatilidad')").click();
await adminPage.waitForTimeout(500);
const cronoHeader = await adminPage.locator("th:has-text('Cronometrista')").count();
console.log(`  Header 'Cronometrista' visible: ${cronoHeader > 0 ? "sí" : "NO"}`);
tests.push({ name: "Columna 'Cronometrista' visible", pass: cronoHeader > 0 });

console.log("\n=== TEST 2: Modal Editar permite asignar cronometrista ===");
await adminPage.locator("button:has-text('Editar')").first().click();
await adminPage.waitForTimeout(500);
const modalTitle = await adminPage.locator("text=Editar M1 — Versatilidad").isVisible();
const timerSelectVisible = await adminPage.locator("[role='dialog']").getByText(/Cronometrista/i).first().isVisible();
console.log(`  Modal abierto: ${modalTitle}, label Cronometrista: ${timerSelectVisible}`);
tests.push({ name: "Modal de edición incluye select de cronometrista", pass: modalTitle && timerSelectVisible });
await adminPage.screenshot({ path: "/tmp/versat-modal.png" });

// Seleccionar equipo + cronometrista
const triggers = await adminPage.locator("[role='dialog'] [data-slot='select-trigger']").all();
await triggers[0].click();
await adminPage.waitForTimeout(300);
await adminPage.locator(`[role='option']:has-text('${teams[0].name}')`).first().click();
await adminPage.waitForTimeout(200);

const triggers2 = await adminPage.locator("[role='dialog'] [data-slot='select-trigger']").all();
await triggers2[1].click();
await adminPage.waitForTimeout(300);
const timerName = tC2.full_name ?? tC2.email;
await adminPage.locator(`[role='option']:has-text('${timerName}')`).first().click();
await adminPage.waitForTimeout(200);

await adminPage.locator("[role='dialog'] button:has-text('Guardar')").click();
await adminPage.waitForTimeout(2000);

const { data: assignmentAfter } = await sb.from("heat_assignments").select("team_id, timer_user_id").eq("heat_id", h1.id).single();
console.log(`  DB: team=${assignmentAfter?.team_id?.slice(0,8)}…, timer=${assignmentAfter?.timer_user_id?.slice(0,8)}…`);
tests.push({
  name: "Asignación guarda equipo + cronometrista en DB",
  pass: assignmentAfter?.team_id === teams[0].id && assignmentAfter?.timer_user_id === tC2.id,
});

console.log("\n=== TEST 3: Tabla muestra el cronometrista asignado ===");
await adminPage.reload({ waitUntil: "networkidle" });
await adminPage.locator("button[role='tab']:has-text('Versatilidad')").click();
await adminPage.waitForTimeout(800);
const timerInTable = await adminPage.locator("text=👤").first().isVisible().catch(() => false);
const timerNameInTable = await adminPage.locator(`text=${timerName}`).first().isVisible().catch(() => false);
console.log(`  Icono 👤: ${timerInTable}, nombre del cronometrista: ${timerNameInTable}`);
tests.push({ name: "Tabla muestra cronometrista", pass: timerInTable && timerNameInTable });
await adminPage.screenshot({ path: "/tmp/versat-table.png", fullPage: true });

console.log("\n=== TEST 4: Cronometrista en /timer ve la manga al activarla ===");
await sb.from("heats").update({ status: "active" }).eq("id", h1.id);

const timerCtx = await browser.newContext({ viewport: { width: 400, height: 800 } });
timerCtx.addCookies([{ name: "e5_session", value: await tok(tC2), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const timerPage = await timerCtx.newPage();
await timerPage.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
const teamShown = await timerPage.locator(".text-xl.font-bold").first().textContent().catch(()=>"");
const versatilityBadge = await timerPage.locator("header .bg-green-700").first().textContent().catch(()=>"");
console.log(`  Timer ve equipo: "${teamShown?.trim()}", badge: "${versatilityBadge?.trim()}"`);
tests.push({
  name: "Cronometrista de versatilidad ve la manga activa",
  pass: teamShown?.includes(teams[0].name) && versatilityBadge?.includes("Versatilidad"),
});
await timerPage.screenshot({ path: "/tmp/versat-timer.png" });

// Restaurar test_type
await sb.from("user_assignments").update({ test_type: "velocity" }).eq("user_id", tC2.id);

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
