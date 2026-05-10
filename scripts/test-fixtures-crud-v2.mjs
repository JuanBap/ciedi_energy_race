import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup limpio + fixture inicial
console.log("→ setup datos…");
const { data: heats0 } = await sb.from("heats").select("id");
if (heats0?.length) {
  const ids = heats0.map(h => h.id);
  const { data: has } = await sb.from("heat_assignments").select("id").in("heat_id", ids);
  if (has?.length) await sb.from("runs").delete().in("heat_assignment_id", has.map(a=>a.id));
  await sb.from("heat_assignments").delete().in("heat_id", ids);
  await sb.from("heats").delete().in("id", ids);
}
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(6);

// Crear 2 mangas velocidad
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1 }).select("id").single();
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2 }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2" },
  { heat_id: h1.id, team_id: teams[1].id, lane: "C4" },
  { heat_id: h2.id, team_id: teams[2].id, lane: "C2" },
]);
console.log("  fixture inicial: 2 mangas creadas");

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083", email: "admin@gmail.com", role: "admin", full_name: "Administrador",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`); });

await page.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });

// === TEST 1: headers renombrados ===
console.log("\n=== TEST 1: Headers renombrados ===");
const headers = await page.locator("table thead th").allInnerTexts();
console.log("  Headers de la tabla:", headers.join(" | "));
const correctHeaders = headers.includes("Carril 2") && headers.includes("Carril 4") && headers.includes("Carril 6");
console.log(`  ${correctHeaders ? "✓" : "✗"} Headers son 'Carril 2/4/6'`);

// === TEST 2: Botones Editar y Borrar visibles ===
console.log("\n=== TEST 2: Botones de acción por fila ===");
const editBtns = await page.locator("button:has-text('Editar')").count();
const delBtns = await page.locator("button:has-text('Borrar')").count();
console.log(`  ✓ ${editBtns} botones Editar / ${delBtns} botones Borrar`);

await page.screenshot({ path: "/tmp/fixtures-crud-v2-1.png", fullPage: true });

// === TEST 3: Verificar dropdown muestra "Equipo — Colegio" ===
console.log("\n=== TEST 3: Dropdown muestra 'Equipo — Colegio' ===");
// Buscar el primer trigger del editor (no de la tabla)
const editorTriggers = await page.locator("[data-slot='select-trigger']").all();
await editorTriggers[0].click();
await page.waitForTimeout(400);
const firstItem = await page.locator("[role='option']").nth(1).innerText(); // [0] es "Sin equipo"
console.log(`  Primer item del dropdown: "${firstItem.replace(/\s+/g, " ")}"`);
const hasSchool = firstItem.includes("—");
console.log(`  ${hasSchool ? "✓" : "✗"} El dropdown muestra 'Equipo — Colegio'`);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// === TEST 4: Editar manga M1 ===
console.log("\n=== TEST 4: Editar manga M1 ===");
const m1Row = page.locator("tr").filter({ hasText: "M1" }).first();
await m1Row.locator("button:has-text('Editar')").click();
await page.waitForTimeout(500);
const modalOpen = await page.locator("text=Editar manga M1").isVisible();
console.log(`  ✓ Modal de edición abierto: ${modalOpen}`);
await page.screenshot({ path: "/tmp/fixtures-crud-v2-edit.png", fullPage: true });

// Cambiar C6 (que estaba vacío) a un equipo
const modal = page.locator("[role=\x27dialog\x27]");
const c6Trigger = modal.locator("[data-slot=\x27select-trigger\x27]").nth(2);
await c6Trigger.click();
await page.waitForTimeout(300);
const targetTeam = teams[3].name;
await page.locator(`[role='option']:has-text('${targetTeam}')`).first().click();
await page.waitForTimeout(300);

await modal.locator("button:has-text('Guardar cambios')").click();
await page.waitForTimeout(2000);

// Verificar en DB
const { data: m1After } = await sb.from("heat_assignments")
  .select("lane, teams(name)")
  .eq("heat_id", h1.id);
console.log(`  Asignaciones M1 después de editar:`);
for (const a of m1After ?? []) console.log(`    ${a.lane} → ${a.teams?.name}`);
const hasC6 = m1After?.some((a) => a.lane === "C6" && a.teams?.name === targetTeam);
console.log(`  ${hasC6 ? "✓" : "✗"} C6 ahora tiene ${targetTeam}`);

await page.screenshot({ path: "/tmp/fixtures-crud-v2-after-edit.png", fullPage: true });

// === TEST 5: Borrar manga M2 ===
console.log("\n=== TEST 5: Borrar manga M2 ===");
const m2Row = page.locator("tr").filter({ hasText: "M2" }).first();
await m2Row.locator("button:has-text('Borrar')").click();
await page.waitForTimeout(500);
const confirmOpen = await page.locator("text=¿Eliminar manga M2?").isVisible();
console.log(`  ✓ Modal de confirmación visible: ${confirmOpen}`);
await page.screenshot({ path: "/tmp/fixtures-crud-v2-delete.png", fullPage: true });

await page.locator("button:has-text('Eliminar')").click();
await page.waitForTimeout(2000);

const { data: heatsAfter } = await sb.from("heats").select("heat_number").eq("test_type", "velocity");
console.log(`  Mangas velocidad después: ${heatsAfter?.map(h => "M"+h.heat_number).join(", ")}`);
const m2Gone = !heatsAfter?.some(h => h.heat_number === 2);
console.log(`  ${m2Gone ? "✓" : "✗"} M2 fue eliminada`);

// === TEST 6: NO se muestra el botón "Limpiar todo" ===
console.log("\n=== TEST 6: Botón 'Limpiar todo' eliminado ===");
const limpiarBtn = await page.locator("button:has-text('Limpiar todo')").count();
console.log(`  ${limpiarBtn === 0 ? "✓" : "✗"} 'Limpiar todo' ya no existe (count=${limpiarBtn})`);

console.log("\n" + (errors.length ? `⚠ ${errors.length} errores:\n  ${errors.join("\n  ")}` : "✓ Sin errores"));
await browser.close();
