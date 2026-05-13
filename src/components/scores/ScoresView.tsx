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
  results_published?: boolean;
  podium_reveal_step?: number;
}

interface Props {
  event: Event | null;
  initialRankings: RankingRow[];
  initialRuns: RunRow[];
  initialHeats: HeatRow[];
  eventId: string;
  initialPublished: boolean;
  initialPodiumStep: number;
}

type CategoryFilter = "pushcarts" | "hpvs";

// Tabla de puntos por posición (handbook)
const POSITION_POINTS: Record<number, number> = {
  1: 25, 2: 20, 3: 15, 4: 10, 5: 5, 6: 4, 7: 3,
};

export default function ScoresView({
  event: initialEvent,
  initialRankings,
  initialRuns,
  initialHeats,
  eventId,
  initialPublished,
  initialPodiumStep,
}: Props) {
  const [rankings, setRankings] = useState<RankingRow[]>(initialRankings);
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [heats, setHeats] = useState<HeatRow[]>(initialHeats);
  const [event, setEvent] = useState<Event | null>(initialEvent);
  const [published, setPublished] = useState(initialPublished);
  const [podiumStep, setPodiumStep] = useState(initialPodiumStep);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<CategoryFilter>("pushcarts");

  useEffect(() => {
    const supabase = createClient();

    async function refetchAll() {
      const [r, ru, h, e] = await Promise.all([
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
        supabase.from("events").select("*").eq("id", eventId).single(),
      ]);
      if (r.data) setRankings(r.data);
      if (ru.data) setRuns(ru.data as unknown as RunRow[]);
      if (h.data) setHeats(h.data);
      if (e.data) {
        setEvent(e.data);
        setPublished(e.data.results_published ?? false);
        setPodiumStep(e.data.podium_reveal_step ?? 0);
      }
    }

    const channel = supabase
      .channel("scores-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, refetchAll)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    const interval = setInterval(refetchAll, 3000);

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

  // Mapear el step global (0-8) al step de revelación de cada categoría (0-4)
  //   Pushcarts: steps 1-4 (3°, 2°, 1°, mejor tiempo)
  //   HPV's:     steps 5-8 (3°, 2°, 1°, mejor tiempo)
  const pushcartsRevealStep = Math.min(podiumStep, 4);
  const hpvsRevealStep = Math.max(0, podiumStep - 4);
  const currentRevealStep = tab === "pushcarts" ? pushcartsRevealStep : hpvsRevealStep;

  // Auto-cambiar de tab según el step del admin
  useEffect(() => {
    if (!published) return;
    if (podiumStep >= 1 && podiumStep <= 4) setTab("pushcarts");
    else if (podiumStep >= 5 && podiumStep <= 8) setTab("hpvs");
  }, [podiumStep, published]);

  // Mejor tiempo total (suma velocidad + versatilidad) por categoría
  const bestTimeRows = useMemo(() => {
    const candidates = rankings
      .filter((r) => r.category_slug === tab)
      .filter((r) => r.time_velocity_total !== null && r.time_versatility_total !== null)
      .map((r) => ({
        ...r,
        combinedMs: (r.time_velocity_total ?? 0) + (r.time_versatility_total ?? 0),
      }))
      .sort((a, b) => a.combinedMs - b.combinedMs);
    return candidates[0] ?? null;
  }, [rankings, tab]);

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

      {/* Mensaje de suspense cuando los resultados no están publicados */}
      {!published ? (
        <SuspenseScreen />
      ) : (
        <>
          <section className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-950 sticky top-[64px] sm:top-[72px] z-[9] backdrop-blur">
            <div className="flex gap-2 items-center">
              <CategoryChip active={tab === "pushcarts"} onClick={() => setTab("pushcarts")}>
                Pushcarts
                {pushcartsRevealStep > 0 && pushcartsRevealStep < 4 && (
                  <span className="ml-1.5 text-[10px] opacity-70">({pushcartsRevealStep}/4)</span>
                )}
              </CategoryChip>
              <CategoryChip
                active={tab === "hpvs"}
                onClick={() => setTab("hpvs")}
                disabled={hpvsRevealStep === 0 && podiumStep < 5}
              >
                HPV&apos;s
                {hpvsRevealStep > 0 && hpvsRevealStep < 4 && (
                  <span className="ml-1.5 text-[10px] opacity-70">({hpvsRevealStep}/4)</span>
                )}
                {podiumStep < 5 && <span className="ml-1.5 text-[10px] opacity-50">🔒</span>}
              </CategoryChip>
            </div>
          </section>

          {/* Podio con flip cards reveladas progresivamente (por categoría) */}
          <section className="px-4 sm:px-6 py-8">
            <FlipPodium
              rankings={tabRankings.slice(0, 3)}
              revealStep={currentRevealStep}
              categoryLabel={tab === "pushcarts" ? "Pushcarts" : "HPV's"}
            />
          </section>

          {/* Tarjeta de "mejor tiempo en pista" — se revela DESPUÉS del podio (step 4) */}
          {currentRevealStep >= 4 && bestTimeRows && (
            <section className="px-4 sm:px-6 pb-8">
              <BestTimeCard
                team={bestTimeRows}
                combinedMs={bestTimeRows.combinedMs}
                categoryLabel={tab === "pushcarts" ? "Pushcarts" : "HPV's"}
              />
            </section>
          )}

          {/* Tabla detallada visible cuando el podio de ESA categoría está revelado */}
          {currentRevealStep >= 3 && (
            <section className="px-4 sm:px-6 pb-8 animate-in fade-in duration-700">
              <ScoresTable
                rankings={tabRankings}
                totalVel={totalHeats.velocity}
                totalVer={totalHeats.versatility}
                runsByTeam={runsByTeam}
              />
              <Legend />
            </section>
          )}

          {isFinished && podiumStep >= 8 && (
            <section className="px-4 sm:px-6 pb-8">
              <div className="rounded-xl border border-yellow-700/50 bg-yellow-900/10 p-4 text-center">
                <p className="text-yellow-400 text-xs tracking-widest uppercase font-bold">Competencia Finalizada</p>
                <p className="text-zinc-300 text-sm mt-1">
                  Estos son los puntajes finales oficiales.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

// ── Tarjeta "Mejor tiempo en pista" ──────────────────────────────────────────

function BestTimeCard({
  team, combinedMs, categoryLabel,
}: {
  team: RankingRow;
  combinedMs: number;
  categoryLabel: string;
}) {
  return (
    <div className="max-w-2xl mx-auto animate-in zoom-in-95 fade-in duration-700">
      <div
        className="relative rounded-3xl border-2 overflow-hidden"
        style={{
          borderColor: team.color_hex,
          background: `linear-gradient(135deg, ${team.color_hex}55 0%, ${team.color_hex}11 50%, #09090b 100%)`,
        }}
      >
        {/* Brillo decorativo */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 20% 30%, ${team.color_hex}66 0%, transparent 50%)`,
          }}
        />

        <div className="relative p-6 sm:p-8 flex flex-col items-center text-center gap-3">
          {/* Etiqueta superior */}
          <div className="flex items-center gap-2">
            <span className="text-3xl sm:text-4xl animate-pulse">⚡</span>
            <p className="text-cyan-400 text-xs sm:text-sm uppercase tracking-[0.3em] font-black">
              Mejor tiempo en pista
            </p>
            <span className="text-3xl sm:text-4xl animate-pulse">⚡</span>
          </div>

          <p className="text-zinc-400 text-xs sm:text-sm uppercase tracking-widest">
            {categoryLabel}
          </p>

          {/* Identidad del equipo */}
          <div className="mt-2 flex items-center gap-4">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl shrink-0 shadow-lg"
              style={{ backgroundColor: team.color_hex, color: "#000" }}
            >
              {team.team_name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <p className="text-white text-2xl sm:text-3xl font-black leading-tight truncate">
                {team.team_name}
              </p>
              <p className="text-zinc-400 text-sm truncate">{team.school}</p>
            </div>
          </div>

          {/* Tiempo total */}
          <div className="mt-3">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">
              Tiempo total (velocidad + versatilidad)
            </p>
            <p className="font-mono text-5xl sm:text-6xl font-black tabular-nums text-cyan-400 leading-none">
              {formatTimePrecise(combinedMs)}
            </p>
          </div>

          {/* Desglose */}
          <div className="mt-2 flex gap-6 text-xs sm:text-sm">
            <div>
              <span className="text-zinc-500">Velocidad: </span>
              <span className="font-mono text-zinc-300 tabular-nums">
                {team.time_velocity_total !== null ? formatTimePrecise(team.time_velocity_total) : "—"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Versatilidad: </span>
              <span className="font-mono text-zinc-300 tabular-nums">
                {team.time_versatility_total !== null ? formatTimePrecise(team.time_versatility_total) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pantalla de suspense ─────────────────────────────────────────────────────

function SuspenseScreen() {
  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24 text-center">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-5xl sm:text-7xl animate-pulse">🏁</div>
        <p className="text-yellow-400 text-xs sm:text-sm uppercase tracking-widest font-bold">
          Resultados — Energy Race 2026
        </p>
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Pronto conocerás los resultados
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
          El administrador está finalizando la competencia.
          <br />
          Vuelve en unos minutos para ver el podio y los puntajes finales.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 text-zinc-500 text-xs">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span>Esperando publicación</span>
        </div>
      </div>
    </section>
  );
}

// ── Podio con flip cards ─────────────────────────────────────────────────────

function FlipPodium({ rankings, revealStep, categoryLabel }: { rankings: EnrichedRow[]; revealStep: number; categoryLabel: string }) {
  if (rankings.length === 0) {
    return (
      <p className="text-zinc-600 text-center py-8 uppercase tracking-widest text-sm">
        Sin datos disponibles aún
      </p>
    );
  }

  // Slots fijos: índice 0 = 1° (centro), 1 = 2° (izquierda), 2 = 3° (derecha)
  // En CSS visual, queremos que el 1° esté en el centro y más grande, pero
  // por simplicidad, los mostramos en orden y dejamos al CSS el layout.
  // Para móvil/desktop, una grilla 3 columnas con el 1° en medio.
  const second = rankings[1];
  const first = rankings[0];
  const third = rankings[2];

  // El revealStep controla cuántas tarjetas están reveladas:
  //   1 = el 3° revelado (1 tarjeta)
  //   2 = 2° y 3° revelados (2 tarjetas)
  //   3 = 1°, 2° y 3° revelados (todas)
  const revealedSet = new Set<number>();
  if (revealStep >= 1) revealedSet.add(3);
  if (revealStep >= 2) revealedSet.add(2);
  if (revealStep >= 3) revealedSet.add(1);

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-center text-yellow-400 text-xs sm:text-sm uppercase tracking-widest font-bold mb-1">
        Podio
      </p>
      <p className="text-center text-white text-2xl sm:text-3xl font-black mb-6 sm:mb-10">
        {categoryLabel}
      </p>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 items-end">
        {/* 2° puesto - izquierda */}
        <div className="flex flex-col items-center">
          <FlipCard
            position={2}
            row={second}
            revealed={revealedSet.has(2)}
            sizeClass="h-56 sm:h-72"
          />
        </div>
        {/* 1° puesto - centro (más alto) */}
        <div className="flex flex-col items-center">
          <FlipCard
            position={1}
            row={first}
            revealed={revealedSet.has(1)}
            sizeClass="h-64 sm:h-80"
          />
        </div>
        {/* 3° puesto - derecha */}
        <div className="flex flex-col items-center">
          <FlipCard
            position={3}
            row={third}
            revealed={revealedSet.has(3)}
            sizeClass="h-52 sm:h-64"
          />
        </div>
      </div>
    </div>
  );
}

function FlipCard({
  position,
  row,
  revealed,
  sizeClass,
}: {
  position: number;
  row: EnrichedRow | undefined;
  revealed: boolean;
  sizeClass: string;
}) {
  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const colors: Record<number, string> = {
    1: "border-yellow-400 text-yellow-400",
    2: "border-zinc-300 text-zinc-300",
    3: "border-amber-600 text-amber-600",
  };

  return (
    <div
      className={`w-full ${sizeClass} relative`}
      style={{ perspective: "1000px" }}
    >
      <div
        className="relative w-full h-full transition-transform duration-1000"
        style={{
          transformStyle: "preserve-3d",
          transform: revealed ? "rotateX(180deg)" : "rotateX(0deg)",
        }}
      >
        {/* Cara trasera (visible cuando NO revelado) */}
        <div
          className={`absolute inset-0 rounded-2xl border-2 ${colors[position]?.split(" ")[0]} bg-gradient-to-b from-zinc-900 via-black to-zinc-900 flex flex-col items-center justify-center p-4 gap-3`}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <span className="text-5xl sm:text-6xl opacity-30">?</span>
          <p className={`font-black text-2xl sm:text-3xl ${colors[position]?.split(" ").slice(1).join(" ")}`}>
            {position}° lugar
          </p>
          <p className="text-zinc-600 text-xs uppercase tracking-widest text-center">
            Esperando revelación
          </p>
        </div>

        {/* Cara frontal (visible cuando SÍ revelado) — ojo: rotateX(180deg) la pone "derecha" */}
        <div
          className={`absolute inset-0 rounded-2xl border-2 overflow-hidden flex flex-col items-center justify-center p-3 sm:p-4 gap-2`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
            borderColor: row?.color_hex ?? "#3f3f46",
            background: row?.color_hex
              ? `linear-gradient(180deg, ${row.color_hex}44 0%, ${row.color_hex}11 60%, #09090b 100%)`
              : "#09090b",
          }}
        >
          {row ? (
            <>
              <span className="text-4xl sm:text-5xl">{medals[position]}</span>
              <p className={`text-[10px] sm:text-xs uppercase tracking-widest font-bold ${colors[position]?.split(" ").slice(1).join(" ")}`}>
                {position}° lugar
              </p>
              <div className="text-center min-w-0 w-full px-2">
                <p className="text-white text-base sm:text-lg font-bold leading-tight truncate">
                  {row.team_name}
                </p>
                <p className="text-zinc-400 text-[10px] sm:text-xs truncate">{row.school}</p>
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-black text-yellow-400 tabular-nums mt-1">
                {row.total}
                <span className="text-zinc-600 text-sm font-bold">/100</span>
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-xs italic">Sin datos</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  active, onClick, children, disabled = false,
}: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
        active ? "bg-yellow-400 text-black" :
        disabled ? "bg-zinc-900 text-zinc-600 cursor-not-allowed opacity-60" :
        "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
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
