import { createClient } from "@/lib/supabase/server";
import LiveScoreboard from "@/components/live/LiveScoreboard";

export const dynamic = "force-dynamic";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function LivePage() {
  const supabase = await createClient();

  const [{ data: event }, { data: heats }, { data: podium }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", EVENT_ID).single(),
      supabase
        .from("heats")
        .select(`
          id, heat_number, test_type, status, started_at,
          heat_assignments(
            id, lane, team_id, no_show,
            teams(id, name, school, color_hex, shield_url, categories(slug, name)),
            runs(id, time_ms, has_penalty_velocity, status)
          )
        `)
        .eq("event_id", EVENT_ID)
        .order("test_type")
        .order("heat_number"),
      // Solo para podio final
      supabase
        .from("v_rankings")
        .select("*")
        .eq("event_id", EVENT_ID)
        .order("category_slug")
        .order("final_position", { ascending: true, nullsFirst: false }),
    ]);

  return (
    <LiveScoreboard
      event={event}
      initialHeats={heats ?? []}
      initialPodium={podium ?? []}
      eventId={EVENT_ID}
    />
  );
}
