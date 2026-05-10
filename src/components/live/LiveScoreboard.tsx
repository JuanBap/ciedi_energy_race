"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import type { RankingRow } from "@/types/database";

interface Run {
  id: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
  status: string;
}

interface Team {
  id: string;
  name: string;
  school: string;
  color_hex: string;
  shield_url: string | null;
}

interface HeatAssignment {
  id: string;
  lane: string | null;
  teams: Team | null;
  runs: Run[];
}

interface Heat {
  id: string;
  heat_number: number;
  test_type: string;
  status: string;
  heat_assignments: HeatAssignment[];
}

interface Event {
  id: string;
  name: string;
  status: string;
}

interface Props {
  event: Event | null;
  initialRankings: RankingRow[];
  initialActiveHeats: Heat[];
  eventId: string;
}

export default function LiveScoreboard({
  event,
  initialRankings,
  initialActiveHeats,
  eventId,
}: Props) {
  const [rankings, setRankings] = useState<RankingRow[]>(initialRankings);
  const [activeHeats, setActiveHeats] = useState<Heat[]>(initialActiveHeats);
  const [connected, setConnected] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // Subscribe to runs changes for real-time updates
    const channel = supabase
      .channel("live-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs" },
        async () => {
          // Refetch rankings
          const { data: newRankings } = await supabase
            .from("v_rankings")
            .select("*")
            .eq("event_id", eventId)
            .order("category_slug")
            .order("final_position", { ascending: true, nullsFirst: false });

          if (newRankings) setRankings(newRankings);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "heats" },
        async () => {
          const { data: newHeats } = await supabase
            .from("heats")
            .select(`
              *,
              heat_assignments(
                *,
                teams(id, name, school, color_hex, shield_url),
                runs(id, time_ms, has_penalty_velocity, status)
              )
            `)
            .eq("event_id", eventId)
            .eq("status", "active");

          if (newHeats) setActiveHeats(newHeats);
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

  const isFinished = event?.status === "finished";
  const pushcartsRankings = rankings.filter((r) => r.category_slug === "pushcarts");
  const hpvsRankings = rankings.filter((r) => r.category_slug === "hpvs");

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-yellow-400 text-xs font-medium tracking-widest uppercase">
            CIEDI — E5 Challenge
          </p>
          <h1 className="text-2xl font-bold">{event?.name ?? "Energy Race 2026"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
          <span className="text-zinc-500 text-xs">
            {connected ? "En vivo" : "Conectando..."}
          </span>
        </div>
      </header>

      {/* Podium (when finished) */}
      {isFinished && (
        <PodiumDisplay
          pushcarts={pushcartsRankings.slice(0, 3)}
          hpvs={hpvsRankings.slice(0, 3)}
        />
      )}

      {/* Active heats */}
      {!isFinished && activeHeats.length > 0 && (
        <section className="px-6 py-6 border-b border-zinc-800">
          <h2 className="text-zinc-400 text-sm uppercase tracking-wider mb-4">
            En pista ahora
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeHeats.flatMap((heat) =>
              heat.heat_assignments.map((ha) => (
                <ActiveHeatCard key={ha.id} ha={ha} heat={heat} />
              ))
            )}
          </div>
        </section>
      )}

      {/* Rankings table */}
      <section className="px-6 py-6">
        <Tabs defaultValue="pushcarts">
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-6">
            <TabsTrigger
              value="pushcarts"
              className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black"
            >
              Pushcarts
            </TabsTrigger>
            <TabsTrigger
              value="hpvs"
              className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black"
            >
              HPV&apos;s
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pushcarts">
            <RankingsTable rankings={pushcartsRankings} />
          </TabsContent>
          <TabsContent value="hpvs">
            <RankingsTable rankings={hpvsRankings} />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function ActiveHeatCard({ ha, heat }: { ha: HeatAssignment; heat: Heat }) {
  const run = ha.runs?.[0];
  const isRecorded = run?.status === "recorded";

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 border-2"
      style={{
        backgroundColor: ha.teams?.color_hex
          ? `${ha.teams.color_hex}22`
          : "#18181b",
        borderColor: ha.teams?.color_hex ?? "#3f3f46",
      }}
    >
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">
          {heat.test_type === "velocity" ? "Velocidad" : "Versatilidad"}
          {" "}M{heat.heat_number}
          {ha.lane && ` · ${ha.lane}`}
        </Badge>
        {run?.has_penalty_velocity && (
          <Badge className="bg-red-700 text-white text-xs">+10s</Badge>
        )}
      </div>

      {ha.teams && (
        <>
          {ha.teams.shield_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ha.teams.shield_url}
              alt={ha.teams.name}
              className="w-12 h-12 object-contain"
            />
          )}
          <div>
            <p className="text-2xl font-bold leading-tight">{ha.teams.name}</p>
            <p className="text-zinc-400 text-sm">{ha.teams.school}</p>
          </div>
        </>
      )}

      <div className="font-mono text-4xl font-bold">
        {isRecorded && run.time_ms != null ? (
          <span className="text-green-400">
            {formatTime(run.time_ms + (run.has_penalty_velocity ? 10000 : 0))}
          </span>
        ) : (
          <span className="text-zinc-600 animate-pulse">▶ EN CURSO</span>
        )}
      </div>
    </div>
  );
}

function RankingsTable({ rankings }: { rankings: RankingRow[] }) {
  if (rankings.length === 0) {
    return (
      <p className="text-zinc-600 text-center py-12">
        Sin datos disponibles aún
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left py-3 pr-4 w-8">#</th>
            <th className="text-left py-3 pr-4">Equipo</th>
            <th className="text-right py-3 px-2 hidden sm:table-cell">Design</th>
            <th className="text-right py-3 px-2 hidden sm:table-cell">Pitch</th>
            <th className="text-right py-3 px-2">Vel.</th>
            <th className="text-right py-3 px-2">Vers.</th>
            <th className="text-right py-3 pl-4 font-bold text-white">Total</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row, i) => {
            const isTop3 = (row.final_position ?? 99) <= 3;
            const pos = row.final_position ?? i + 1;

            return (
              <tr
                key={row.team_id}
                className={`border-b border-zinc-900 ${isTop3 ? "bg-zinc-900/50" : ""}`}
              >
                <td className="py-3 pr-4">
                  <span
                    className={`font-bold text-lg ${
                      pos === 1
                        ? "text-yellow-400"
                        : pos === 2
                        ? "text-zinc-300"
                        : pos === 3
                        ? "text-amber-600"
                        : "text-zinc-600"
                    }`}
                  >
                    {pos}°
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: row.color_hex }}
                    />
                    <div>
                      <p className="font-medium text-white">{row.team_name}</p>
                      <p className="text-zinc-500 text-xs">{row.school}</p>
                    </div>
                  </div>
                </td>
                <td className="text-right py-3 px-2 text-zinc-400 hidden sm:table-cell">
                  {row.points_design_brief}
                </td>
                <td className="text-right py-3 px-2 text-zinc-400 hidden sm:table-cell">
                  {row.points_pitch}
                </td>
                <td className="text-right py-3 px-2">
                  <span className={row.points_velocity > 0 ? "text-blue-400" : "text-zinc-600"}>
                    {row.points_velocity}
                  </span>
                </td>
                <td className="text-right py-3 px-2">
                  <span className={row.points_versatility > 0 ? "text-green-400" : "text-zinc-600"}>
                    {row.points_versatility}
                  </span>
                </td>
                <td className="text-right py-3 pl-4">
                  <span className="font-bold text-xl text-white">{row.total_score}</span>
                  <span className="text-zinc-600 text-sm">/100</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PodiumDisplay({
  pushcarts,
  hpvs,
}: {
  pushcarts: RankingRow[];
  hpvs: RankingRow[];
}) {
  return (
    <section className="px-6 py-8 bg-zinc-950 border-b border-zinc-800">
      <h2 className="text-center text-yellow-400 text-xs font-medium tracking-widest uppercase mb-6">
        Resultados Finales
      </h2>
      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        <PodiumCategory title="Pushcarts" teams={pushcarts} />
        <PodiumCategory title="HPV's" teams={hpvs} />
      </div>
    </section>
  );
}

function PodiumCategory({ title, teams }: { title: string; teams: RankingRow[] }) {
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-3">
      <h3 className="text-white font-bold text-center text-lg">{title}</h3>
      {teams.map((team, i) => (
        <div key={team.team_id} className="flex items-center justify-between bg-zinc-900 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{medals[i]}</span>
            <div>
              <p className="font-bold text-white text-lg">{team.team_name}</p>
              <p className="text-zinc-500 text-xs">{team.school}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl text-yellow-400">{team.total_score}</p>
            <p className="text-zinc-600 text-xs">/100</p>
          </div>
        </div>
      ))}
    </div>
  );
}
