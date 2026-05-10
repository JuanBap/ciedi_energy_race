"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  eventId: string;
  initialTeams: number;
  initialHeats: number;
  initialRuns: number;
  status: string;
}

export default function DashboardStats({
  eventId,
  initialTeams,
  initialHeats,
  initialRuns,
  status,
}: Props) {
  const [teams, setTeams] = useState(initialTeams);
  const [heats, setHeats] = useState(initialHeats);
  const [runs, setRuns] = useState(initialRuns);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const [{ count: t }, { count: h }, { count: r }] = await Promise.all([
        supabase.from("teams").select("*", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("heats").select("*", { count: "exact", head: true }).eq("event_id", eventId),
        supabase
          .from("runs")
          .select("id, heat_assignments!inner(heats!inner(event_id))", { count: "exact", head: true })
          .eq("heat_assignments.heats.event_id", eventId)
          .eq("status", "recorded"),
      ]);
      if (typeof t === "number") setTeams(t);
      if (typeof h === "number") setHeats(h);
      if (typeof r === "number") setRuns(r);
    }

    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, refetch)
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
        <span>{connected ? "Datos en vivo" : "Conectando…"}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Equipos" value={teams} />
        <StatCard title="Mangas" value={heats} />
        <StatCard title="Tiempos Registrados" value={runs} />
        <StatCard title="Estado" value={status} isText />
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
