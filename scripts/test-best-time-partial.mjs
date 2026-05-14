import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

// Avanzar al step 4 (Pushcarts completo + mejor tiempo)
await sb.from("events").update({ results_published: true, podium_reveal_step: 4 }).eq("id", EVENT_ID);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1300 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const bestTimeVisible = await page.locator("text=MEJOR TIEMPO EN PISTA").isVisible().catch(() => false);
const bestTimeText = await page.locator("text=MEJOR TIEMPO EN PISTA").count();
console.log("Tarjeta 'MEJOR TIEMPO EN PISTA' visible:", bestTimeVisible ? "✓" : "✗");
console.log("Count:", bestTimeText);

await page.screenshot({ path: "/tmp/best-time-fixed.png", fullPage: true });
console.log("→ /tmp/best-time-fixed.png");

// HPV's
await sb.from("events").update({ podium_reveal_step: 8 }).eq("id", EVENT_ID);
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/best-time-hpvs-fixed.png", fullPage: true });
console.log("→ /tmp/best-time-hpvs-fixed.png");

await browser.close();
