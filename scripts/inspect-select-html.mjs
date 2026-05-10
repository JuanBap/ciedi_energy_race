import { readFileSync } from "fs";
const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083", email: "admin@gmail.com", role: "admin", full_name: "Administrador",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

const res = await fetch("http://localhost:3001/admin/fixtures", { headers: { Cookie: `e5_session=${token}` } });
const html = await res.text();

// Extraer cada select trigger y sus 800 chars siguientes
console.log("=== Cada SelectTrigger en el HTML ===\n");
const re = /<button[^>]*role="combobox"[^>]*>/g;
let m;
let n = 0;
while ((m = re.exec(html)) !== null && n < 5) {
  n++;
  console.log(`--- SelectTrigger #${n} ---`);
  console.log(html.slice(m.index, m.index + 600));
  console.log();
}
