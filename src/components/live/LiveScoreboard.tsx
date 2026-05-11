"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatTimePrecise } from "@/lib/utils";
import type { RankingRow } from "@/types/database";

interface Run {
  id: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
  status: string;
}

interface Category {
  slug: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
  school: string;
  color_hex: string;
  shield_url: string | null;
  categories: Category | null;
}

interface HeatAssignment {
  id: string;
  lane: string | null;
  team_id: string;
  teams: Team | null;
  runs: Run[];
}

interface Heat {
  id: string;
  heat_number: number;
  test_type: string;
  status: string;
  started_at: string | null;
  heat_assignments: HeatAssignment[];
}

interface Event {
  id: string;
  name: string;
  status: string;
}

interface Props {
  event: Event | null;
  initialHeats: Heat[];
  initialPodium: RankingRow[];
  eventId: string;
}

const LANE_ORDER: Record<string, number> = { C2: 0, C4: 1, C6: 2 };

type TestFilter = "all" | "velocity" | "versatility";
type CategoryFilter = "all" | "pushcarts" | "hpvs";

const STATUS_LABEL: Record<string, { label: string; color: string; pulse?: boolean }> = {
  pending:      { label: "Pendiente",   color: "bg-zinc-700 text-zinc-300" },
  active:       { label: "EN CURSO",    color: "bg-red-600 text-white", pulse: true },
  finished:     { label: "Finalizada",  color: "bg-green-700 text-white" },
  failed:       { label: "Fallida",     color: "bg-zinc-800 text-zinc-500" },
  reprogrammed: { label: "Reprogramada", color: "bg-blue-700 text-white" },
};

export default function LiveScoreboard({
  event,
  initialHeats,
  initialPodium,
  eventId,
}: Props) {
  const [heats, setHeats] = useState<Heat[]>(initialHeats);
  const [podium, setPodium] = useState<RankingRow[]>(initialPodium);
  const [connected, setConnected] = useState(false);
  const [testFilter, setTestFilter] = useState<TestFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  useEffect(() => {
    const supabase = createClient();

    async function refetchAll() {
      const [{ data: hData }, { data: pData }] = await Promise.all([
        supabase
          .from("heats")
          .select(`
            id, heat_number, test_type, status, started_at,
            heat_assignments(
              id, lane, team_id,
              teams(id, name, school, color_hex, shield_url, categories(slug, name)),
              runs(id, time_ms, has_penalty_velocity, status)
            )
          `)
          .eq("event_id", eventId)
          .order("test_type")
          .order("heat_number"),
        supabase
          .from("v_rankings")
          .select("*")
          .eq("event_id", eventId)
          .order("category_slug")
          .order("final_position", { ascending: true, nullsFirst: false }),
      ]);
      if (hData) setHeats(hData as unknown as Heat[]);
      if (pData) setPodium(pData);
    }

    const channel = supabase
      .channel("live-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetchAll)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    // Polling agresivo cada 2s para que cualquier borrado o cambio
    // se propague rápidamente incluso si Realtime falla.
    const interval = setInterval(refetchAll, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [eventId]);

  const isFinished = event?.status === "finished";

  // Filtros: por test_type y por categoría (deducida del primer equipo del heat)
  const filteredHeats = useMemo(() => {
    // Orden de aparición: activas primero, luego pendientes (lo más reciente
    // arriba), después finalizadas y al final las falladas
    const STATUS_ORDER: Record<string, number> = {
      active: 0,
      pending: 1,
      reprogrammed: 2,
      finished: 3,
      failed: 4,
    };

    return heats
      .filter((h) => testFilter === "all" || h.test_type === testFilter)
      .filter((h) => {
        if (categoryFilter === "all") return true;
        const firstTeam = h.heat_assignments[0]?.teams;
        return firstTeam?.categories?.slug === categoryFilter;
      })
      .map((h) => ({
        ...h,
        heat_assignments: [...h.heat_assignments].sort((a, b) => {
          const oa = LANE_ORDER[a.lane ?? ""] ?? 99;
          const ob = LANE_ORDER[b.lane ?? ""] ?? 99;
          return oa - ob;
        }),
      }))
      .sort((a, b) => {
        // 1) Por estado
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        // 2) Dentro del mismo estado:
        //    - 'finished' y 'failed' (ya corrieron): orden inverso (más reciente primero)
        //    - resto (active/pending): orden natural (próxima a correr primero)
        if (a.status === "finished" || a.status === "failed") {
          return b.heat_number - a.heat_number;
        }
        return a.heat_number - b.heat_number;
      });
  }, [heats, testFilter, categoryFilter]);

  const pushcartsPodium = podium.filter((r) => r.category_slug === "pushcarts").slice(0, 3);
  const hpvsPodium = podium.filter((r) => r.category_slug === "hpvs").slice(0, 3);

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-yellow-400 text-[10px] sm:text-xs font-medium tracking-widest uppercase">
            CIEDI — E5 Challenge
          </p>
          <h1 className="text-xl sm:text-2xl font-bold">{event?.name ?? "Energy Race 2026"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className="text-zinc-400 text-xs sm:text-sm">
            {connected ? "EN VIVO" : "Conectando..."}
          </span>
        </div>
      </header>

      {/* Podio cuando la competencia termina */}
      {isFinished && (pushcartsPodium.length > 0 || hpvsPodium.length > 0) && (
        <PodiumDisplay pushcarts={pushcartsPodium} hpvs={hpvsPodium} />
      )}

      {/* Filtros */}
      <section className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-950 sticky top-[64px] sm:top-[72px] z-[9] backdrop-blur">
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <FilterGroup label="Prueba">
            <FilterChip active={testFilter === "all"} onClick={() => setTestFilter("all")}>Todas</FilterChip>
            <FilterChip active={testFilter === "velocity"} onClick={() => setTestFilter("velocity")}>Velocidad</FilterChip>
            <FilterChip active={testFilter === "versatility"} onClick={() => setTestFilter("versatility")}>Versatilidad</FilterChip>
          </FilterGroup>
          <FilterGroup label="Categoría">
            <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>Todas</FilterChip>
            <FilterChip active={categoryFilter === "pushcarts"} onClick={() => setCategoryFilter("pushcarts")}>Pushcarts</FilterChip>
            <FilterChip active={categoryFilter === "hpvs"} onClick={() => setCategoryFilter("hpvs")}>HPV&apos;s</FilterChip>
          </FilterGroup>
        </div>
      </section>

      {/* Lista de mangas */}
      <section className="px-4 sm:px-6 py-6">
        {filteredHeats.length === 0 ? (
          <p className="text-zinc-500 text-center py-12 uppercase tracking-widest text-sm">
            No hay mangas con estos filtros
          </p>
        ) : (
          <div className="space-y-6">
            {filteredHeats.map((heat) => (
              <HeatBoard key={heat.id} heat={heat} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// ── Filtros ──────────────────────────────────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{label}:</span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all ${
        active
          ? "bg-yellow-400 text-black"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

// ── Tablero por manga ─────────────────────────────────────────────────────────

function HeatBoard({ heat }: { heat: Heat }) {
  const isActive = heat.status === "active";
  const isFinished = heat.status === "finished";
  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
  const testLabel = heat.test_type === "velocity" ? "Velocidad" : "Versatilidad";

  // Calcular posiciones dentro de la manga (1°, 2°, 3°) para equipos terminados
  const finishedSorted = heat.heat_assignments
    .map((ha) => {
      const run = ha.runs?.[0];
      const total = run?.status === "recorded" && run.time_ms != null
        ? run.time_ms + (run.has_penalty_velocity ? 10000 : 0)
        : null;
      return { haId: ha.id, totalMs: total };
    })
    .filter((r) => r.totalMs !== null)
    .sort((a, b) => (a.totalMs ?? 0) - (b.totalMs ?? 0));

  const positionMap = new Map<string, number>();
  finishedSorted.forEach((r, i) => positionMap.set(r.haId, i + 1));

  return (
    <div className={`rounded-2xl border ${isActive ? "border-red-600/50 shadow-[0_0_40px_-12px_rgba(220,38,38,0.5)]" : "border-zinc-800"} bg-zinc-950 overflow-hidden`}>
      {/* Header de manga */}
      <div className={`flex items-center justify-between px-4 sm:px-5 py-3 border-b ${isActive ? "border-red-600/30 bg-red-600/5" : "border-zinc-800 bg-zinc-900/50"}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl font-black text-yellow-400">M{heat.heat_number}</span>
          <p className="text-zinc-300 text-sm font-medium uppercase tracking-wider">{testLabel}</p>
        </div>
        <Badge className={`${s.color} ${s.pulse ? "animate-pulse" : ""} text-xs font-bold tracking-wider`}>
          {s.label}
        </Badge>
      </div>

      {/* Carriles / equipos */}
      <div className={`grid gap-2 sm:gap-3 p-3 sm:p-4 ${
        heat.heat_assignments.length === 1 ? "grid-cols-1" :
        heat.heat_assignments.length === 2 ? "grid-cols-1 md:grid-cols-2" :
        "grid-cols-1 md:grid-cols-3"
      }`}>
        {heat.heat_assignments.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-6">Sin equipos asignados</p>
        ) : (
          heat.heat_assignments.map((ha) => (
            <LaneCard
              key={ha.id}
              ha={ha}
              isActive={isActive}
              isFinished={isFinished}
              position={positionMap.get(ha.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LaneCard({
  ha,
  isActive,
  isFinished,
  position,
}: {
  ha: HeatAssignment;
  isActive: boolean;
  isFinished: boolean;
  position: number | undefined;
}) {
  const run = ha.runs?.[0];
  const isRecorded = run?.status === "recorded";
  const totalMs = isRecorded && run.time_ms != null
    ? run.time_ms + (run.has_penalty_velocity ? 10000 : 0)
    : null;

  const teamColor = ha.teams?.color_hex ?? "#3f3f46";

  return (
    <div
      className="relative rounded-xl overflow-hidden border-2"
      style={{
        borderColor: teamColor,
        background: `linear-gradient(135deg, ${teamColor}33 0%, ${teamColor}0a 60%, #09090b 100%)`,
      }}
    >
      {/* Posición */}
      {position && (
        <div
          className={`absolute top-0 left-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center font-black text-xl sm:text-2xl ${
            position === 1 ? "text-black bg-yellow-400" :
            position === 2 ? "text-black bg-zinc-300" :
            position === 3 ? "text-white bg-amber-700" :
            "text-zinc-300 bg-zinc-700"
          }`}
          style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)" }}
        >
          <span className="pr-1.5">{position}</span>
        </div>
      )}

      {/* Carril */}
      {ha.lane && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-black/60 backdrop-blur text-white border border-white/20 text-[10px] sm:text-xs font-mono">
            {ha.lane}
          </Badge>
        </div>
      )}

      <div className="p-3 sm:p-4 pt-10 sm:pt-12 flex flex-col gap-2 min-h-[140px] sm:min-h-[160px]">
        <div className="flex items-center gap-2 sm:gap-3">
          {ha.teams?.shield_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ha.teams.shield_url}
              alt={ha.teams.name}
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-lg bg-black/30 p-1"
            />
          ) : (
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-xl shrink-0"
              style={{ backgroundColor: teamColor, color: "#000" }}
            >
              {ha.teams?.name.charAt(0).toUpperCase() ?? "—"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white text-base sm:text-lg font-bold leading-tight truncate">
              {ha.teams?.name ?? "Sin equipo"}
            </p>
            <p className="text-zinc-400 text-[11px] sm:text-xs truncate">
              {ha.teams?.school ?? ""}
            </p>
          </div>
        </div>

        {/* Tiempo */}
        <div className="mt-auto">
          {totalMs !== null ? (
            <div className="flex items-end gap-2">
              <span className="font-mono text-2xl sm:text-3xl font-black tabular-nums text-yellow-400 leading-none">
                {formatTimePrecise(totalMs)}
              </span>
              {run?.has_penalty_velocity && (
                <Badge className="bg-red-600 text-white text-[10px] font-bold mb-1">+10s</Badge>
              )}
            </div>
          ) : isActive ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-base sm:text-lg font-black uppercase tracking-widest animate-pulse">
                En curso
              </span>
            </div>
          ) : isFinished ? (
            <span className="text-zinc-600 text-sm italic">Sin tiempo registrado</span>
          ) : (
            <span className="text-zinc-600 text-xs uppercase tracking-wider">Aún no inicia</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Podio final ───────────────────────────────────────────────────────────────

function PodiumDisplay({ pushcarts, hpvs }: { pushcarts: RankingRow[]; hpvs: RankingRow[] }) {
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
