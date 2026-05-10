import { createClient } from "@/lib/supabase/server";
import UsersManager from "@/components/admin/UsersManager";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*, user_assignments(*)")
    .neq("role", "admin")
    .order("role");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operadores</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Cronometristas y jueces. El admin se crea directamente en Supabase.
        </p>
      </div>
      <UsersManager profiles={profiles ?? []} />
    </div>
  );
}
