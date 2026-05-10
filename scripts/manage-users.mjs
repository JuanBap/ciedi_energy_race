#!/usr/bin/env node
/**
 * Gestión de usuarios desde terminal
 *
 * Uso:
 *   node scripts/manage-users.mjs create <email> <password> <role> [fullName]
 *   node scripts/manage-users.mjs list
 *   node scripts/manage-users.mjs delete <email>
 *   node scripts/manage-users.mjs passwd <email> <newPassword>
 *
 * Roles válidos: admin | timer | judge
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── cargar .env.local ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {
  console.error("❌  No se encontró .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_ROLES = ["admin", "timer", "judge"];
const [, , cmd, ...args] = process.argv;

async function create(email, password, role, fullName) {
  if (!email || !password || !role) {
    console.error("Uso: create <email> <password> <role> [fullName]");
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Rol inválido. Usa: ${VALID_ROLES.join(" | ")}`);
    process.exit(1);
  }
  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from("users")
    .insert({ email: email.trim().toLowerCase(), password_hash, role, full_name: fullName ?? null })
    .select("id, email, role, full_name")
    .single();
  if (error) { console.error("❌ ", error.message); process.exit(1); }
  console.log("✅  Usuario creado:");
  console.table([data]);
}

async function list() {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, full_name, created_at")
    .order("role")
    .order("email");
  if (error) { console.error("❌ ", error.message); process.exit(1); }
  if (!data.length) { console.log("No hay usuarios."); return; }
  console.table(data.map(u => ({ id: u.id.slice(0,8)+"…", email: u.email, role: u.role, nombre: u.full_name ?? "—", creado: u.created_at?.slice(0,10) })));
}

async function del(email) {
  if (!email) { console.error("Uso: delete <email>"); process.exit(1); }
  const { error } = await supabase.from("users").delete().eq("email", email.toLowerCase());
  if (error) { console.error("❌ ", error.message); process.exit(1); }
  console.log(`✅  Usuario ${email} eliminado`);
}

async function passwd(email, newPassword) {
  if (!email || !newPassword) { console.error("Uso: passwd <email> <newPassword>"); process.exit(1); }
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase.from("users").update({ password_hash }).eq("email", email.toLowerCase());
  if (error) { console.error("❌ ", error.message); process.exit(1); }
  console.log(`✅  Contraseña de ${email} actualizada`);
}

async function setRole(email, role) {
  if (!email || !role) { console.error("Uso: role <email> <role>"); process.exit(1); }
  if (!VALID_ROLES.includes(role)) { console.error(`Rol inválido. Usa: ${VALID_ROLES.join(" | ")}`); process.exit(1); }
  const { error } = await supabase.from("users").update({ role }).eq("email", email.toLowerCase());
  if (error) { console.error("❌ ", error.message); process.exit(1); }
  console.log(`✅  ${email} ahora tiene rol ${role}`);
}

switch (cmd) {
  case "create":  await create(args[0], args[1], args[2], args[3]); break;
  case "list":    await list(); break;
  case "delete":  await del(args[0]); break;
  case "passwd":  await passwd(args[0], args[1]); break;
  case "role":    await setRole(args[0], args[1]); break;
  default:
    console.log(`
E5 Race — Gestión de usuarios

  node scripts/manage-users.mjs create <email> <password> <role> [nombre]
  node scripts/manage-users.mjs list
  node scripts/manage-users.mjs delete <email>
  node scripts/manage-users.mjs passwd <email> <nuevaContraseña>

Roles: admin | timer | judge
`);
}
