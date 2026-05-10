export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import ScoresManager from "@/components/admin/ScoresManager";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function ScoresPage() {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("*, categories(name, slug), scores(*)")
    .eq("event_id", EVENT_ID)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Design Brief y Pitch</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Design Brief: 0–30 pts · Pitch en video: 0–20 pts
        </p>
      </div>
      <ScoresManager teams={teams ?? []} />
    </div>
  );
}
