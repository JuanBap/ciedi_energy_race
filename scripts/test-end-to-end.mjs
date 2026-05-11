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
  if (ha?.length) { await sb.from("runs").delete().in("heat_assignment_id", ha.map(a=>a.id)); await sb.from("heat_assignments").delete().in("id", ha.map(a=>a.id)); }
  const { data: h } = await sb.from("heats").select("id");
  if (h?.length) await sb.from("heats").delete().in("id", h.map(x=>x.id));
}
async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

await reset();
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(4);
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const { data: tC4 } = await sb.from("users").select("*").eq("email", "carril4@e5race.com").single();

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const tests = [];

// === TEST 1: cargar fixture velocidad SIN duplicados (caso normal) ===
console.log("\n=== TEST 1: Cargar fixture normal (sin duplicados) ===");
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
adminCtx.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const adminPage = await adminCtx.newPage();
const errors = [];
adminPage.on("pageerror", e => errors.push(`PAGE: ${e.message}`));

await adminPage.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
const trig = await adminPage.locator("[data-slot='select-trigger']").all();
// M1: C2=team0, C4=team1, C6=team2
await trig[0].click(); await adminPage.waitForTimeout(200);
await adminPage.locator(`[role='option']:has-text('${teams[0].name}')`).first().click();
await adminPage.waitForTimeout(150);
const trig2 = await adminPage.locator("[data-slot='select-trigger']").all();
await trig2[1].click(); await adminPage.waitForTimeout(200);
await adminPage.locator(`[role='option']:has-text('${teams[1].name}')`).first().click();
await adminPage.waitForTimeout(150);
const trig3 = await adminPage.locator("[data-slot='select-trigger']").all();
await trig3[2].click(); await adminPage.waitForTimeout(200);
await adminPage.locator(`[role='option']:has-text('${teams[2].name}')`).first().click();
await adminPage.waitForTimeout(150);

await adminPage.locator("button:has-text('Guardar fixture')").click();
await adminPage.waitForTimeout(2500);

const { data: heatsAfter1 } = await sb.from("heats").select("*, heat_assignments(lane, teams(name))").eq("test_type", "velocity");
console.log(`  Mangas creadas: ${heatsAfter1?.length}`);
const m1Assignments = heatsAfter1?.[0]?.heat_assignments;
console.log(`  M1 assignments: ${m1Assignments?.map(a=>`${a.lane}=${a.teams?.name}`).join(", ")}`);
tests.push({ name: "Fixture normal se guarda", pass: heatsAfter1?.length === 1 && m1Assignments?.length === 3 });

// === TEST 2: validación cliente — duplicado mismo equipo en dos carriles ===
console.log("\n=== TEST 2: Validación cliente con duplicado ===");
await adminPage.reload({ waitUntil: "networkidle" });

const trigA = await adminPage.locator("[data-slot='select-trigger']").all();
// Asegurar de que NO usamos el primer trigger (que puede ser de un cell de la tabla)
// Mejor buscar los del editor "Agregar mangas"
const editorRow = adminPage.locator("text=Agregar mangas").locator("..");
const editorTriggers = await editorRow.locator("[data-slot='select-trigger']").all();
if (editorTriggers.length >= 3) {
  await editorTriggers[0].click(); await adminPage.waitForTimeout(200);
  await adminPage.locator(`[role='option']:has-text('${teams[3].name}')`).first().click();
  await adminPage.waitForTimeout(150);
  const editorTriggers2 = await editorRow.locator("[data-slot='select-trigger']").all();
  await editorTriggers2[1].click(); await adminPage.waitForTimeout(200);
  // MISMO equipo en C4
  await adminPage.locator(`[role='option']:has-text('${teams[3].name}')`).first().click();
  await adminPage.waitForTimeout(150);

  await adminPage.locator("button:has-text('Guardar fixture')").click();
  await adminPage.waitForTimeout(1500);

  // Verificar toast de error
  const toastError = await adminPage.locator("text=/mismo equipo|dos carriles/i").first().isVisible().catch(() => false);
  console.log(`  Toast de error con duplicado: ${toastError}`);
  tests.push({ name: "Validación cliente bloquea duplicado", pass: toastError });
} else {
  tests.push({ name: "Validación cliente bloquea duplicado", pass: false, skip: true });
}

// === TEST 3: Asignar cronometrista a M1 carril C2 ===
console.log("\n=== TEST 3: Asignar cronometrista al carril C2 de M1 ===");
await adminPage.reload({ waitUntil: "networkidle" });
const editBtn = adminPage.locator("table button:has-text('✏️')").or(adminPage.locator("table button:has-text('Editar')")).first();
await editBtn.click();
await adminPage.waitForTimeout(500);

const modalTriggers = await adminPage.locator("[role='dialog'] [data-slot='select-trigger']").all();
// Modal tiene 2 selects: Equipo + Cronometrista
const timerName = tC2.full_name ?? tC2.email;
await modalTriggers[1].click(); await adminPage.waitForTimeout(300);
await adminPage.locator(`[role='option']:has-text('${timerName}')`).first().click();
await adminPage.waitForTimeout(200);
await adminPage.locator("[role='dialog'] button:has-text('Guardar')").click();
await adminPage.waitForTimeout(2500);

const { data: ha1 } = await sb.from("heat_assignments").select("timer_user_id").eq("lane", "C2").single();
console.log(`  C2 timer asignado: ${ha1?.timer_user_id === tC2.id ? "✓" : "✗"}`);
tests.push({ name: "Cronometrista C2 asignado en DB", pass: ha1?.timer_user_id === tC2.id });

// === TEST 4: Activar manga y cronometrista ve START ===
console.log("\n=== TEST 4: Activar manga, cronometrista ve START ===");
const timerCtx = await browser.newContext({ viewport: { width: 800, height: 1000 } });
timerCtx.addCookies([{ name: "e5_session", value: await tok(tC2), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const timerPage = await timerCtx.newPage();
const timerLogs = [];
timerPage.on("console", m => { if(m.text().includes("TimerView")) timerLogs.push(m.text()); });
await timerPage.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

const waitingShown = await timerPage.locator("text=Esperando admin").isVisible();
console.log(`  Timer ve 'Esperando admin': ${waitingShown}`);

await adminPage.locator("button:has-text('▶ Activar')").first().click();
await adminPage.waitForTimeout(3000);

const adminBadgeActive = await adminPage.locator("td:has-text('En curso')").first().isVisible().catch(() => false);
console.log(`  Admin ve 'En curso' sin recargar: ${adminBadgeActive ? "✓" : "✗"}`);
tests.push({ name: "Admin ve badge 'En curso' sin recargar", pass: adminBadgeActive });

await timerPage.waitForTimeout(8000);
await timerPage.screenshot({ path: "/tmp/timer-state.png" });
const startVisible = await timerPage.locator("button:has-text('START')").isVisible();
const connectedDot = await timerPage.locator("text=En vivo").isVisible().catch(() => false);
console.log(`  Timer 'En vivo' visible: ${connectedDot}`);
console.log(`  Timer ve START: ${startVisible ? "✓" : "✗"}`);
console.log(`  Timer logs:`);
timerLogs.forEach(l => console.log(`    ${l}`));
tests.push({ name: "Timer ve START sin recargar", pass: startVisible });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : (t.skip ? "⊘" : "✗")} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);
if (errors.length) console.log("Errores:", errors.slice(0,3).join("\n  "));

await browser.close();
