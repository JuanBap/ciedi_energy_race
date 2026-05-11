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

  // Registrar started_at cuando se activa por primera vez (sirve para
  // el cronómetro en vivo de /live). Si se reactiva tras un reset,
  // sobreescribimos el started_at con la hora actual.
  const update: { status: typeof status; started_at?: string | null } = { status };
  if (status === "active") {
    update.started_at = new Date().toISOString();
  } else if (status === "pending") {
    // Si vuelve a pending (reset/reinicio), limpiar el timestamp
    update.started_at = null;
  }

  const { error } = await supabase
    .from("heats")
    .update(update)
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
