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
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active" }).select("id").single();
await sb.from("heat_assignments").insert({ heat_id: h1.id, team_id: teams[0].id, lane: "C2", timer_user_id: tC2.id });
const { data: ha } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).single();

async function tok(u) { return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret); }

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
adminCtx.addCookies([{ name: "e5_session", value: await tok(admin), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const adminPage = await adminCtx.newPage();
const errors = [];
adminPage.on("pageerror", e => errors.push(`PAGE: ${e.message}`));
adminPage.on("console", m => m.type()==="error" && errors.push(`CONSOLE: ${m.text()}`));

const tests = [];

console.log("\n=== TEST 1: Botones Editar/Borrar/Reiniciar visibles aunque manga esté EN CURSO ===");
await adminPage.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
const editarBtn = await adminPage.locator("button:has-text('✏️ Editar'), button:has-text('Editar')").first();
const editarDisabled = await editarBtn.isDisabled().catch(() => true);
console.log(`  ✏️ Editar disabled: ${editarDisabled}`);

// Buscar específicamente botón "Reiniciar" en acciones
const reiniciarBtn = adminPage.locator("button:has-text('Reiniciar')");
const reiniciarCount = await reiniciarBtn.count();
console.log(`  🔄 Reiniciar visible: ${reiniciarCount > 0 ? "sí" : "NO"}`);
tests.push({ name: "Editar habilitado en manga activa", pass: !editarDisabled });
tests.push({ name: "Botón Reiniciar visible", pass: reiniciarCount > 0 });
await adminPage.screenshot({ path: "/tmp/restart-1.png", fullPage: true });

console.log("\n=== TEST 2: Modal de Reiniciar muestra warning para manga activa ===");
await reiniciarBtn.first().click();
await adminPage.waitForTimeout(500);
const modalOpen = await adminPage.locator("text=¿Reiniciar manga").isVisible();
const warningVisible = await adminPage.locator("[role='dialog']").getByText(/EN CURSO/).first().isVisible().catch(() => false);
console.log(`  Modal abierto: ${modalOpen}, warning EN CURSO visible: ${warningVisible}`);
tests.push({ name: "Modal con warning de manga activa", pass: modalOpen && warningVisible });
await adminPage.screenshot({ path: "/tmp/restart-2-modal.png", fullPage: false });

console.log("\n=== TEST 3: Confirmar reinicio invalida runs y vuelve a pending ===");
// Primero meter un run grabado para verificar que se marca failed
await sb.from("runs").insert({ heat_assignment_id: ha.id, time_ms: 5000, status: "recorded" });
await adminPage.waitForTimeout(2500); // realtime refresh

// El modal puede haberse cerrado por el cambio; reabrimos
await adminPage.locator("[role='dialog']").first().isVisible().then(async (v) => {
  if (!v) {
    await adminPage.locator("button:has-text('Reiniciar')").first().click();
    await adminPage.waitForTimeout(500);
  }
});

await adminPage.locator("button:has-text('Confirmar reinicio')").click();
await adminPage.waitForTimeout(2500);

const { data: heatAfter } = await sb.from("heats").select("status").eq("id", h1.id).single();
const { data: runsAfter } = await sb.from("runs").select("status").eq("heat_assignment_id", ha.id);
console.log(`  Status manga: ${heatAfter?.status} (esperado: pending)`);
console.log(`  Status runs: ${runsAfter?.map(r=>r.status).join(", ")} (esperado: failed)`);
tests.push({ name: "Manga vuelve a 'pending'", pass: heatAfter?.status === "pending" });
tests.push({ name: "Runs quedan 'failed'", pass: runsAfter?.every(r => r.status === "failed") });
await adminPage.screenshot({ path: "/tmp/restart-3-after.png", fullPage: true });

console.log("\n=== TEST 4: Reasignar carril en manga activa funciona ===");
// Reactivar
await sb.from("heats").update({ status: "active" }).eq("id", h1.id);
await adminPage.waitForTimeout(2000);
// Ahora intentar editar el carril C2
const editBtn = adminPage.locator("button:has-text('✏️ Editar')").first();
await editBtn.click();
await adminPage.waitForTimeout(500);
const editModal = await adminPage.locator("text=Asignar carril C2").isVisible();
console.log(`  Modal de asignación abierto: ${editModal}`);
tests.push({ name: "Editar carril en manga activa abre modal", pass: editModal });
await adminPage.locator("[role='dialog'] button:has-text('Cancelar')").click();

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);
if (errors.length) console.log("Errores:", errors.slice(0,5).join("\n  "));

await browser.close();
