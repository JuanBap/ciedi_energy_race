import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083", email: "admin@gmail.com", role: "admin", full_name: "Administrador",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();

for (const [name, url] of [["login", "/login"], ["admin", "/admin"]]) {
  await page.goto(`http://localhost:3000${url}`, { waitUntil: "networkidle" });
  const logo = await page.locator('img[alt="E5 Energy Race 2026"]').count();
  console.log(`${url} → ${logo} logo(s) encontrados`);
  await page.screenshot({ path: `/tmp/logo-${name}.png`, fullPage: false });
}
await browser.close();
