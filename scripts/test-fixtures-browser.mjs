import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

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
await context.addCookies([{
  name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax",
}]);
const page = await context.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`CONSOLE ERROR: ${msg.text()}`); });

console.log("→ navegando a /admin/fixtures…");
await page.goto("http://localhost:3000/admin/fixtures", { waitUntil: "networkidle" });

// Esperar a que los SelectTriggers existan
await page.waitForSelector("[data-slot='select-trigger']", { timeout: 5000 });
const triggers = await page.$$("[data-slot='select-trigger']");
console.log(`✓ ${triggers.length} SelectTrigger(s) encontrado(s)`);

// Tomar screenshot del estado inicial
await page.screenshot({ path: "/tmp/fixtures-1-initial.png", fullPage: true });
console.log("  screenshot inicial: /tmp/fixtures-1-initial.png");

// Click en el primer trigger (C2 de M1)
console.log("\n→ click en SelectTrigger #1 (C2)…");
await triggers[0].click();
await page.waitForTimeout(500);

// Buscar items del dropdown
const items = await page.$$("[role='option']");
console.log(`✓ ${items.length} item(s) en el dropdown`);

// Texto visible de los items
for (const item of items) {
  const text = await item.innerText();
  console.log(`  - "${text.replace(/\s+/g, " ").trim()}"`);
}

await page.screenshot({ path: "/tmp/fixtures-2-open.png", fullPage: true });
console.log("\n  screenshot abierto: /tmp/fixtures-2-open.png");

// Click en un equipo para probar selección
if (items.length > 1) {
  const targetText = await items[1].innerText();
  console.log(`\n→ clickeando "${targetText.trim()}"…`);
  await items[1].click();
  await page.waitForTimeout(300);
  const triggerText = await triggers[0].innerText();
  console.log(`✓ Trigger ahora muestra: "${triggerText.trim()}"`);
  await page.screenshot({ path: "/tmp/fixtures-3-selected.png", fullPage: true });
}

if (errors.length) {
  console.log("\n⚠ ERRORES detectados:");
  errors.forEach((e) => console.log("  " + e));
} else {
  console.log("\n✓ Sin errores de consola/página");
}

await browser.close();
