import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const { data: admin } = await sb.from("users").select("*").eq("email", "admin@gmail.com").single();
const token = await new SignJWT({ id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name })
  .setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret);

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

// Home
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const home = await ctx1.newPage();
await home.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await home.waitForTimeout(1000);
await home.screenshot({ path: "/tmp/brand-home.png", fullPage: true });

// Login
const login = await ctx1.newPage();
await login.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await login.waitForTimeout(1000);
await login.screenshot({ path: "/tmp/brand-login.png", fullPage: true });

// Admin
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
ctx2.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const admin1 = await ctx2.newPage();
await admin1.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
await admin1.waitForTimeout(1000);
await admin1.screenshot({ path: "/tmp/brand-admin.png", fullPage: true });

// /live
const live = await ctx1.newPage();
await live.goto("http://localhost:3000/live", { waitUntil: "networkidle" });
await live.waitForTimeout(1500);
await live.screenshot({ path: "/tmp/brand-live.png", fullPage: true });

// /scores
const scores = await ctx1.newPage();
await scores.goto("http://localhost:3000/scores", { waitUntil: "networkidle" });
await scores.waitForTimeout(1500);
await scores.screenshot({ path: "/tmp/brand-scores.png", fullPage: true });

console.log("Screenshots en /tmp/brand-*.png");
await browser.close();
