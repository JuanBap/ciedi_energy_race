"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const school = formData.get("school") as string;
  const category_id = formData.get("category_id") as string;
  const color_hex = formData.get("color_hex") as string;

  const { error } = await supabase.from("teams").insert({
    event_id: EVENT_ID,
    category_id,
    name,
    school,
    color_hex,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { success: true };
}

export async function updateTeam(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("teams")
    .update({
      name: formData.get("name") as string,
      school: formData.get("school") as string,
      color_hex: formData.get("color_hex") as string,
      category_id: formData.get("category_id") as string,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { success: true };
}

export async function deleteTeam(id: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { success: true };
}

export async function uploadTeamShield(teamId: string, file: File) {
  await requireAdmin();
  const supabase = await createClient();

  const ext = file.name.split(".").pop();
  const path = `shields/${teamId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("escudos")
    .upload(path, file, { upsert: true });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("escudos").getPublicUrl(path);

  const { error } = await supabase
    .from("teams")
    .update({ shield_url: data.publicUrl })
    .eq("id", teamId);

  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { success: true };
}
