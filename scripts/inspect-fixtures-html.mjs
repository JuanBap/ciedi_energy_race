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

// Buscar y mostrar contexto alrededor de "Mechanical Girls"
const idx = html.indexOf("Mechanical Girls");
console.log("--- 600 chars antes y 200 después de 'Mechanical Girls' ---");
console.log(html.slice(Math.max(0, idx - 600), idx + 200));
console.log("\n\n--- Buscando 'Cargar fixture' o 'Agregar manga' ---");
const idx2 = html.search(/Cargar fixture|Agregar manga/);
if (idx2 >= 0) console.log(html.slice(idx2 - 100, idx2 + 600));
else console.log("NO ENCONTRADO");

console.log("\n\n--- Buscar errores en el HTML (script innerText) ---");
const errMatch = html.match(/error.*?:\s*(['"])(.*?)\1/i);
if (errMatch) console.log("error:", errMatch[2].slice(0, 200));

// Ver si los SelectTrigger se renderizan
console.log("\n\n--- ¿Cuántos <button data-slot='select-trigger'> hay? ---");
console.log("count:", (html.match(/data-slot="select-trigger"/g) || []).length);
console.log("count radix-select-trigger:", (html.match(/data-radix-select-trigger/g) || []).length);
console.log("count <button role='combobox'>:", (html.match(/role="combobox"/g) || []).length);
