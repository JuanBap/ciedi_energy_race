import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Asegurarnos de tener datos completos
const { count: heatsCount } = await sb.from("heats").select("*", { count: "exact", head: true });
if (heatsCount === 0) {
  console.log("→ No hay datos, ejecutando seed…");
  await import("./seed-demo-data.mjs");
}

await sb.from("events").update({ results_published: true, podium_reveal_step: 0 }).eq("id", EVENT_ID);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const tests = [];

// step 1-3: Pushcarts podio
console.log("\n→ Avanzando a step 3 (Pushcarts podio completo)");
await sb.from("events").update({ podium_reveal_step: 3 }).eq("id", EVENT_ID);
await page.waitForTimeout(3000);
const tableV1 = await page.locator("table").count();
const bestTimeV1 = await page.locator("text=Mejor tiempo en pista").count();
console.log(`  Tabla detallada visible: ${tableV1 > 0 ? "✓" : "✗"}`);
console.log(`  Tarjeta 'Mejor tiempo' visible: ${bestTimeV1} (esperado: 0)`);
tests.push({ name: "step 3: tabla sí, mejor tiempo NO", pass: tableV1 > 0 && bestTimeV1 === 0 });

// step 4: revelar mejor tiempo Pushcarts
console.log("\n→ Step 4 (Mejor tiempo Pushcarts)");
await sb.from("events").update({ podium_reveal_step: 4 }).eq("id", EVENT_ID);
await page.waitForTimeout(3000);
const bestTimeV2 = await page.locator("text=Mejor tiempo en pista").count();
console.log(`  Tarjeta 'Mejor tiempo' visible: ${bestTimeV2 > 0 ? "✓" : "✗"}`);
tests.push({ name: "step 4: mejor tiempo Pushcarts revelado", pass: bestTimeV2 > 0 });
await page.screenshot({ path: "/tmp/best-time-pushcarts.png", fullPage: true });

// step 5: HPV's 3°
console.log("\n→ Step 5 (HPV's 3°)");
await sb.from("events").update({ podium_reveal_step: 5 }).eq("id", EVENT_ID);
await page.waitForTimeout(3000);
const bestTimeHpvV1 = await page.locator("text=Mejor tiempo en pista").count();
console.log(`  Tab cambió a HPV's, mejor tiempo HPV's todavía oculto: ${bestTimeHpvV1 === 0 ? "✓" : "✗"}`);
tests.push({ name: "step 5: HPV's empezó, mejor tiempo HPV oculto", pass: bestTimeHpvV1 === 0 });

// step 8: mejor tiempo HPVs (todo revelado)
console.log("\n→ Step 8 (Mejor tiempo HPV's)");
await sb.from("events").update({ podium_reveal_step: 8 }).eq("id", EVENT_ID);
await page.waitForTimeout(3000);
const bestTimeHpvV2 = await page.locator("text=Mejor tiempo en pista").count();
console.log(`  Tarjeta mejor tiempo HPV's: ${bestTimeHpvV2 > 0 ? "✓" : "✗"}`);
tests.push({ name: "step 8: mejor tiempo HPV's revelado", pass: bestTimeHpvV2 > 0 });
await page.screenshot({ path: "/tmp/best-time-hpvs.png", fullPage: true });

console.log("\n=== RESUMEN ===");
let p = 0;
for (const t of tests) { console.log(`  ${t.pass ? "✓" : "✗"} ${t.name}`); if (t.pass) p++; }
console.log(`\n${p}/${tests.length} tests pasan`);

await browser.close();
