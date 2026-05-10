import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import JudgeView from "@/components/judge/JudgeView";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function JudgePage() {
  const profile = await requireRole(["judge", "admin"]);
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
    .eq("test_type", "versatility")
    .in("status", ["pending", "active"])
    .order("heat_number");

  return <JudgeView profile={profile} heats={heats ?? []} />;
}
