"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { UserRole, TestType, Lane } from "@/types/database";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export async function createOperator(
  email: string,
  password: string,
  role: UserRole,
  fullName: string
) {
  await requireAdmin();
  const supabase = await createClient();

  const password_hash = await bcrypt.hash(password, 10);

  const { error } = await supabase.from("users").insert({
    email: email.trim().toLowerCase(),
    password_hash,
    role,
    full_name: fullName,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function changePassword(userId: string, newPassword: string) {
  await requireAdmin();
  const supabase = await createClient();

  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from("users")
    .update({ password_hash })
    .eq("id", userId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function assignUserToEvent(
  userId: string,
  testType: TestType,
  _lane?: Lane | null  // ya no se usa: el carril se asigna por manga, no por usuario
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("user_assignments").upsert(
    { user_id: userId, event_id: EVENT_ID, test_type: testType },
    { onConflict: "user_id,event_id,test_type" }
  );

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteOperator(userId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
