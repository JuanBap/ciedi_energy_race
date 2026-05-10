import { createClient } from "@/lib/supabase/server";
import HeatsManager from "@/components/admin/HeatsManager";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function HeatsPage() {
  const supabase = await createClient();

  const { data: heats } = await supabase
    .from("heats")
    .select(`
      *,
      heat_assignments(
        *,
        teams(id, name, school, color_hex),
        runs(*)
      )
    `)
    .eq("event_id", EVENT_ID)
    .order("test_type")
    .order("heat_number");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Control de Mangas</h1>
      <HeatsManager heats={heats ?? []} />
    </div>
  );
}
