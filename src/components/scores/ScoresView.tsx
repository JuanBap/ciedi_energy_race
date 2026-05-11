"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatTimePrecise } from "@/lib/utils";
import type { RankingRow } from "@/types/database";

interface RunRow {
  heat_assignments: {
    team_id: string;
    heats: { event_id: string; test_type: string } | null;
  } | null;
}

interface HeatRow {
  test_type: string;
  heat_number: number;
}

interface Event {
  id: string;
  name: string;
  status: string;
}

interface Props {
  event: Event | null;
  initialRankings: RankingRow[];
  initialRuns: RunRow[];
  initialHeats: HeatRow[];
  eventId: string;
}

type CategoryFilter = "pushcarts" | "hpvs";

// Tabla de puntos por posición (handbook)
const POSITION_POINTS: Record<number, number> = {
  1: 25, 2: 20, 3: 15, 4: 10, 5: 5, 6: 4, 7: 3,
};

export default function ScoresView({
  event,
  initialRankings,
  initialRuns,
  initialHeats,
  eventId,
}: Props) {
  const [rankings, setRankings] = useState<RankingRow[]>(initialRankings);
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [heats, setHeats] = useState<HeatRow[]>(initialHeats);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<CategoryFilter>("pushcarts");

  useEffect(() => {
    const supabase = createClient();

    async function refetchAll() {
      const [r, ru, h] = await Promise.all([
        supabase
          .from("v_rankings")
          .select("*")
          .eq("event_id", eventId)
          .order("category_slug")
          .order("final_position", { ascending: true, nullsFirst: false }),
        supabase
          .from("runs")
          .select(`heat_assignments!inner(team_id, heats!inner(event_id, test_type))`)
          .eq("status", "recorded")
          .eq("heat_assignments.heats.event_id", eventId),
        supabase
          .from("heats")
          .select("test_type, heat_number")
          .eq("event_id", eventId),
      ]);
      if (r.data) setRankings(r.data);
      if (ru.data) setRuns(ru.data as unknown as RunRow[]);
      if (h.data) setHeats(h.data);
    }

    const channel = supabase
      .channel("scores-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetchAll)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    const interval = setInterval(refetchAll, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [eventId]);

  // Conteo total de mangas por test_type (cuántas se esperan)
  const totalHeats = useMemo(() => {
    const counts: Record<string, number> = { velocity: 0, versatility: 0 };
    for (const h of heats) counts[h.test_type] = (counts[h.test_type] ?? 0) + 1;
    return counts;
  }, [heats]);

  // Conteo de mangas con tiempo registrado por equipo y test_type
  const runsByTeam = useMemo(() => {
    const map = new Map<string, { velocity: number; versatility: number }>();
    for (const r of runs) {
      const team = r.heat_assignments?.team_id;
      const tt = r.heat_assignments?.heats?.test_type;
      if (!team || !tt) continue;
      const cur = map.get(team) ?? { velocity: 0, versatility: 0 };
      if (tt === "velocity") cur.velocity++;
      else if (tt === "versatility") cur.versatility++;
      map.set(team, cur);
    }
    return map;
  }, [runs]);

  // Rankings por categoría, recalculando puntos correctamente:
  // - Si time_xxx_total es NULL, el equipo NO obtiene puntos en esa prueba
  // - Las posiciones se recalculan ignorando equipos sin tiempo
  const tabRankings = useMemo(() => {
    const all = rankings.filter((r) => r.category_slug === tab);

    // Recalcular posición y puntos por velocidad (solo entre los que TIENEN tiempo)
    const velRanked = [...all]
      .filter((r) => r.time_velocity_total !== null)
      .sort((a, b) => (a.time_velocity_total ?? 0) - (b.time_velocity_total ?? 0));
    const velPosMap = new Map<string, number>();
    velRanked.forEach((r, i) => velPosMap.set(r.team_id, i + 1));

    const verRanked = [...all]
      .filter((r) => r.time_versatility_total !== null)
      .sort((a, b) => (a.time_versatility_total ?? 0) - (b.time_versatility_total ?? 0));
    const verPosMap = new Map<string, number>();
    verRanked.forEach((r, i) => verPosMap.set(r.team_id, i + 1));

    // Computar puntos correctos (NULL si no corrió, según tabla)
    const enriched = all.map((r) => {
      const velPos = velPosMap.get(r.team_id) ?? null;
      const verPos = verPosMap.get(r.team_id) ?? null;
      const velPts = velPos ? (POSITION_POINTS[velPos] ?? 0) : 0;
      const verPts = verPos ? (POSITION_POINTS[verPos] ?? 0) : 0;
      const total = (r.points_design_brief ?? 0) + (r.points_pitch ?? 0) + velPts + verPts;
      return {
        ...r,
        velPos,
        verPos,
        velPts,
        verPts,
        total,
      };
    });

    // Posición final por total
    const sorted = [...enriched].sort((a, b) => b.total - a.total);
    return sorted.map((r, i) => ({ ...r, finalPos: i + 1 }));
  }, [rankings, tab]);

  const isFinished = event?.status === "finished";

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-yellow-400 text-[10px] sm:text-xs font-medium tracking-widest uppercase">
            CIEDI — E5 Challenge
          </p>
          <h1 className="text-xl sm:text-2xl font-bold">Puntajes — {event?.name ?? "Energy Race 2026"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className="text-zinc-400 text-xs sm:text-sm">
            {connected ? "EN VIVO" : "Conectando..."}
          </span>
        </div>
      </header>

      <section className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-950 sticky top-[64px] sm:top-[72px] z-[9] backdrop-blur">
        <div className="flex gap-2">
          <CategoryChip active={tab === "pushcarts"} onClick={() => setTab("pushcarts")}>Pushcarts</CategoryChip>
          <CategoryChip active={tab === "hpvs"} onClick={() => setTab("hpvs")}>HPV&apos;s</CategoryChip>
        </div>
      </section>

      {/* Top 3 visual */}
      <section className="px-4 sm:px-6 py-6">
        <Top3Cards rankings={tabRankings.slice(0, 3)} />
      </section>

      {/* Tabla detallada */}
      <section className="px-4 sm:px-6 pb-8">
        <ScoresTable
          rankings={tabRankings}
          totalVel={totalHeats.velocity}
          totalVer={totalHeats.versatility}
          runsByTeam={runsByTeam}
        />
        <Legend />
      </section>

      {isFinished && (
        <section className="px-4 sm:px-6 pb-8">
          <div className="rounded-xl border border-yellow-700/50 bg-yellow-900/10 p-4 text-center">
            <p className="text-yellow-400 text-xs tracking-widest uppercase font-bold">Competencia Finalizada</p>
            <p className="text-zinc-300 text-sm mt-1">
              Estos son los puntajes finales oficiales.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function CategoryChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
        active ? "bg-yellow-400 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

interface EnrichedRow extends RankingRow {
  velPos: number | null;
  verPos: number | null;
  velPts: number;
  verPts: number;
  total: number;
  finalPos: number;
}

function Top3Cards({ rankings }: { rankings: EnrichedRow[] }) {
  if (rankings.length === 0) {
    return (
      <p className="text-zinc-600 text-center py-8 uppercase tracking-widest text-sm">
        Sin datos disponibles aún
      </p>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const colors = ["text-yellow-400", "text-zinc-300", "text-amber-600"];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {rankings.map((r, i) => (
        <div
          key={r.team_id}
          className="relative rounded-2xl border-2 overflow-hidden"
          style={{
            borderColor: r.color_hex,
            background: `linear-gradient(135deg, ${r.color_hex}33 0%, ${r.color_hex}0a 60%, #09090b 100%)`,
          }}
        >
          <div className="p-4 sm:p-5 flex flex-col items-center text-center gap-2">
            <span className="text-4xl sm:text-5xl">{medals[i]}</span>
            <p className={`text-xs uppercase tracking-widest font-bold ${colors[i]}`}>
              {i + 1}° lugar
            </p>
            <div className="min-w-0 w-full">
              <p className="text-white text-lg sm:text-xl font-bold truncate">{r.team_name}</p>
              <p className="text-zinc-400 text-xs truncate">{r.school}</p>
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-black text-yellow-400 tabular-nums mt-2">
              {r.total}
              <span className="text-zinc-600 text-base font-bold">/100</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoresTable({
  rankings, totalVel, totalVer, runsByTeam,
}: {
  rankings: EnrichedRow[];
  totalVel: number;
  totalVer: number;
  runsByTeam: Map<string, { velocity: number; versatility: number }>;
}) {
  if (rankings.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wider">
            <th className="text-center py-3 px-2 w-12">Pos</th>
            <th className="text-left py-3 px-3">Equipo</th>
            <th className="text-center py-3 px-2 hidden sm:table-cell">
              <div>Design</div>
              <div className="text-zinc-600 normal-case tracking-normal">/30</div>
            </th>
            <th className="text-center py-3 px-2 hidden sm:table-cell">
              <div>Pitch</div>
              <div className="text-zinc-600 normal-case tracking-normal">/20</div>
            </th>
            <th className="text-center py-3 px-2">
              <div>Velocidad</div>
              <div className="text-zinc-600 normal-case tracking-normal">tiempo · pos · pts</div>
            </th>
            <th className="text-center py-3 px-2">
              <div>Versatilidad</div>
              <div className="text-zinc-600 normal-case tracking-normal">tiempo · pos · pts</div>
            </th>
            <th className="text-right py-3 px-3 font-bold text-white">Total</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r) => {
            const counts = runsByTeam.get(r.team_id) ?? { velocity: 0, versatility: 0 };
            return (
              <tr key={r.team_id} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                <td className="text-center py-3 px-2">
                  <span className={`font-black text-base sm:text-lg ${
                    r.finalPos === 1 ? "text-yellow-400" :
                    r.finalPos === 2 ? "text-zinc-300" :
                    r.finalPos === 3 ? "text-amber-600" :
                    "text-zinc-600"
                  }`}>
                    {r.finalPos}°
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full shrink-0 border border-zinc-700" style={{ backgroundColor: r.color_hex }} />
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{r.team_name}</p>
                      <p className="text-zinc-500 text-[10px] sm:text-xs truncate">{r.school}</p>
                    </div>
                  </div>
                </td>
                <td className="text-center py-3 px-2 hidden sm:table-cell">
                  <span className="font-mono text-zinc-300 tabular-nums">{r.points_design_brief ?? 0}</span>
                </td>
                <td className="text-center py-3 px-2 hidden sm:table-cell">
                  <span className="font-mono text-zinc-300 tabular-nums">{r.points_pitch ?? 0}</span>
                </td>
                <td className="py-3 px-2">
                  <ScoreCell
                    timeMs={r.time_velocity_total}
                    position={r.velPos}
                    points={r.velPts}
                    runsCount={counts.velocity}
                    totalRuns={totalVel}
                  />
                </td>
                <td className="py-3 px-2">
                  <ScoreCell
                    timeMs={r.time_versatility_total}
                    position={r.verPos}
                    points={r.verPts}
                    runsCount={counts.versatility}
                    totalRuns={totalVer}
                  />
                </td>
                <td className="text-right py-3 px-3">
                  <div className="font-mono font-black text-xl text-white tabular-nums">{r.total}</div>
                  <div className="text-zinc-600 text-[10px]">/100</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCell({
  timeMs, position, points, runsCount, totalRuns,
}: {
  timeMs: number | null;
  position: number | null;
  points: number;
  runsCount: number;
  totalRuns: number;
}) {
  if (timeMs === null) {
    return (
      <div className="text-center">
        <p className="text-zinc-600 text-xs italic">Sin tiempo</p>
        {totalRuns > 0 && (
          <p className="text-zinc-700 text-[10px] mt-0.5">{runsCount}/{totalRuns} mangas</p>
        )}
      </div>
    );
  }

  const incomplete = totalRuns > 0 && runsCount < totalRuns;

  return (
    <div className="text-center space-y-0.5">
      <p className="font-mono text-xs sm:text-sm text-zinc-200 tabular-nums">{formatTimePrecise(timeMs)}</p>
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {position && (
          <Badge className={`text-[10px] py-0 h-4 ${
            position === 1 ? "bg-yellow-500 text-black" :
            position === 2 ? "bg-zinc-300 text-black" :
            position === 3 ? "bg-amber-700 text-white" :
            "bg-zinc-700 text-zinc-200"
          }`}>
            {position}°
          </Badge>
        )}
        <span className="font-bold text-yellow-400 text-xs tabular-nums">+{points}</span>
      </div>
      {incomplete && (
        <p className="text-orange-400 text-[10px] flex items-center justify-center gap-1">
          ⚠ {runsCount}/{totalRuns}
        </p>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:p-4 text-xs text-zinc-500 space-y-1">
      <p className="text-zinc-300 font-medium mb-1">Cómo se calcula el puntaje (handbook E5):</p>
      <p>• <span className="text-zinc-300">Design Brief</span> (30 pts) y <span className="text-zinc-300">Pitch</span> (20 pts) son cargados por el admin.</p>
      <p>• <span className="text-zinc-300">Velocidad y Versatilidad</span> (25 pts c/u) se asignan por posición dentro de la categoría:
        1° = 25 · 2° = 20 · 3° = 15 · 4° = 10 · 5° = 5 · 6° = 4 · 7° = 3.</p>
      <p>• El tiempo total suma todas las mangas + penalizaciones (+10s velocidad / +5s × falta versatilidad).</p>
      <p className="text-orange-400">• ⚠ indica que un equipo no completó todas sus mangas. Si aplica, el admin debe usar &quot;Asignar peor tiempo +10s&quot; en /admin/runs.</p>
    </div>
  );
}
