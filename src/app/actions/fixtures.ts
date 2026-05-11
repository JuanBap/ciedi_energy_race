"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { TestType, Lane } from "@/types/database";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export interface VelocityFixtureRow {
  team_id: string;
  heat_number: number;
  lane: Lane;
}

export interface VersatilityFixtureRow {
  team_id: string;
  heat_number: number;
}

export async function loadVelocityFixture(rows: VelocityFixtureRow[]) {
  await requireAdmin();
  const supabase = await createClient();

  // ── Validación defensiva ────────────────────────────────────────────────
  // 1. Un mismo equipo no puede aparecer dos veces en la misma manga
  //    (aunque sea en carriles distintos — un equipo solo corre un vehículo)
  const teamPerHeat = new Map<string, Set<string>>(); // heatNum → set de team_ids
  for (const r of rows) {
    const key = String(r.heat_number);
    if (!teamPerHeat.has(key)) teamPerHeat.set(key, new Set());
    const set = teamPerHeat.get(key)!;
    if (set.has(r.team_id)) {
      return { error: `Manga ${key}: un mismo equipo no puede estar en dos carriles a la vez. Revisa la fila.` };
    }
    set.add(r.team_id);
  }

  // 2. Un carril no puede tener dos equipos en la misma manga
  const lanePerHeat = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = String(r.heat_number);
    if (!lanePerHeat.has(key)) lanePerHeat.set(key, new Set());
    const set = lanePerHeat.get(key)!;
    if (set.has(r.lane)) {
      return { error: `Manga ${key}: el carril ${r.lane} tiene dos equipos asignados.` };
    }
    set.add(r.lane);
  }

  // ── Persistencia ─────────────────────────────────────────────────────────
  const heatNumbers = Array.from(new Set(rows.map((r) => r.heat_number)));

  for (const heatNum of heatNumbers) {
    const { data: existing } = await supabase
      .from("heats")
      .select("id")
      .eq("event_id", EVENT_ID)
      .eq("test_type", "velocity")
      .eq("heat_number", heatNum)
      .maybeSingle();

    let heatId: string;

    if (!existing) {
      const { data: newHeat, error } = await supabase
        .from("heats")
        .insert({ event_id: EVENT_ID, test_type: "velocity", heat_number: heatNum })
        .select("id")
        .single();
      if (error) return { error: error.message };
      heatId = newHeat.id;
    } else {
      heatId = existing.id;
    }

    // Para evitar conflictos con asignaciones previas en este heat:
    // borramos cualquier asignación existente para los TEAM_IDs o LANES
    // que vamos a (re)insertar, así el INSERT es siempre limpio.
    const rowsForHeat = rows.filter((r) => r.heat_number === heatNum);
    const teamIds = rowsForHeat.map((r) => r.team_id);
    const lanes = rowsForHeat.map((r) => r.lane);

    if (teamIds.length > 0) {
      await supabase
        .from("heat_assignments")
        .delete()
        .eq("heat_id", heatId)
        .or(`team_id.in.(${teamIds.join(",")}),lane.in.(${lanes.join(",")})`);
    }

    const assignments = rowsForHeat.map((r) => ({
      heat_id: heatId,
      team_id: r.team_id,
      lane: r.lane,
    }));

    const { error } = await supabase.from("heat_assignments").insert(assignments);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

export async function loadVersatilityFixture(rows: VersatilityFixtureRow[]) {
  await requireAdmin();
  const supabase = await createClient();

  // Validación: una manga de versatilidad solo tiene UN equipo (la última gana)
  const dedupedMap = new Map<number, VersatilityFixtureRow>();
  for (const r of rows) dedupedMap.set(r.heat_number, r);
  const deduped = Array.from(dedupedMap.values());

  const heatNumbers = deduped.map((r) => r.heat_number);

  for (const heatNum of heatNumbers) {
    const { data: existing } = await supabase
      .from("heats")
      .select("id")
      .eq("event_id", EVENT_ID)
      .eq("test_type", "versatility")
      .eq("heat_number", heatNum)
      .maybeSingle();

    let heatId: string;

    if (!existing) {
      const { data: newHeat, error } = await supabase
        .from("heats")
        .insert({ event_id: EVENT_ID, test_type: "versatility", heat_number: heatNum })
        .select("id")
        .single();
      if (error) return { error: error.message };
      heatId = newHeat.id;
    } else {
      heatId = existing.id;
    }

    // Versatilidad: una sola asignación por manga (la última gana si vienen duplicadas)
    const rowForHeat = deduped.find((r) => r.heat_number === heatNum)!;
    // Borrar cualquier asignación anterior de esta manga (siempre 1 sola)
    await supabase.from("heat_assignments").delete().eq("heat_id", heatId);

    const { error } = await supabase
      .from("heat_assignments")
      .insert({ heat_id: heatId, team_id: rowForHeat.team_id, lane: null });

    if (error) return { error: error.message };
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

export async function deleteFixture(testType: TestType) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: heats } = await supabase
    .from("heats")
    .select("id")
    .eq("event_id", EVENT_ID)
    .eq("test_type", testType);

  if (heats && heats.length > 0) {
    const heatIds = heats.map((h) => h.id);
    await supabase.from("heat_assignments").delete().in("heat_id", heatIds);
    await supabase.from("heats").delete().in("id", heatIds);
  }

  revalidatePath("/admin/fixtures");
  return { success: true };
}

// Borra una sola manga (con sus heat_assignments y runs por cascade)
// El admin puede borrar incluso mangas en curso (gestión de emergencias).
export async function deleteHeat(heatId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("heats").delete().eq("id", heatId);
  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

// Reemplaza completamente las asignaciones de una manga de velocidad
// El admin puede editar incluso mangas en curso.
export async function updateVelocityHeat(
  heatId: string,
  assignments: { team_id: string; lane: Lane }[]
) {
  await requireAdmin();
  const supabase = await createClient();

  // Borra todas las asignaciones existentes y reinserta
  const { error: delErr } = await supabase
    .from("heat_assignments")
    .delete()
    .eq("heat_id", heatId);
  if (delErr) return { error: delErr.message };

  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      heat_id: heatId,
      team_id: a.team_id,
      lane: a.lane,
    }));
    const { error: insErr } = await supabase.from("heat_assignments").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/admin/fixtures");
  return { success: true };
}

// ── Gestión por carril (CRUD individual de cada heat_assignment) ────────────

// Asignar/reasignar equipo + cronometrista en un carril específico
// Si ya existe asignación en (heat, lane) la reemplaza; si no, la crea.
// El admin puede modificar incluso si la manga está en curso (gestión de emergencias).
export async function assignLane(
  heatId: string,
  lane: Lane,
  teamId: string,
  timerUserId: string | null
) {
  await requireAdmin();
  const supabase = await createClient();

  // Si ya hay una asignación en este (heat, lane), bórrala primero
  const { data: existing } = await supabase
    .from("heat_assignments")
    .select("id")
    .eq("heat_id", heatId)
    .eq("lane", lane)
    .maybeSingle();

  if (existing) {
    // Borra el run asociado también (si existe) para evitar dejarlo huérfano
    await supabase.from("runs").delete().eq("heat_assignment_id", existing.id);
    await supabase.from("heat_assignments").delete().eq("id", existing.id);
  }

  const { error } = await supabase.from("heat_assignments").insert({
    heat_id: heatId,
    team_id: teamId,
    lane,
    timer_user_id: timerUserId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

// Liberar un carril: borra la asignación y su run (si lo hay)
// El admin puede liberar incluso con manga activa.
export async function clearLane(heatAssignmentId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Borrar run primero (cascade no aplica de heat_assignments a runs en delete normal)
  await supabase.from("runs").delete().eq("heat_assignment_id", heatAssignmentId);
  const { error } = await supabase.from("heat_assignments").delete().eq("id", heatAssignmentId);
  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

// Solo cambiar el cronometrista asignado a un carril (sin tocar el equipo)
export async function setLaneTimer(heatAssignmentId: string, timerUserId: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("heat_assignments")
    .update({ timer_user_id: timerUserId })
    .eq("id", heatAssignmentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

// Resetear el tiempo de un carril específico (marca el run como 'failed' para auditoría
// y permite que el timer envíe uno nuevo). NO borra la asignación.
export async function resetLaneRun(heatAssignmentId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Marca todos los runs anteriores como failed (auditoría)
  const { error: failErr } = await supabase
    .from("runs")
    .update({ status: "failed" })
    .eq("heat_assignment_id", heatAssignmentId)
    .neq("status", "failed");

  if (failErr) return { error: failErr.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  revalidatePath("/admin/runs");
  return { success: true };
}

// Reiniciar una manga: invalida todos los runs + vuelve la manga a 'pending'.
// Disponible en cualquier estado. Útil para errores de carrera, repeticiones
// completas o cuando hay que reorganizar carriles.
export async function restartHeat(heatId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // 1) Marcar todos los runs como failed (auditoría)
  const { data: assignments } = await supabase
    .from("heat_assignments")
    .select("id")
    .eq("heat_id", heatId);

  if (assignments && assignments.length > 0) {
    const ids = assignments.map((a) => a.id);
    const { error: failErr } = await supabase
      .from("runs")
      .update({ status: "failed" })
      .in("heat_assignment_id", ids)
      .neq("status", "failed");
    if (failErr) return { error: failErr.message };
  }

  // 2) Volver la manga a 'pending' (admin debe reactivar conscientemente)
  const { error: statusErr } = await supabase
    .from("heats")
    .update({ status: "pending" })
    .eq("id", heatId);
  if (statusErr) return { error: statusErr.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  revalidatePath("/admin/runs");
  return { success: true };
}

// Resetear los tiempos de los 3 carriles de una manga completa
// (NO cambia el status de la manga)
export async function resetHeatRuns(heatId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("heat_assignments")
    .select("id")
    .eq("heat_id", heatId);

  if (assignments && assignments.length > 0) {
    const ids = assignments.map((a) => a.id);
    const { error } = await supabase
      .from("runs")
      .update({ status: "failed" })
      .in("heat_assignment_id", ids)
      .neq("status", "failed");
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  revalidatePath("/admin/runs");
  return { success: true };
}

// Reemplaza el equipo y/o cronometrista de una manga de versatilidad
// El admin puede editar incluso mangas en curso.
export async function updateVersatilityHeat(
  heatId: string,
  teamId: string,
  timerUserId: string | null = null
) {
  await requireAdmin();
  const supabase = await createClient();

  // Borrar runs existentes para evitar dejarlos huérfanos
  const { data: existingHas } = await supabase
    .from("heat_assignments")
    .select("id")
    .eq("heat_id", heatId);
  if (existingHas?.length) {
    await supabase.from("runs").delete().in("heat_assignment_id", existingHas.map((a) => a.id));
  }

  const { error: delErr } = await supabase
    .from("heat_assignments")
    .delete()
    .eq("heat_id", heatId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase
    .from("heat_assignments")
    .insert({ heat_id: heatId, team_id: teamId, lane: null, timer_user_id: timerUserId });
  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}

// Solo cambiar el cronometrista de una manga de versatilidad (sin tocar el equipo)
export async function setVersatilityTimer(heatId: string, timerUserId: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("heat_assignments")
    .update({ timer_user_id: timerUserId })
    .eq("heat_id", heatId);

  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  revalidatePath("/live");
  return { success: true };
}
