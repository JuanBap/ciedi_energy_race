import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import TimerView from "@/components/timer/TimerView";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function TimerPage() {
  const profile = await requireRole(["timer", "admin"]);
  const supabase = await createClient();

  // Get user's assignment
  const { data: assignment } = await supabase
    .from("user_assignments")
    .select("*")
    .eq("user_id", profile.id)
    .eq("event_id", EVENT_ID)
    .single();

  // Get active/pending heats for this test_type
  const testType = assignment?.test_type ?? "velocity";
  const lane = assignment?.lane ?? null;

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
    .eq("test_type", testType)
    .in("status", ["pending", "active"])
    .order("heat_number");

  // Filter heat_assignments by this timer's lane (for velocity)
  const filteredHeats = heats?.map((heat) => ({
    ...heat,
    heat_assignments: lane
      ? heat.heat_assignments.filter((ha: { lane: string | null }) => ha.lane === lane)
      : heat.heat_assignments,
  })) ?? [];

  return (
    <TimerView
      profile={profile}
      assignment={assignment}
      heats={filteredHeats}
      testType={testType}
      lane={lane}
    />
  );
}
