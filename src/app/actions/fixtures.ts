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

  // Get or create heats for each heat_number
  const heatNumbers = Array.from(new Set(rows.map((r) => r.heat_number)));

  for (const heatNum of heatNumbers) {
    const { data: existing } = await supabase
      .from("heats")
      .select("id")
      .eq("event_id", EVENT_ID)
      .eq("test_type", "velocity")
      .eq("heat_number", heatNum)
      .single();

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

    const assignments = rows
      .filter((r) => r.heat_number === heatNum)
      .map((r) => ({ heat_id: heatId, team_id: r.team_id, lane: r.lane }));

    const { error } = await supabase
      .from("heat_assignments")
      .upsert(assignments, { onConflict: "heat_id,team_id" });

    if (error) return { error: error.message };
  }

  revalidatePath("/admin/fixtures");
  return { success: true };
}

export async function loadVersatilityFixture(rows: VersatilityFixtureRow[]) {
  await requireAdmin();
  const supabase = await createClient();

  const heatNumbers = Array.from(new Set(rows.map((r) => r.heat_number)));

  for (const heatNum of heatNumbers) {
    const { data: existing } = await supabase
      .from("heats")
      .select("id")
      .eq("event_id", EVENT_ID)
      .eq("test_type", "versatility")
      .eq("heat_number", heatNum)
      .single();

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

    const assignments = rows
      .filter((r) => r.heat_number === heatNum)
      .map((r) => ({ heat_id: heatId, team_id: r.team_id, lane: null }));

    const { error } = await supabase
      .from("heat_assignments")
      .upsert(assignments, { onConflict: "heat_id,team_id" });

    if (error) return { error: error.message };
  }

  revalidatePath("/admin/fixtures");
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
export async function deleteHeat(heatId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: heat } = await supabase
    .from("heats")
    .select("status")
    .eq("id", heatId)
    .single();

  if (heat?.status === "active") {
    return { error: "No se puede borrar una manga en curso. Ciérrala primero." };
  }

  const { error } = await supabase.from("heats").delete().eq("id", heatId);
  if (error) return { error: error.message };

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/heats");
  return { success: true };
}

// Reemplaza completamente las asignaciones de una manga de velocidad
export async function updateVelocityHeat(
  heatId: string,
  assignments: { team_id: string; lane: Lane }[]
) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: heat } = await supabase
    .from("heats")
    .select("status")
    .eq("id", heatId)
    .single();

  if (heat?.status === "active") {
    return { error: "No se puede editar una manga en curso. Ciérrala primero." };
  }

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

// Reemplaza el equipo de una manga de versatilidad
export async function updateVersatilityHeat(heatId: string, teamId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: heat } = await supabase
    .from("heats")
    .select("status")
    .eq("id", heatId)
    .single();

  if (heat?.status === "active") {
    return { error: "No se puede editar una manga en curso. Ciérrala primero." };
  }

  const { error: delErr } = await supabase
    .from("heat_assignments")
    .delete()
    .eq("heat_id", heatId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase
    .from("heat_assignments")
    .insert({ heat_id: heatId, team_id: teamId, lane: null });
  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/fixtures");
  return { success: true };
}
