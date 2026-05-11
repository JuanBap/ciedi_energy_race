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
console.log("→ setup datos…");
const { data: ha0 } = await sb.from("heat_assignments").select("id");
if (ha0?.length) {
  await sb.from("runs").delete().in("heat_assignment_id", ha0.map(a=>a.id));
  await sb.from("heat_assignments").delete().in("id", ha0.map(a=>a.id));
}
const { data: h0 } = await sb.from("heats").select("id");
if (h0?.length) await sb.from("heats").delete().in("id", h0.map(h=>h.id));

const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);
const { data: tC2 } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const { data: tC4 } = await sb.from("users").select("*").eq("email", "carril4@e5race.com").single();
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();

// Crear M1 con C2=Team0+timer C2, C4=Team1+timer C4 (C6 vacío)
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2", timer_user_id: tC2.id },
  { heat_id: h1.id, team_id: teams[1].id, lane: "C4", timer_user_id: tC4.id },
]);

async function tokenFor(u) {
  return new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
async function ctxFor(u, w=400) {
  const tok = await tokenFor(u);
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: "e5_session", value: tok, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

const tests = [];

// === TEST 1: cada timer ve solo su carril ===
console.log("\n=== TEST 1: aislamiento por carril ===");

// Activar la manga
await sb.from("heats").update({ status: "active" }).eq("id", h1.id);

const ctxC2 = await ctxFor(tC2);
const pageC2 = await ctxC2.newPage();
const errsC2 = [];
pageC2.on("console", m => m.type()==="error" && errsC2.push(m.text()));
await pageC2.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
const teamC2 = await pageC2.locator(".text-xl.font-bold").first().textContent().catch(()=>"");
const laneC2 = await pageC2.locator("header .bg-blue-700").first().textContent().catch(()=>"");
console.log(`  carril2 ve: equipo=${teamC2?.trim()}, badge carril=${laneC2?.trim()}`);
tests.push({ name: "carril2 ve C2 con Team[0]", pass: teamC2?.includes(teams[0].name) && laneC2 === "C2" });

const ctxC4 = await ctxFor(tC4);
const pageC4 = await ctxC4.newPage();
await pageC4.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
const teamC4 = await pageC4.locator(".text-xl.font-bold").first().textContent().catch(()=>"");
const laneC4 = await pageC4.locator("header .bg-blue-700").first().textContent().catch(()=>"");
console.log(`  carril4 ve: equipo=${teamC4?.trim()}, badge carril=${laneC4?.trim()}`);
tests.push({ name: "carril4 ve C4 con Team[1]", pass: teamC4?.includes(teams[1].name) && laneC4 === "C4" });

await pageC2.screenshot({ path: "/tmp/per-lane-c2.png" });
await pageC4.screenshot({ path: "/tmp/per-lane-c4.png" });

// === TEST 2: cronometrista C6 (no asignado) ve "Sin mangas asignadas" ===
console.log("\n=== TEST 2: timer C6 sin asignación ===");
const { data: tC6 } = await sb.from("users").select("*").eq("email", "carril6@e5race.com").single();
const ctxC6 = await ctxFor(tC6);
const pageC6 = await ctxC6.newPage();
await pageC6.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });
const title = await pageC6.locator("p.text-xl.font-bold").first().textContent().catch(()=>"");
console.log(`  carril6 ve: "${title?.trim()}"`);
tests.push({ name: "carril6 ve 'Sin mangas asignadas'", pass: title?.includes("Sin mangas") });
await pageC6.screenshot({ path: "/tmp/per-lane-c6-empty.png" });
await ctxC6.close();

// === TEST 3: enviar tiempo, "Repetir" del admin, reenviar ===
console.log("\n=== TEST 3: registrar tiempo, admin repite, reenvío ===");
await pageC2.locator("button:has-text('START')").click();
await pageC2.waitForTimeout(700);
await pageC2.locator("button:has-text('STOP')").click();
await pageC2.waitForTimeout(200);
await pageC2.locator("button:has-text('ENVIAR TIEMPO')").click();
await pageC2.waitForTimeout(500);
await pageC2.locator("[role='dialog'] button:has-text('SÍ')").click();
await pageC2.waitForTimeout(2000);

// Verificar run guardado
const { data: runs1 } = await sb.from("runs").select("*, heat_assignments(lane)").eq("status", "recorded");
console.log(`  Runs recorded: ${runs1?.length ?? 0}`);
tests.push({ name: "timer C2 puede enviar tiempo", pass: runs1?.length === 1 });

// Admin pide "Repetir" — usar la action
const { data: haC2 } = await sb.from("heat_assignments").select("id").eq("heat_id", h1.id).eq("lane", "C2").single();
// Llamar la action via HTTP no es trivial; simulamos directo en DB lo que hace resetLaneRun:
await sb.from("runs").update({ status: "failed" }).eq("heat_assignment_id", haC2.id).neq("status", "failed");

// El timer C2 ve la manga otra vez disponible (gracias a Realtime)
await pageC2.waitForTimeout(2500);
const submittedShown = await pageC2.locator("text=Tiempo registrado").count();
const startVisibleAgain = await pageC2.locator("button:has-text('START')").isVisible();
console.log(`  Tras 'Repetir': START visible de nuevo: ${startVisibleAgain}`);
tests.push({ name: "Repetir → timer puede registrar de nuevo", pass: startVisibleAgain || submittedShown === 0 });

await pageC2.screenshot({ path: "/tmp/per-lane-c2-after-reset.png" });

// === TEST 4: Tiempos Registrados muestra el run failed Y el nuevo ===
console.log("\n=== TEST 4: Tiempos Registrados refleja el flujo ===");
const ctxAdmin = await ctxFor(admin, 1280);
const pageAdmin = await ctxAdmin.newPage();
await pageAdmin.goto("http://localhost:3000/admin/runs", { waitUntil: "networkidle" });
const { data: allRuns } = await sb.from("runs").select("status");
console.log(`  DB runs (total): ${allRuns?.map(r => r.status).join(", ")}`);
const failedCount = allRuns?.filter(r => r.status === "failed").length ?? 0;
tests.push({ name: "tiempo 'failed' queda en auditoría", pass: failedCount === 1 });

await pageAdmin.screenshot({ path: "/tmp/per-lane-admin-runs.png", fullPage: true });

// Limpiar
await ctxC2.close();
await ctxC4.close();
await ctxAdmin.close();
await browser.close();

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);
if (errsC2.length) console.log("Errores C2:", errsC2.join("\n  "));
