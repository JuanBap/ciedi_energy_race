"use server";

import { createClient } from "@/lib/supabase/server";
import { createSession, deleteSession } from "@/lib/session";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;

  const { data: user } = await supabase
    .from("users")
    .select("id, email, password_hash, role, full_name")
    .eq("email", email)
    .single();

  if (!user) return { error: "Email o contraseña incorrectos" };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { error: "Email o contraseña incorrectos" };

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role as "admin" | "timer" | "judge",
    full_name: user.full_name,
  });

  if (user.role === "admin") redirect("/admin");
  if (user.role === "timer") redirect("/timer");
  if (user.role === "judge") redirect("/judge");
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
