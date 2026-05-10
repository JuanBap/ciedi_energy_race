export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import FixturesManager from "@/components/admin/FixturesManager";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function FixturesPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: velocityHeats }, { data: versatilityHeats }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, school, categories(slug, name)")
        .eq("event_id", EVENT_ID)
        .order("name"),
      supabase
        .from("heats")
        .select("*, heat_assignments(*, teams(id, name, school, color_hex))")
        .eq("event_id", EVENT_ID)
        .eq("test_type", "velocity")
        .order("heat_number"),
      supabase
        .from("heats")
        .select("*, heat_assignments(*, teams(id, name, school, color_hex))")
        .eq("event_id", EVENT_ID)
        .eq("test_type", "versatility")
        .order("heat_number"),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fixtures</h1>
      <FixturesManager
        teams={teams ?? []}
        velocityHeats={velocityHeats ?? []}
        versatilityHeats={versatilityHeats ?? []}
      />
    </div>
  );
}
