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

// Eliminar permanentemente un run de la tabla.
// La asignación del carril (heat_assignments) se mantiene — solo borra el tiempo.
// Si después el cronometrista o el admin quieren registrar otro tiempo en esa
// asignación, simplemente lo crean nuevo.
export async function deleteRun(runId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("runs").delete().eq("id", runId);
  if (error) return { error: error.message };

  // Revalidar todas las páginas que dependen de runs
  revalidatePath("/admin/runs");
  revalidatePath("/admin/heats");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin");
  revalidatePath("/live");
  revalidatePath("/scores");
  return { success: true };
}

// Asigna al run el peor tiempo registrado en TODA la prueba (velocity o versatility)
// + 10s de penalización. Útil cuando un equipo no se presentó y el reglamento
// indica adjudicar el peor tiempo + 10s.
export async function assignWorstTimePlusTen(runId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Obtener el test_type del run para limitar el peor tiempo a la misma prueba
  const { data: run } = await supabase
    .from("runs")
    .select("heat_assignment_id, heat_assignments(heats(test_type, event_id))")
    .eq("id", runId)
    .single() as {
      data: {
        heat_assignment_id: string;
        heat_assignments: { heats: { test_type: string; event_id: string } | null } | null;
      } | null;
    };

  if (!run) return { error: "Run no encontrado" };
  const testType = run.heat_assignments?.heats?.test_type;
  const eventId = run.heat_assignments?.heats?.event_id;
  if (!testType || !eventId) return { error: "Faltan datos del heat" };

  // Peor tiempo registrado en TODA la prueba del evento (no solo en esta manga)
  const { data: allRuns } = await supabase
    .from("runs")
    .select("time_ms, has_penalty_velocity, heat_assignments!inner(heats!inner(event_id, test_type))")
    .eq("heat_assignments.heats.event_id", eventId)
    .eq("heat_assignments.heats.test_type", testType)
    .eq("status", "recorded")
    .neq("id", runId);

  if (!allRuns || allRuns.length === 0) {
    return { error: `No hay otros tiempos registrados en ${testType} para calcular el peor.` };
  }

  const worstMs = Math.max(
    ...allRuns.map((r) => (r.time_ms ?? 0) + (r.has_penalty_velocity ? 10000 : 0))
  );

  const { error } = await supabase
    .from("runs")
    .update({
      time_ms: worstMs + 10000,
      has_penalty_velocity: false,
      status: "recorded",
    })
    .eq("id", runId);

  if (error) return { error: error.message };
  revalidatePath("/admin/runs");
  revalidatePath("/admin/heats");
  revalidatePath("/admin/fixtures");
  revalidatePath("/live");
  revalidatePath("/scores");
  return { success: true, assignedMs: worstMs + 10000 };
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
