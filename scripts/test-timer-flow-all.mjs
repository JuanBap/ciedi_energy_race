import { chromium } from "playwright-core";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

const timers = ["carril2@e5race.com", "carril4@e5race.com", "carril6@e5race.com"];

for (const email of timers) {
  console.log(`\n=== ${email} ===`);
  const { data: u } = await sb.from("users").select("*").eq("email", email).single();
  const { data: a } = await sb.from("user_assignments").select("*").eq("user_id", u.id).single();
  console.log(`  user_assignment: test_type=${a?.test_type}, lane=${a?.lane}`);

  // Heats que el server query devolvería (test_type=velocity, status in pending/active)
  const { data: serverHeats } = await sb.from("heats")
    .select("*, heat_assignments(*, teams(name))")
    .eq("test_type", a?.test_type ?? "velocity")
    .in("status", ["pending", "active"])
    .order("heat_number");
  console.log(`  server query devuelve ${serverHeats?.length ?? 0} heats:`);
  for (const h of serverHeats ?? []) {
    console.log(`    M${h.heat_number} (${h.status}) → ${h.heat_assignments.map(x => `${x.lane}=${x.teams?.name}`).join(", ") || "sin asignaciones"}`);
  }

  // Filtrar por carril
  const filtered = (serverHeats ?? []).map(h => ({
    ...h, heat_assignments: h.heat_assignments.filter(ha => ha.lane === a?.lane)
  }));
  const visibles = filtered.filter(h => h.heat_assignments.length > 0);
  console.log(`  después de filtrar por carril ${a?.lane}: ${visibles.length} heats con asignación visible`);

  // Browser test
  const token = await new SignJWT({ id: u.id, email: u.email, role: u.role, full_name: u.full_name })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.addCookies([{ name: "e5_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/timer", { waitUntil: "networkidle" });

  const sinMangas = await page.locator("text=Sin mangas asignadas").count();
  const teamShown = await page.locator(".text-xl.font-bold").first().textContent().catch(() => null);
  console.log(`  UI muestra: ${sinMangas > 0 ? "'Sin mangas asignadas'" : `'${teamShown?.trim()}'`}`);

  const safe = email.replace(/[@.]/g, "_");
  await page.screenshot({ path: `/tmp/timer-${safe}.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
