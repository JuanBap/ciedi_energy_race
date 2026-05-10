import { chromium, devices } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Setup limpio
const { data: heats0 } = await sb.from("heats").select("id");
if (heats0?.length) {
  const ids = heats0.map(h => h.id);
  const { data: has } = await sb.from("heat_assignments").select("id").in("heat_id", ids);
  if (has?.length) await sb.from("runs").delete().in("heat_assignment_id", has.map(a=>a.id));
  await sb.from("heat_assignments").delete().in("heat_id", ids);
  await sb.from("heats").delete().in("id", ids);
}
const { data: teams } = await sb.from("teams").select("id, name").order("name").limit(3);
const { data: h1 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 1, status: "active" }).select("id").single();
const { data: h2 } = await sb.from("heats").insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: 2, status: "pending" }).select("id").single();
await sb.from("heat_assignments").insert([
  { heat_id: h1.id, team_id: teams[0].id, lane: "C2" },
  { heat_id: h2.id, team_id: teams[1].id, lane: "C2" },
]);

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const { data: timer } = await sb.from("users").select("*").eq("email", "carril2@e5race.com").single();
const token = await new SignJWT({ id: timer.id, email: timer.email, role: timer.role, full_name: timer.full_name })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

// Viewports a probar
const viewports = [
  { name: "iPhone SE", w: 375, h: 667 },
  { name: "iPhone 12 Pro", w: 390, h: 844 },
  { name: "Samsung S20 Ultra", w: 412, h: 915 },
  { name: "iPad Mini", w: 768, h: 1024 },
];

for (const v of viewports) {
  console.log(`\n=== ${v.name} (${v.w}×${v.h}) ===`);
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: 2,
    isMobile: v.w < 600,
    hasTouch: v.w < 800,
  });
  await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`); });

  await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

  // Verificar que no hay scroll horizontal
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`  ${hasHorizontalScroll ? "✗" : "✓"} Sin scroll horizontal`);

  // Verificar que el botón START es visible
  const startVisible = await page.locator("button:has-text('START')").isVisible();
  console.log(`  ${startVisible ? "✓" : "✗"} Botón START visible`);

  // Verificar que el timer cabe (no se corta)
  const timerEl = page.locator(".font-mono.tabular-nums").first();
  const timerBox = await timerEl.boundingBox();
  const fits = timerBox && timerBox.x >= 0 && (timerBox.x + timerBox.width) <= v.w;
  console.log(`  ${fits ? "✓" : "✗"} Timer cabe en ancho (${timerBox?.width.toFixed(0)}px ≤ ${v.w}px)`);

  // Screenshot
  const name = v.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  await page.screenshot({ path: `/tmp/timer-${name}.png`, fullPage: false });
  console.log(`  screenshot: /tmp/timer-${name}.png`);

  // Probar START → STOP → ENVIAR → modal
  await page.locator("button:has-text('START')").click();
  await page.waitForTimeout(700);
  await page.locator("button:has-text('STOP')").click();
  await page.waitForTimeout(200);
  await page.locator("button:has-text('ENVIAR TIEMPO')").click();
  await page.waitForTimeout(500);

  // Verificar modal cabe
  const modal = page.locator("[role='dialog']");
  const modalBox = await modal.boundingBox();
  const modalFits = modalBox && modalBox.x >= 0 && (modalBox.x + modalBox.width) <= v.w;
  console.log(`  ${modalFits ? "✓" : "✗"} Modal cabe en ancho (${modalBox?.width.toFixed(0)}px ≤ ${v.w}px)`);

  await page.screenshot({ path: `/tmp/timer-${name}-modal.png`, fullPage: false });

  // Cancelar modal
  await page.locator("[role='dialog'] button:has-text('NO')").click();
  await page.waitForTimeout(200);

  if (errors.length) console.log(`  ⚠ ${errors.length} errores: ${errors.join(", ")}`);

  await ctx.close();
}

await browser.close();
console.log("\n✓ Tests completados");
