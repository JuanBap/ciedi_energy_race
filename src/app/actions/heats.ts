"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function setHeatStatus(
  heatId: string,
  status: "pending" | "active" | "finished" | "failed"
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("heats")
    .update({ status })
    .eq("id", heatId);

  if (error) return { error: error.message };
  // Revalidar todas las páginas que muestran estado de mangas
  revalidatePath("/admin/heats");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/runs");
  revalidatePath("/admin");
  revalidatePath("/timer");
  revalidatePath("/live");
  return { success: true };
}

export async function setEventStatus(
  status: "draft" | "active" | "finished"
) {
  await requireAdmin();
  const supabase = await createClient();

  const EVENT_ID = "00000000-0000-0000-0000-000000000001";
  const { error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", EVENT_ID);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: true };
}
