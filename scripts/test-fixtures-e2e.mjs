import { readFileSync } from "fs";
const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const BASE = "http://localhost:3001";

// 1. Login
console.log("\n1. Login como admin…");
const fd = new FormData();
fd.append("email", "admin@gmail.com");
fd.append("password", "ciedi2026");

const loginRes = await fetch(`${BASE}/login`, {
  method: "POST",
  headers: { "Next-Action": "x" }, // server action
  body: fd,
  redirect: "manual",
});
console.log("status:", loginRes.status);
console.log("set-cookie:", loginRes.headers.get("set-cookie")?.slice(0, 100));

// Manual login: usar el endpoint de server action no es trivial vía fetch.
// En su lugar, generamos el JWT directamente y lo usamos como cookie.
const { SignJWT } = await import("jose");
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "e5-race-2026-super-secret-key-ciedi");
const token = await new SignJWT({
  id: "035c04ff-4265-4e54-9f5e-80baa8d01083",
  email: "admin@gmail.com",
  role: "admin",
  full_name: "Administrador",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(secret);

console.log("\n2. JWT generado, fetching /admin/fixtures…");
const pageRes = await fetch(`${BASE}/admin/fixtures`, {
  headers: { Cookie: `e5_session=${token}` },
});
const html = await pageRes.text();
console.log("status:", pageRes.status);
console.log("length:", html.length);

// Buscar nombres de equipos en el HTML
const teamNames = ["Mechanical Girls", "Thunder Wheels", "Solar Express", "Kinetic Force", "Turbo Hawks", "Iron Circuit", "Velocity Vortex", "Apex Riders"];
console.log("\n3. ¿Aparecen los nombres de equipo en el HTML?");
for (const name of teamNames) {
  const count = (html.match(new RegExp(name, "g")) || []).length;
  console.log(`  ${count > 0 ? "✓" : "✗"} ${name}: ${count} apariciones`);
}

// Buscar evidencia del FixturesManager
console.log("\n4. ¿Renderizó el componente FixturesManager?");
console.log("  Tabs presentes:", html.includes("Velocidad") && html.includes("Versatilidad"));
console.log("  Box ¿Cómo funciona?:", html.includes("¿Cómo funciona?"));
console.log("  'Sin equipo' option:", html.includes("Sin equipo"));
console.log("  'Seleccionar equipo' placeholder:", html.includes("Seleccionar equipo"));

// Si los equipos NO aparecen, mostrar fragmento de HTML para debug
if (!html.includes("Mechanical Girls")) {
  console.log("\n5. Equipos NO aparecen. Fragmento de HTML alrededor de SelectContent:");
  const idx = html.indexOf("SelectContent");
  if (idx >= 0) console.log(html.slice(idx - 200, idx + 800));
  else console.log("  (no se encontró 'SelectContent' literal — probablemente client-side)");
  
  console.log("\n   Fragmento alrededor de 'Cargar fixture' o 'fixtures':");
  const idx2 = html.search(/cargar fixture|fixtures/i);
  if (idx2 >= 0) console.log(html.slice(idx2 - 200, idx2 + 1500));
}
