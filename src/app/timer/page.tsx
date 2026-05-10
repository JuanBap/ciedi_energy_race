export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import TimerView from "@/components/timer/TimerView";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function TimerPage() {
  const profile = await requireRole(["timer", "admin"]);
  const supabase = await createClient();

  // Asignación del usuario (test_type + carril)
  const { data: assignment } = await supabase
    .from("user_assignments")
    .select("*")
    .eq("user_id", profile.id)
    .eq("event_id", EVENT_ID)
    .single();

  const testType = assignment?.test_type ?? "velocity";
  const lane = assignment?.lane ?? null;

  // Traer TODAS las mangas del test_type (no filtrar por status aquí)
  // — el cliente decide qué mostrar según estado + asignaciones del carril
  const { data: heats } = await supabase
    .from("heats")
    .select(`
      *,
      heat_assignments(
        *,
        teams(id, name, school, color_hex, shield_url),
        runs(*)
      )
    `)
    .eq("event_id", EVENT_ID)
    .eq("test_type", testType)
    .order("heat_number");

  // Filtrar heat_assignments por carril del usuario (solo aplica a velocidad)
  const filteredHeats = (heats ?? []).map((heat) => ({
    ...heat,
    heat_assignments: lane
      ? heat.heat_assignments.filter((ha: { lane: string | null }) => ha.lane === lane)
      : heat.heat_assignments,
  }));

  return (
    <TimerView
      profile={profile}
      assignment={assignment}
      heats={filteredHeats}
      testType={testType}
      lane={lane}
    />
  );
}
