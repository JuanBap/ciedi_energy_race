import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// LIMPIEZA: borrar mangas huérfanas previas
console.log("→ limpiando mangas previas…");
const { data: heats } = await sb.from("heats").select("id");
if (heats?.length) {
  await sb.from("heat_assignments").delete().in("heat_id", heats.map(h => h.id));
  await sb.from("heats").delete().in("id", heats.map(h => h.id));
}
console.log(`  ${heats?.length ?? 0} mangas borradas`);

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083", email: "admin@gmail.com", role: "admin", full_name: "Administrador",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext();
await context.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`); });

// ── TEST 1: Cargar fixture vacío ─────────────────────────────────────────────
console.log("\n=== TEST 1: Página vacía, sin fixture ===");
await page.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });
const noFixtureText = await page.locator("text=Cargar fixture").count();
console.log(`✓ Aparece 'Cargar fixture': ${noFixtureText > 0 ? "sí" : "NO"}`);

// ── TEST 2: Crear fixture de velocidad ─────────────────────────────────────
console.log("\n=== TEST 2: Crear fixture velocidad M1 ===");
const triggers = await page.$$("[data-slot='select-trigger']");
console.log(`  ${triggers.length} dropdowns en la fila`);

// Click C2, select primer equipo (Apex Riders)
await triggers[0].click();
await page.waitForTimeout(300);
await page.locator("[role='option']:has-text('Apex Riders')").click();
console.log("  ✓ C2 = Apex Riders");

// Click C4
await page.waitForTimeout(200);
const triggers2 = await page.$$("[data-slot='select-trigger']");
await triggers2[1].click();
await page.waitForTimeout(300);
await page.locator("[role='option']:has-text('Iron Circuit')").click();
console.log("  ✓ C4 = Iron Circuit");

// Click C6
await page.waitForTimeout(200);
const triggers3 = await page.$$("[data-slot='select-trigger']");
await triggers3[2].click();
await page.waitForTimeout(300);
await page.locator("[role='option']:has-text('Velocity Vortex')").click();
console.log("  ✓ C6 = Velocity Vortex");

// Guardar
await page.locator("button:has-text('Guardar fixture')").click();
await page.waitForTimeout(2000);

// Verificar en DB
const { data: savedHeats } = await sb.from("heats").select("*, heat_assignments(*, teams(name))").eq("test_type", "velocity");
console.log(`\n  En DB: ${savedHeats?.length ?? 0} manga(s) velocidad`);
for (const h of savedHeats ?? []) {
  console.log(`    M${h.heat_number}:`);
  for (const a of h.heat_assignments) {
    console.log(`      ${a.lane} → ${a.teams?.name}`);
  }
}

await page.screenshot({ path: "/tmp/fixtures-crud-1.png", fullPage: true });

// ── TEST 3: Recargar página y ver fixture ────────────────────────────────────
console.log("\n=== TEST 3: Recargar página, ver fixture cargado ===");
await page.reload({ waitUntil: "networkidle" });
const apexInTable = await page.locator("text=Apex Riders").count();
const ironInTable = await page.locator("text=Iron Circuit").count();
console.log(`✓ Apex Riders visible: ${apexInTable > 0 ? "sí" : "NO"}`);
console.log(`✓ Iron Circuit visible: ${ironInTable > 0 ? "sí" : "NO"}`);
console.log(`✓ Texto 'desde M2' (siguiente manga): ${await page.locator("text=desde M2").count() > 0 ? "sí" : "NO"}`);
await page.screenshot({ path: "/tmp/fixtures-crud-2.png", fullPage: true });

// ── TEST 4: Versatilidad ────────────────────────────────────────────────────
console.log("\n=== TEST 4: Crear fixture versatilidad ===");
await page.locator("button[role='tab']:has-text('Versatilidad')").click();
await page.waitForTimeout(500);
const versTriggers = await page.$$("[data-slot='select-trigger']");
console.log(`  ${versTriggers.length} dropdown(s) en versatilidad`);
await versTriggers[0].click();
await page.waitForTimeout(300);
await page.locator("[role='option']:has-text('Thunder Wheels')").click();
console.log("  ✓ M1 = Thunder Wheels");
await page.locator("button:has-text('Guardar fixture')").click();
await page.waitForTimeout(2000);

const { data: versHeats } = await sb.from("heats").select("*, heat_assignments(*, teams(name))").eq("test_type", "versatility");
console.log(`\n  En DB: ${versHeats?.length ?? 0} manga(s) versatilidad`);
for (const h of versHeats ?? []) {
  console.log(`    M${h.heat_number}: ${h.heat_assignments[0]?.teams?.name}`);
}
await page.screenshot({ path: "/tmp/fixtures-crud-3.png", fullPage: true });

// ── TEST 5: Limpiar fixture ─────────────────────────────────────────────────
console.log("\n=== TEST 5: Limpiar fixture velocidad ===");
await page.locator("button[role='tab']:has-text('Velocidad')").click();
await page.waitForTimeout(500);
page.on("dialog", async (d) => { await d.accept(); });
await page.locator("button:has-text('Limpiar todo')").click();
await page.waitForTimeout(2000);
const { data: afterDelete } = await sb.from("heats").select("id").eq("test_type", "velocity");
console.log(`✓ Mangas velocidad después de limpiar: ${afterDelete?.length ?? 0} (esperado: 0)`);

console.log("\n" + (errors.length ? `⚠ ${errors.length} errores: ${errors.join("\n  ")}` : "✓ Sin errores"));
await browser.close();
