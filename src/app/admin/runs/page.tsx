export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import RunsManager from "@/components/admin/RunsManager";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function RunsPage() {
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("runs")
    .select(`
      *,
      heat_assignments(
        id, lane, no_show,
        teams(id, name, school, color_hex),
        heats(heat_number, test_type, status)
      )
    `)
    .order("created_at", { ascending: false });

  // Filter to only runs from this event
  const eventRuns = (runs ?? []).filter(
    (r) => r.heat_assignments?.heats
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tiempos Registrados</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Edición manual disponible para todos los tiempos
        </p>
      </div>
      <RunsManager runs={eventRuns} />
    </div>
  );
}
