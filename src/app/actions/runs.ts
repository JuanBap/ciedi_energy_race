"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function updateRun(
  runId: string,
  timeMs: number | null,
  hasPenaltyVelocity: boolean
) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("runs")
    .update({
      time_ms: timeMs,
      has_penalty_velocity: hasPenaltyVelocity,
      status: timeMs !== null ? "recorded" : "pending",
      edited_by: profile.id,
      edited_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) return { error: error.message };
  revalidatePath("/admin/runs");
  return { success: true };
}

export async function markRunFailed(runId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("runs")
    .update({ status: "failed" })
    .eq("id", runId);

  if (error) return { error: error.message };
  revalidatePath("/admin/runs");
  revalidatePath("/admin/heats");
  return { success: true };
}

export async function assignWorstTimePlusTen(runId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Get the run's heat to find other times
  const { data: run } = await supabase
    .from("runs")
    .select("heat_assignment_id, heat_assignments(heat_id)")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Run not found" };

  const heatId = (run.heat_assignments as { heat_id: string }).heat_id;

  // Get max time in this heat
  const { data: otherRuns } = await supabase
    .from("runs")
    .select("time_ms, has_penalty_velocity, heat_assignments!inner(heat_id)")
    .eq("heat_assignments.heat_id", heatId)
    .eq("status", "recorded")
    .neq("id", runId);

  if (!otherRuns || otherRuns.length === 0) {
    return { error: "No hay otros tiempos en esta manga para calcular el peor" };
  }

  const maxTime = Math.max(
    ...otherRuns.map(
      (r) => (r.time_ms ?? 0) + (r.has_penalty_velocity ? 10000 : 0)
    )
  );

  const { error } = await supabase
    .from("runs")
    .update({
      time_ms: maxTime + 10000,
      has_penalty_velocity: false,
      status: "recorded",
    })
    .eq("id", runId);

  if (error) return { error: error.message };
  revalidatePath("/admin/runs");
  return { success: true };
}

export async function reprogramRun(runId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Get run details to create a new run at end of fixture
  const { data: run } = await supabase
    .from("runs")
    .select("heat_assignment_id, heat_assignments(team_id, heat_id, heats(event_id, test_type))")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Run not found" };

  const ha = run.heat_assignments as {
    team_id: string;
    heat_id: string;
    heats: { event_id: string; test_type: string };
  };

  // Mark current run as reprogrammed
  await supabase.from("runs").update({ status: "reprogrammed" }).eq("id", runId);

  // Find next heat number
  const { data: lastHeat } = await supabase
    .from("heats")
    .select("heat_number")
    .eq("event_id", ha.heats.event_id)
    .eq("test_type", ha.heats.test_type)
    .order("heat_number", { ascending: false })
    .limit(1)
    .single();

  const nextHeatNum = (lastHeat?.heat_number ?? 0) + 1;

  // Create new heat
  const { data: newHeat, error: heatError } = await supabase
    .from("heats")
    .insert({
      event_id: ha.heats.event_id,
      test_type: ha.heats.test_type as "velocity" | "versatility",
      heat_number: nextHeatNum,
      status: "pending",
    })
    .select("id")
    .single();

  if (heatError) return { error: heatError.message };

  // Get original lane
  const { data: origHA } = await supabase
    .from("heat_assignments")
    .select("lane")
    .eq("id", run.heat_assignment_id)
    .single();

  // Create new heat assignment
  const { data: newHA, error: haError } = await supabase
    .from("heat_assignments")
    .insert({ heat_id: newHeat.id, team_id: ha.team_id, lane: origHA?.lane ?? null })
    .select("id")
    .single();

  if (haError) return { error: haError.message };

  // Create pending run
  await supabase.from("runs").insert({ heat_assignment_id: newHA.id });

  revalidatePath("/admin/runs");
  revalidatePath("/admin/heats");
  return { success: true };
}
