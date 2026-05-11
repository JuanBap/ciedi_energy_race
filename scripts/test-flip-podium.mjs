import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Reset publicación
await sb.from("events").update({ results_published: false, podium_reveal_step: 0 }).eq("id", EVENT_ID);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

// 1) Estado oculto — mensaje suspense
console.log("\n=== 1. Estado oculto: mensaje de suspense ===");
await page.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const suspense = await page.locator("text=Pronto conocerás los resultados").isVisible();
console.log(`  Mensaje 'Pronto conocerás...' visible: ${suspense ? "✓" : "✗"}`);
await page.screenshot({ path: "/tmp/scores-suspense.png", fullPage: true });

// 2) Admin publica
console.log("\n=== 2. Admin publica resultados ===");
await sb.from("events").update({ results_published: true, podium_reveal_step: 0 }).eq("id", EVENT_ID);
await page.waitForTimeout(3500);
const cardsBack = await page.locator("text=Esperando revelación").count();
console.log(`  Tarjetas de espalda visibles: ${cardsBack} (esperado: 3)`);
await page.screenshot({ path: "/tmp/scores-cards-back.png", fullPage: true });

// 3) Revelar 3° puesto
console.log("\n=== 3. Revelar 3° puesto ===");
await sb.from("events").update({ podium_reveal_step: 1 }).eq("id", EVENT_ID);
await page.waitForTimeout(3500);
await page.screenshot({ path: "/tmp/scores-reveal-3.png", fullPage: true });

// 4) Revelar 2°
console.log("\n=== 4. Revelar 2° puesto ===");
await sb.from("events").update({ podium_reveal_step: 2 }).eq("id", EVENT_ID);
await page.waitForTimeout(3500);
await page.screenshot({ path: "/tmp/scores-reveal-2.png", fullPage: true });

// 5) Revelar 1° y aparece tabla
console.log("\n=== 5. Revelar 1° puesto (aparece tabla) ===");
await sb.from("events").update({ podium_reveal_step: 3 }).eq("id", EVENT_ID);
await page.waitForTimeout(3500);
const tableVisible = await page.locator("th:has-text('Velocidad')").isVisible();
console.log(`  Tabla detallada visible: ${tableVisible ? "✓" : "✗"}`);
await page.screenshot({ path: "/tmp/scores-reveal-all.png", fullPage: true });

console.log("\nScreenshots en /tmp/scores-*.png");
await browser.close();
