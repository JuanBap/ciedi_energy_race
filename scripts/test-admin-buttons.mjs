import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");

await sb.from("events").update({ results_published: false, podium_reveal_step: 0 }).eq("id", "00000000-0000-0000-0000-000000000001");

const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();
const token = await new SignJWT({ id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name })
  .setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/admin-publish.png", fullPage: true });
console.log("→ /tmp/admin-publish.png");
await browser.close();
