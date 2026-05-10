export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import TeamsList from "@/components/admin/TeamsList";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function TeamsPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: categories }] = await Promise.all([
    supabase
      .from("teams")
      .select("*, categories(*)")
      .eq("event_id", EVENT_ID)
      .order("name"),
    supabase.from("categories").select("*").eq("event_id", EVENT_ID),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Equipos</h1>
      <TeamsList teams={teams ?? []} categories={categories ?? []} />
    </div>
  );
}
