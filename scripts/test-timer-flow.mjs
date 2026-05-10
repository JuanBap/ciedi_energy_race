import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup: 3 mangas de velocidad, cada una con un equipo en C2
console.log("→ setup datos…");
const { data: heats } = await sb.from("heats").select("id");
if (heats?.length) {
  await sb.from("runs").delete().in("heat_assignment_id", (await sb.from("heat_assignments").select("id").in("heat_id", heats.map(h=>h.id))).data?.map(a=>a.id) ?? []);
  await sb.from("heat_assignments").delete().in("heat_id", heats.map(h => h.id));
  await sb.from("heats").delete().in("id", heats.map(h => h.id));
}

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);
console.log("  teams:", teams?.map(t => t.name).join(", "));

const heatRows = await Promise.all([1, 2, 3].map(async (n) => {
  const { data } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: n, status: "active" }).select("id").single();
  return data.id;
}));
console.log("  3 mangas creadas en status='active'");

for (let i = 0; i < 3; i++) {
  await sb.from("heat_assignments").insert({ heat_id: heatRows[i], team_id: teams[i].id, lane: "C2" });
}
console.log("  3 asignaciones en C2");

// Login como cronometrista C2
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const { data: timer } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const token = await new SignJWT({
  id: timer.id, email: timer.email, role: timer.role, full_name: timer.full_name,
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`); });

// === TEST: ciclar 3 equipos consecutivos ===
console.log("\n=== TEST: cronometrar 3 equipos consecutivos ===");
await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

for (let i = 1; i <= 3; i++) {
  const teamName = await page.locator(".text-2xl.font-bold").first().innerText();
  console.log(`\n  → Equipo ${i}: ${teamName}`);

  // START
  await page.locator("button:has-text('START')").click();
  await page.waitForTimeout(800);

  // STOP
  await page.locator("button:has-text('STOP')").click();
  await page.waitForTimeout(300);

  // Click "ENVIAR TIEMPO"
  await page.locator("button:has-text('ENVIAR TIEMPO')").click();
  await page.waitForTimeout(500);

  // Verificar que aparece el modal
  const modalVisible = await page.locator("text=Confirmar tiempo").isVisible();
  console.log(`    ✓ Modal de confirmación visible: ${modalVisible ? "sí" : "NO"}`);

  if (i === 1) await page.screenshot({ path: "/tmp/timer-modal.png", fullPage: false });

  // Click "SÍ"
  await page.locator("button:has-text('SÍ')").click();
  await page.waitForTimeout(1500);

  // Click "Siguiente equipo →"
  if (i < 3) {
    await page.locator("button:has-text('Siguiente equipo')").click();
    await page.waitForTimeout(800);
    const newTeamName = await page.locator(".text-2xl.font-bold").first().innerText();
    const advanced = newTeamName !== teamName;
    console.log(`    ${advanced ? "✓" : "✗"} Avanzó al siguiente equipo: ${newTeamName} ${advanced ? "" : "(MISMO QUE ANTES - BUG)"}`);
  }
}

// Verificar runs en DB
const { data: runs } = await sb.from("runs").select("*, heat_assignments(teams(name))").eq("status", "recorded");
console.log(`\n  Runs guardados en DB: ${runs?.length ?? 0}`);
for (const r of runs ?? []) {
  console.log(`    - ${r.heat_assignments?.teams?.name}: ${r.time_ms}ms`);
}

console.log("\n" + (errors.length ? `⚠ ${errors.length} errores: ${errors.join("\n  ")}` : "✓ Sin errores"));
await browser.close();
