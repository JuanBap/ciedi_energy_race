export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import TimerView from "@/components/timer/TimerView";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function TimerPage() {
  const profile = await requireRole(["timer", "admin"]);
  const supabase = await createClient();

  // user_assignments.test_type es solo una preferencia/hint; la asignación
  // operativa la hace el admin por manga (heat_assignments.timer_user_id).
  // Un cronometrista puede operar mangas de velocidad Y de versatilidad si
  // el admin lo asigna en ambas — por eso no filtramos por test_type aquí.
  const { data: assignment } = await supabase
    .from("user_assignments")
    .select("*")
    .eq("user_id", profile.id)
    .eq("event_id", EVENT_ID)
    .maybeSingle();

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
    .order("heat_number");

  // Por cada heat, dejar solo las heat_assignments donde el timer soy yo.
  const filteredHeats = (heats ?? []).map((heat) => ({
    ...heat,
    heat_assignments: heat.heat_assignments.filter(
      (ha: { timer_user_id: string | null }) => ha.timer_user_id === profile.id
    ),
  }));

  return (
    <TimerView
      profile={profile}
      assignment={assignment}
      heats={filteredHeats}
    />
  );
}
