export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import UsersManager from "@/components/admin/UsersManager";

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("users")
    .select("id, email, role, full_name, user_assignments(test_type, lane)")
    .neq("role", "admin")
    .order("role");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operadores</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Cronometristas y jueces. El admin está hardcodeado en el seed.
        </p>
      </div>
      <UsersManager profiles={profiles ?? []} />
    </div>
  );
}
