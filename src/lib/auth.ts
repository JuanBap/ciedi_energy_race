import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types/database";

export async function getUserProfile() {
  return getSession();
}

export async function requireRole(role: UserRole | UserRole[]) {
  const session = await getSession();
  if (!session) redirect("/login");

  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(session.role as UserRole)) redirect("/login");

  return session;
}

export async function requireAdmin() {
  return requireRole("admin");
}
