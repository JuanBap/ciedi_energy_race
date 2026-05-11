export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import ScoresView from "@/components/scores/ScoresView";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function ScoresPage() {
  const supabase = await createClient();

  // Vista calculada con tiempos, posiciones y puntos
  const { data: rankings } = await supabase
    .from("v_rankings")
    .select("*")
    .eq("event_id", EVENT_ID)
    .order("category_slug")
    .order("final_position", { ascending: true, nullsFirst: false });

  // Conteo de runs 'recorded' por equipo y test_type
  // Sirve para indicar visualmente '2/3 mangas' en velocidad o '1/2' en versatilidad
  const { data: runs } = await supabase
    .from("runs")
    .select(`
      heat_assignments!inner(
        team_id,
        heats!inner(event_id, test_type)
      )
    `)
    .eq("status", "recorded")
    .eq("heat_assignments.heats.event_id", EVENT_ID);

  // Conteo de mangas totales por categoría y test_type (para mostrar X/Y)
  // Las mangas son del evento, agrupadas por test_type
  const { data: heats } = await supabase
    .from("heats")
    .select("test_type, heat_number")
    .eq("event_id", EVENT_ID);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", EVENT_ID)
    .single();

  return (
    <ScoresView
      event={event}
      initialRankings={rankings ?? []}
      initialRuns={runs ?? []}
      initialHeats={heats ?? []}
      eventId={EVENT_ID}
    />
  );
}
