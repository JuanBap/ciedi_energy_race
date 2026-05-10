"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { UserRole, TestType, Lane } from "@/types/database";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export async function createOperator(
  email: string,
  password: string,
  role: UserRole,
  fullName: string
) {
  await requireAdmin();
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });

  if (error) return { error: error.message };

  // Update profile with full name and role
  await adminClient
    .from("user_profiles")
    .update({ role, full_name: fullName })
    .eq("id", data.user.id);

  revalidatePath("/admin/users");
  return { success: true, userId: data.user.id };
}

export async function assignUserToEvent(
  userId: string,
  testType: TestType,
  lane: Lane | null
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("user_assignments").upsert(
    { user_id: userId, event_id: EVENT_ID, test_type: testType, lane },
    { onConflict: "user_id,event_id,test_type" }
  );

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteOperator(userId: string) {
  await requireAdmin();
  const adminClient = await createAdminClient();

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
