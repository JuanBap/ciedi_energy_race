import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Asegurar que haya al menos 1 run para probar el delete
const { data: existingRuns } = await sb.from("runs").select("id").limit(1);
let testRunId = existingRuns?.[0]?.id;

if (!testRunId) {
  console.log("→ No hay runs, creando uno de prueba…");
  const { data: ha } = await sb.from("heat_assignments").select("id").limit(1).single();
  if (!ha) {
    console.log("⚠ Sin heat_assignments. Seedeando primero…");
    process.exit(1);
  }
  const { data: newRun } = await sb.from("runs").insert({ heat_assignment_id: ha.id, time_ms: 5500, status: "recorded" }).select("id").single();
  testRunId = newRun.id;
}

const { count: runsBefore } = await sb.from("runs").select("*", { count: "exact", head: true });
console.log(`Runs en DB antes: ${runsBefore}`);

const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();
const token = await new SignJWT({ id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name })
  .setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const tests = [];

await page.goto("http://localhost:3000/admin/runs", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

console.log("\n=== TEST 1: Botón 'Eliminar' presente en cada fila ===");
const deleteBtns = await page.locator("button:has-text('Eliminar')").count();
console.log(`  Botones Eliminar: ${deleteBtns}`);
tests.push({ name: "Botón Eliminar visible", pass: deleteBtns > 0 });
await page.screenshot({ path: "/tmp/runs-delete-row.png", fullPage: false });

console.log("\n=== TEST 2: Click Eliminar abre modal de confirmación ===");
await page.locator("button:has-text('Eliminar')").first().click();
await page.waitForTimeout(500);
const modalOpen = await page.locator("text=¿Eliminar este registro?").isVisible();
const teamText = await page.locator("[role='dialog'] strong").first().textContent().catch(() => "");
console.log(`  Modal abierto: ${modalOpen ? "✓" : "✗"}`);
console.log(`  Muestra info del equipo: "${teamText?.trim()}"`);
tests.push({ name: "Modal de confirmación se abre", pass: modalOpen });
await page.screenshot({ path: "/tmp/runs-delete-modal.png", fullPage: false });

console.log("\n=== TEST 3: Confirmar elimina el registro ===");
await page.locator("[role='dialog'] button:has-text('Eliminar')").click();
await page.waitForTimeout(2500);

const { count: runsAfter } = await sb.from("runs").select("*", { count: "exact", head: true });
console.log(`  Runs en DB después: ${runsAfter} (esperado: ${runsBefore - 1})`);
tests.push({ name: "Run eliminado de DB", pass: runsAfter === runsBefore - 1 });

console.log("\n=== TEST 4: Tabla refresca sin recargar ===");
const newDeleteBtns = await page.locator("button:has-text('Eliminar')").count();
console.log(`  Botones Eliminar después: ${newDeleteBtns} (era ${deleteBtns})`);
tests.push({ name: "Tabla se actualiza sin recargar", pass: newDeleteBtns === deleteBtns - 1 });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
