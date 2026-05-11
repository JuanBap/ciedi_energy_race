import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

await sb.from("events").update({ results_published: true, podium_reveal_step: 0 }).eq("id", EVENT_ID);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// step 0 → publicado pero todos de espaldas (sin tab forzado)
await page.screenshot({ path: "/tmp/podium-cat-0.png", fullPage: true });
console.log("step 0: /tmp/podium-cat-0.png");

// step 1: Pushcarts 3°
await sb.from("events").update({ podium_reveal_step: 1 }).eq("id", EVENT_ID);
await page.waitForTimeout(2500);
const tabPushVisible = await page.locator("button:has-text('Pushcarts')").first().getAttribute("class");
const isPushActive = tabPushVisible?.includes("bg-yellow-400");
console.log(`step 1: tab Pushcarts activo=${isPushActive}`);
await page.screenshot({ path: "/tmp/podium-cat-1.png", fullPage: true });

// step 3: Pushcarts completo
await sb.from("events").update({ podium_reveal_step: 3 }).eq("id", EVENT_ID);
await page.waitForTimeout(2500);
const tableVisible1 = await page.locator("th:has-text('Velocidad')").isVisible();
console.log(`step 3 (Pushcarts completo): tabla visible=${tableVisible1}`);
await page.screenshot({ path: "/tmp/podium-cat-3.png", fullPage: true });

// step 4: HPV's 3° → debería cambiar de tab automáticamente
await sb.from("events").update({ podium_reveal_step: 4 }).eq("id", EVENT_ID);
await page.waitForTimeout(2500);
const tabHpvs = await page.locator("button:has-text(\"HPV's\")").first().getAttribute("class");
const isHpvsActive = tabHpvs?.includes("bg-yellow-400");
console.log(`step 4: tab HPVs activo=${isHpvsActive}`);
await page.screenshot({ path: "/tmp/podium-cat-4.png", fullPage: true });

// step 6: todo revelado
await sb.from("events").update({ podium_reveal_step: 6 }).eq("id", EVENT_ID);
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/podium-cat-6.png", fullPage: true });
console.log("step 6: /tmp/podium-cat-6.png");

await browser.close();
