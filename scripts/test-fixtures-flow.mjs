import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const lines = readFileSync("/Users/juanbaplo/Camilo/ciedi_energy_race/.env.local", "utf8").split("\n");
for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)/); if (m) process.env[m[1].trim()] = m[2].trim(); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EVENT_ID = "00000000-0000-0000-0000-000000000001";

console.log("\n=== 1. CONSULTA DE LA PÁGINA /admin/fixtures ===");
const fixturesQuery = await Promise.all([
  sb.from("teams").select("id, name, school, categories(slug, name)").eq("event_id", EVENT_ID).order("name"),
  sb.from("heats").select("*, heat_assignments(*, teams(name, school))").eq("event_id", EVENT_ID).eq("test_type", "velocity").order("heat_number"),
  sb.from("heats").select("*, heat_assignments(*, teams(name, school))").eq("event_id", EVENT_ID).eq("test_type", "versatility").order("heat_number"),
]);

const [teamsResult, velHeats, versHeats] = fixturesQuery;
console.log("\n--- teams query ---");
console.log("error:", teamsResult.error);
console.log("count:", teamsResult.data?.length);
console.log("data:", JSON.stringify(teamsResult.data, null, 2));

console.log("\n--- velocity heats ---");
console.log("count:", velHeats.data?.length, "error:", velHeats.error?.message);

console.log("\n--- versatility heats ---");
console.log("count:", versHeats.data?.length, "error:", versHeats.error?.message);

console.log("\n=== 2. ¿QUÉ VE LA PÁGINA /admin/teams ? ===");
const teamsPageQuery = await Promise.all([
  sb.from("teams").select("*, categories(*)").eq("event_id", EVENT_ID).order("name"),
  sb.from("categories").select("*").eq("event_id", EVENT_ID),
]);
console.log("teams count:", teamsPageQuery[0].data?.length);
console.log("categories count:", teamsPageQuery[1].data?.length);

console.log("\n=== 3. TODOS LOS EQUIPOS RAW (sin filtros ni joins) ===");
const { data: rawTeams } = await sb.from("teams").select("*");
console.log("count total en DB:", rawTeams?.length);
rawTeams?.forEach(t => console.log(`  - ${t.name} (event_id=${t.event_id.slice(0,8)}…, category_id=${t.category_id.slice(0,8)}…)`));
