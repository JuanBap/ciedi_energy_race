import { createClient } from "@/lib/supabase/server";
import LiveScoreboard from "@/components/live/LiveScoreboard";

export const dynamic = "force-dynamic";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function LivePage() {
  const supabase = await createClient();

  const [{ data: event }, { data: rankings }, { data: activeHeats }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", EVENT_ID).single(),
      supabase
        .from("v_rankings")
        .select("*")
        .eq("event_id", EVENT_ID)
        .order("category_slug")
        .order("final_position", { ascending: true, nullsFirst: false }),
      supabase
        .from("heats")
        .select(`
          *,
          heat_assignments(
            *,
            teams(id, name, school, color_hex, shield_url),
            runs(id, time_ms, has_penalty_velocity, status)
          )
        `)
        .eq("event_id", EVENT_ID)
        .eq("status", "active"),
    ]);

  return (
    <LiveScoreboard
      event={event}
      initialRankings={rankings ?? []}
      initialActiveHeats={activeHeats ?? []}
      eventId={EVENT_ID}
    />
  );
}
