import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types/database";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function requireRole(role: UserRole | UserRole[]) {
  const profile = await getUserProfile();

  if (!profile) redirect("/login");

  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(profile.role)) redirect("/login");

  return profile;
}

export async function requireAdmin() {
  return requireRole("admin");
}
