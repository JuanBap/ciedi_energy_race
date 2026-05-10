"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function upsertScore(
  teamId: string,
  designBriefScore: number,
  pitchScore: number
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("scores").upsert(
    { team_id: teamId, design_brief_score: designBriefScore, pitch_score: pitchScore },
    { onConflict: "team_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/admin/scores");
  return { success: true };
}
