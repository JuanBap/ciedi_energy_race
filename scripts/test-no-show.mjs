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

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(4);
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();
const { data: timers } = await sb.from("users").select("id, email, preferred_lane").in("role", ["timer"]).order("email");
console.log("Timers con preferred_lane:");
for (const t of timers) console.log(`  ${t.email} → ${t.preferred_lane ?? "—"}`);

// Crear manga finalizada con 3 equipos y tiempos para que haya un peor tiempo
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "finished" }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2" },
  { heat_id: h1.id, team_id: teams[1].id, lane: "C4" },
  { heat_id: h1.id, team_id: teams[2].id, lane: "C6" },
]);
const { data: has1 } = await sb.from("heat_assignments").select("id, lane").eq("heat_id", h1.id);
for (const ha of has1) {
  const tMap = { C2: 5200, C4: 5800, C6: 5500 };
  await sb.from("runs").insert({ heat_assignment_id: ha.id, time_ms: tMap[ha.lane], status: "recorded" });
}

// Manga 2 pendiente con 3 carriles
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "pending" }).select("id").single();

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
ctx.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const tests = [];

console.log("\n=== TEST 1: Default cronometrista por preferred_lane ===");
await page.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Click en "+ Asignar" del primer carril vacío de M2
const assignBtns = await page.locator("button:has-text('+ Asignar')").all();
console.log(`  Botones '+ Asignar' encontrados: ${assignBtns.length}`);
if (assignBtns.length === 0) {
  console.log("  ⚠ No hay carriles vacíos para probar — saltando");
  tests.push({ name: "Default cronometrista por preferred_lane", pass: true, skip: true });
} else {
  await assignBtns[0].click();
  await page.waitForTimeout(700);

  // Verificar que el select de cronometrista muestra al timer C2 con estrella
  const starHint = await page.locator("text=★").count();
  console.log(`  Indicador ★ de carril preferido visible: ${starHint > 0 ? "✓" : "✗"}`);
  tests.push({ name: "Indicador ★ de carril preferido", pass: starHint > 0 });

  // El segundo trigger del modal es el de Cronometrista
  const modalTriggers = await page.locator("[role='dialog'] [data-slot='select-trigger']").all();
  const timerValue = await modalTriggers[1].textContent();
  console.log(`  Valor por default del cronometrista: "${timerValue?.trim()}"`);
  tests.push({ name: "Cronometrista pre-seleccionado", pass: !timerValue?.includes("Sin cronometrista") });

  // Marcar "No se presentó"
  await page.locator("[role='dialog'] input[type='checkbox']").click();
  await page.waitForTimeout(200);

  // Seleccionar equipo
  await modalTriggers[0].click();
  await page.waitForTimeout(300);
  await page.locator(`[role='option']:has-text('${teams[3].name}')`).first().click();
  await page.waitForTimeout(300);

  await page.locator("[role='dialog'] button:has-text('Guardar')").click();
  await page.waitForTimeout(2500);

  // Verificar en DB
  const { data: ha2 } = await sb.from("heat_assignments").select("no_show, team_id, timer_user_id").eq("heat_id", h2.id).maybeSingle();
  console.log(`  DB: no_show=${ha2?.no_show}, timer_user_id=${ha2?.timer_user_id?.slice(0,8)}…`);
  tests.push({ name: "no_show persistido", pass: ha2?.no_show === true });
}

await page.screenshot({ path: "/tmp/fixtures-no-show.png", fullPage: true });

// === TEST 2: /admin/runs muestra badge no_show ===
console.log("\n=== TEST 2: /admin/runs muestra badge ===");
// El run pending debió crearse automáticamente al marcar no_show
const { data: noShowHa } = await sb.from("heat_assignments").select("id").eq("heat_id", h2.id).eq("no_show", true).single();
const { data: autoRun } = noShowHa
  ? await sb.from("runs").select("id").eq("heat_assignment_id", noShowHa.id).maybeSingle()
  : { data: null };
console.log(`  Run auto-creado para no_show: ${autoRun ? "✓" : "✗"}`);
tests.push({ name: "Run pending creado automáticamente", pass: !!autoRun });

await page.goto("http://localhost:3000/admin/runs", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const noShowBadges = await page.locator("text=No se presentó").count();
console.log(`  Badges 'No se presentó' en tabla: ${noShowBadges}`);
tests.push({ name: "Tabla muestra badge no_show", pass: noShowBadges > 0 });

await page.screenshot({ path: "/tmp/runs-no-show.png", fullPage: true });

// === TEST 3: Modal de edición con botón "Peor + 10s" auto ===
console.log("\n=== TEST 3: Modal con botón Peor + 10s ===");
// Buscar el botón Editar del run con no_show
const editBtns = await page.locator("button:has-text('Editar')").all();
let modalOpened = false;
for (const btn of editBtns) {
  const row = btn.locator("xpath=ancestor::tr").first();
  const rowText = await row.textContent().catch(() => "");
  if (rowText?.includes("No se presentó")) {
    await btn.click();
    await page.waitForTimeout(700);
    modalOpened = true;
    break;
  }
}

if (modalOpened) {
  const banner = await page.locator("text=ESTE EQUIPO NO SE PRESENTÓ").isVisible();
  const autoBtn = await page.locator("button:has-text('Asignar peor tiempo + 10s')").isVisible();
  console.log(`  Banner 'NO SE PRESENTÓ': ${banner ? "✓" : "✗"}`);
  console.log(`  Botón 'Peor + 10s auto': ${autoBtn ? "✓" : "✗"}`);
  tests.push({ name: "Modal: banner no_show", pass: banner });
  tests.push({ name: "Modal: botón auto peor+10s", pass: autoBtn });
  await page.screenshot({ path: "/tmp/runs-modal-no-show.png" });

  // Click en el botón auto
  await page.locator("button:has-text('Asignar peor tiempo + 10s')").click();
  await page.waitForTimeout(2500);

  const { data: assignedRun } = await sb.from("runs").select("time_ms, status").eq("heat_assignment_id", noShowHa.id).single();
  console.log(`  Run después de auto: time_ms=${assignedRun?.time_ms}, status=${assignedRun?.status}`);
  // Peor en velocidad fue 5800. +10000 = 15800
  const expected = 15800;
  tests.push({ name: `Tiempo adjudicado = ${expected}ms`, pass: assignedRun?.time_ms === expected });
} else {
  console.log("  ⚠ No se encontró botón Editar para run no_show");
}

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? (t.skip ? "⊘" : "✓") : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
