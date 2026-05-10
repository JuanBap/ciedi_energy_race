export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import EventStatusControl from "@/components/admin/EventStatusControl";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ data: event }, { count: teamsCount }, { count: heatsCount }, { count: runsCount }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", EVENT_ID).single(),
      supabase.from("teams").select("*", { count: "exact", head: true }).eq("event_id", EVENT_ID),
      supabase.from("heats").select("*", { count: "exact", head: true }).eq("event_id", EVENT_ID),
      supabase
        .from("runs")
        .select("id, heat_assignments!inner(heats!inner(event_id))", { count: "exact", head: true })
        .eq("heat_assignments.heats.event_id", EVENT_ID)
        .eq("status", "recorded"),
    ]);

  const statusColors: Record<string, string> = {
    draft: "bg-zinc-600",
    active: "bg-green-600",
    finished: "bg-blue-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Admin</h1>
          <p className="text-zinc-400 text-sm">{event?.name}</p>
        </div>
        {event && (
          <Badge className={`${statusColors[event.status]} text-white capitalize`}>
            {event.status}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Equipos" value={teamsCount ?? 0} />
        <StatCard title="Mangas" value={heatsCount ?? 0} />
        <StatCard title="Tiempos Registrados" value={runsCount ?? 0} />
        <StatCard
          title="Estado"
          value={event?.status ?? "—"}
          isText
        />
      </div>

      {event && <EventStatusControl currentStatus={event.status as "draft" | "active" | "finished"} />}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <p>📋 <strong>Fixtures</strong> → carga las mangas de velocidad y versatilidad</p>
            <p>👥 <strong>Equipos</strong> → registra los ~8 equipos con colores y escudos</p>
            <p>🎯 <strong>Notas</strong> → ingresa Design Brief (0-30) y Pitch (0-20)</p>
            <p>⏱ <strong>Mangas</strong> → controla el estado de cada manga</p>
            <p>👤 <strong>Operadores</strong> → crea cuentas de cronometristas y jueces</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Fecha del evento</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-300 text-sm space-y-1">
            <p>📅 <strong>Ensayo:</strong> miércoles 13 de mayo de 2026</p>
            <p>🏁 <strong>Competencia:</strong> jueves 14 de mayo de 2026</p>
            <p className="text-yellow-400 mt-3 font-medium">
              Plan B: Excel paralelo operado por segunda persona
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  isText = false,
}: {
  title: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-700">
      <CardContent className="pt-6">
        <p className="text-zinc-400 text-xs uppercase tracking-wide">{title}</p>
        <p className={`font-bold mt-1 ${isText ? "text-lg capitalize" : "text-3xl"} text-white`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
