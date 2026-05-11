"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatTime, formatTimePrecise } from "@/lib/utils";
import type { UserProfile, TestType, Lane } from "@/types/database";

interface Team {
  id: string;
  name: string;
  school: string;
  color_hex: string;
  shield_url: string | null;
}

interface Run {
  id: string;
  status: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
}

interface HeatAssignment {
  id: string;
  lane: string | null;
  timer_user_id: string | null;
  teams: Team | null;
  runs: Run[];
}

interface Heat {
  id: string;
  heat_number: number;
  status: string;
  test_type: string;
  heat_assignments: HeatAssignment[];
}

interface UserAssignment {
  test_type: TestType;
}

interface Props {
  profile: UserProfile;
  assignment: UserAssignment | null;
  heats: Heat[];
}

const EVENT_ID = "00000000-0000-0000-0000-000000000001";
const LS_KEY = "timer_backup";
// Solo 'recorded' es realmente "completado". 'failed' significa que el admin
// invalidó el tiempo y el cronometrista debe enviar uno nuevo (no es terminal).
const COMPLETED_RUN_STATUSES = ["recorded"];

export default function TimerView({ profile, assignment, heats: initialHeats }: Props) {
  const [heats, setHeats] = useState<Heat[]>(initialHeats);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasPenalty, setHasPenalty] = useState(false);
  const [activeHaId, setActiveHaId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const tStartRef = useRef<number>(0);
  const tEndRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // ── Estados derivados (claros y deterministas) ─────────────────────────────
  // Solo nos importan heats que tengan al menos una asignación para nuestro carril.
  const myHeats = useMemo(
    () => heats.filter((h) => h.heat_assignments.length > 0),
    [heats]
  );

  // Por cada heat asignado, obtenemos el "estado de mi run":
  //   pending     → no hay run, o run con status=pending/failed (admin pidió repetir)
  //   completed   → run con status=recorded
  function runState(ha: HeatAssignment): "pending" | "completed" {
    // Buscar el run más reciente (puede haber varios si el admin repitió)
    const recordedRun = ha.runs?.find((r) => COMPLETED_RUN_STATUSES.includes(r.status));
    if (recordedRun) return "completed";
    return "pending";
  }

  // Manga activa = heat con status='active' donde mi run sigue pendiente.
  const activeHeat = useMemo(() => {
    return myHeats.find(
      (h) => h.status === "active" && h.heat_assignments.some((ha) => runState(ha) === "pending")
    ) ?? null;
  }, [myHeats]);

  // Heat assignment activa (la mía dentro del heat activo)
  const activeAssignment = useMemo<HeatAssignment | null>(() => {
    if (!activeHeat) return null;
    return activeHeat.heat_assignments.find((ha) => runState(ha) === "pending") ?? null;
  }, [activeHeat]);

  // Próximas mangas pendientes (mi asignación sin run completado, heat no finalizado)
  const upcomingHeats = useMemo(() => {
    return myHeats
      .filter((h) => h.id !== activeHeat?.id && h.status !== "finished")
      .filter((h) => h.heat_assignments.some((ha) => runState(ha) === "pending"))
      .sort((a, b) => a.heat_number - b.heat_number);
  }, [myHeats, activeHeat]);

  // Mangas ya completadas (mi run guardado)
  const completedCount = useMemo(() => {
    return myHeats.filter((h) =>
      h.heat_assignments.some((ha) => runState(ha) === "completed")
    ).length;
  }, [myHeats]);

  // Sincronizar `activeHaId` con la asignación activa actual (cuando NO estoy mostrando un submitted)
  useEffect(() => {
    if (submitted) return;
    if (activeAssignment && activeAssignment.id !== activeHaId) {
      setActiveHaId(activeAssignment.id);
      setElapsedMs(0);
      setHasPenalty(false);
    } else if (!activeAssignment && activeHaId) {
      setActiveHaId(null);
    }
  }, [activeAssignment, activeHaId, submitted]);

  // Si estoy en submitted=true pero el admin invalidó mi run (resetLaneRun),
  // volver al estado de runner activo para que pueda enviar de nuevo.
  useEffect(() => {
    if (!submitted || !activeHaId) return;
    const allAssignments = heats.flatMap((h) => h.heat_assignments);
    const myAssignment = allAssignments.find((a) => a.id === activeHaId);
    if (myAssignment && runState(myAssignment) === "pending") {
      // El admin marcó el run como failed → permitir reenvío
      setSubmitted(false);
      setElapsedMs(0);
      setHasPenalty(false);
      toast.info("El admin solicitó repetir esta manga. Listo para nuevo tiempo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heats, submitted, activeHaId]);

  // ── Realtime: actualizar `heats` cuando cambien runs o heats ───────────────
  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("heats")
      .select(`*, heat_assignments(*, teams(id, name, school, color_hex, shield_url), runs(*))`)
      .eq("event_id", EVENT_ID)
      .order("heat_number");
    if (data) {
      // Filtrar por timer_user_id = mi user_id (la nueva fuente de verdad,
      // independiente del test_type asignado al usuario)
      const filtered = data.map((h) => ({
        ...h,
        heat_assignments: h.heat_assignments.filter(
          (ha: HeatAssignment) => ha.timer_user_id === profile.id
        ),
      }));
      setHeats(filtered);
    }
  }, [profile.id]);

  useEffect(() => { setHeats(initialHeats); }, [initialHeats]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("timer-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetch)
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  // ── Cronómetro ─────────────────────────────────────────────────────────────
  function tick() {
    setElapsedMs(performance.now() - tStartRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleStart() {
    if (running || submitted || !activeAssignment) return;
    tStartRef.current = performance.now();
    setElapsedMs(0);
    setRunning(true);
    setHasPenalty(false);
    localStorage.setItem(LS_KEY, JSON.stringify({ t_start: Date.now(), ha_id: activeAssignment.id }));
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    if (!running) return;
    tEndRef.current = performance.now();
    const ms = tEndRef.current - tStartRef.current;
    cancelAnimationFrame(rafRef.current);
    setElapsedMs(ms);
    setRunning(false);
  }

  const handleSubmit = useCallback(async () => {
    if (running || !activeAssignment) return;
    const ms = elapsedMs;
    setSubmitting(true);
    const supabase = createClient();
    const existingRun = activeAssignment.runs?.[0];

    let error;
    if (existingRun) {
      ({ error } = await supabase
        .from("runs")
        .update({
          time_ms: Math.round(ms),
          has_penalty_velocity: hasPenalty,
          status: "recorded",
          recorded_by: profile.id,
          recorded_at: new Date().toISOString(),
        })
        .eq("id", existingRun.id));
    } else {
      ({ error } = await supabase.from("runs").insert({
        heat_assignment_id: activeAssignment.id,
        time_ms: Math.round(ms),
        has_penalty_velocity: hasPenalty,
        status: "recorded",
        recorded_by: profile.id,
        recorded_at: new Date().toISOString(),
      }));
    }

    if (error) {
      toast.error(`Error al guardar: ${error.message}`);
    } else {
      toast.success("Tiempo guardado ✓");
      localStorage.removeItem(LS_KEY);
      setSubmitted(true);
      setConfirmOpen(false);
      // Realtime refrescará `heats`, ese run aparecerá como completado y
      // la próxima vez que pase a la siguiente, el picker no lo seleccionará.
    }
    setSubmitting(false);
  }, [running, activeAssignment, elapsedMs, hasPenalty, profile.id]);

  function handleNext() {
    setSubmitted(false);
    setElapsedMs(0);
    setHasPenalty(false);
    setActiveHaId(null); // el effect de sincronización elegirá la siguiente
  }

  const totalWithPenalty = elapsedMs + (hasPenalty ? 10000 : 0);

  // El "lane" visible es el del heat activo si existe, si no, del próximo
  const currentLane = (activeAssignment?.lane ?? null) as Lane | null;

  // El test_type es el del heat activo (o el primer heat asignado, o el del user)
  const currentTestType: TestType =
    (activeHeat?.test_type as TestType | undefined) ??
    (myHeats[0]?.test_type as TestType | undefined) ??
    (assignment?.test_type as TestType | undefined) ??
    "velocity";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col overflow-x-hidden">
      <header className="bg-zinc-900 border-b border-zinc-700 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sticky top-0 z-10">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Image
            src="/e5-logo.jpg"
            alt="E5 Energy Race 2026"
            width={120}
            height={40}
            className="h-6 sm:h-7 w-auto object-contain shrink-0"
            priority
          />
          {currentLane && <Badge className="bg-blue-700 text-white text-xs shrink-0">{currentLane}</Badge>}
          {currentTestType === "versatility" && (
            <Badge className="bg-green-700 text-white text-xs shrink-0">Versatilidad</Badge>
          )}
          <div className="hidden sm:flex items-center gap-1 ml-2 text-xs text-zinc-500">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
            <span>{connected ? "En vivo" : "Conectando…"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 shrink-0">
          <span className="text-zinc-400 text-xs hidden sm:inline truncate max-w-[120px]">
            {profile.full_name ?? profile.email}
          </span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="text-zinc-400 text-xs h-8 px-2">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-3 sm:px-6 py-4 sm:py-6 gap-4 sm:gap-6">
        {!assignment ? (
          <EmptyState
            title="Sin asignación al evento"
            message="Tu usuario no tiene asignada una prueba en este evento. Pídele al admin que te agregue en la sección Operadores."
          />
        ) : myHeats.length === 0 ? (
          <EmptyState
            title="Sin mangas asignadas"
            message="El admin todavía no te ha asignado como cronometrista en ninguna manga. Aparecerás aquí cuando te asignen en el fixture."
          />
        ) : !activeAssignment && upcomingHeats.length === 0 ? (
          <EmptyState
            title="Mangas completadas"
            message={`Has cronometrado todas tus ${completedCount} manga(s). ¡Buen trabajo!`}
            tone="success"
          />
        ) : !activeAssignment ? (
          <WaitingState upcomingHeats={upcomingHeats} />
        ) : (
          <ActiveRunner
            assignment={activeAssignment}
            heat={activeHeat!}
            testType={(activeHeat!.test_type as TestType) ?? currentTestType}
            lane={currentLane}
            running={running}
            submitted={submitted}
            submitting={submitting}
            elapsedMs={elapsedMs}
            hasPenalty={hasPenalty}
            totalWithPenalty={totalWithPenalty}
            onStart={handleStart}
            onStop={handleStop}
            onTogglePenalty={() => setHasPenalty((p) => !p)}
            onOpenConfirm={() => setConfirmOpen(true)}
            onNext={handleNext}
            upcomingHeats={upcomingHeats}
            completedCount={completedCount}
            totalCount={myHeats.length}
          />
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-lg sm:text-xl">Confirmar tiempo</DialogTitle>
            <DialogDescription className="text-center text-zinc-400 text-sm">
              {activeAssignment?.teams?.name}
              {activeHeat && ` — M${activeHeat.heat_number}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 sm:py-4 text-center space-y-2 sm:space-y-3">
            <p className="text-zinc-400 text-sm">¿El tiempo registrado es correcto?</p>
            <div className="font-mono text-4xl sm:text-5xl font-bold tabular-nums text-yellow-400 leading-none">
              {formatTimePrecise(totalWithPenalty)}
            </div>
            {hasPenalty && (
              <p className="text-red-400 text-xs sm:text-sm font-bold">incluye +10s de penalización</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1 sm:pt-2">
            <Button
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              variant="outline"
              className="h-12 sm:h-14 text-base sm:text-lg font-bold border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              NO
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="h-12 sm:h-14 text-base sm:text-lg font-bold bg-green-600 hover:bg-green-500 text-white"
            >
              {submitting ? "Enviando..." : "SÍ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function EmptyState({
  title,
  message,
  tone = "neutral",
}: {
  title: string;
  message: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="text-center space-y-3 mt-8 sm:mt-12 max-w-sm">
      <p className={`text-xl font-bold ${tone === "success" ? "text-green-400" : "text-zinc-300"}`}>
        {title}
      </p>
      <p className="text-zinc-500 text-sm leading-relaxed">{message}</p>
    </div>
  );
}

function WaitingState({
  upcomingHeats,
}: {
  upcomingHeats: Heat[];
}) {
  const next = upcomingHeats[0];
  const nextTeam = next?.heat_assignments[0]?.teams;

  return (
    <div className="text-center space-y-4 sm:space-y-6 mt-6 sm:mt-12 max-w-sm w-full">
      <div>
        <p className="text-yellow-400 text-sm uppercase tracking-wider font-medium animate-pulse">
          Esperando admin
        </p>
        <p className="text-zinc-300 text-base sm:text-lg mt-2">
          Ninguna de tus mangas está activa todavía.
        </p>
      </div>

      {next && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-2">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Tu próxima manga</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-yellow-400 text-3xl font-bold">M{next.heat_number}</p>
            {next.heat_assignments[0]?.lane && (
              <Badge className="bg-blue-700 text-white text-xs">{next.heat_assignments[0].lane}</Badge>
            )}
          </div>
          {nextTeam && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: nextTeam.color_hex }} />
              <p className="text-white font-medium truncate">{nextTeam.name}</p>
            </div>
          )}
          {nextTeam?.school && <p className="text-zinc-500 text-xs truncate">{nextTeam.school}</p>}
        </div>
      )}

      {upcomingHeats.length > 1 && (
        <div className="text-left bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 space-y-1">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Cola completa</p>
          {upcomingHeats.map((h) => {
            const t = h.heat_assignments[0]?.teams;
            return (
              <div key={h.id} className="flex items-center gap-2 py-1">
                {t && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color_hex }} />}
                <span className="text-zinc-400 text-sm truncate">
                  M{h.heat_number} — {t?.name ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActiveRunner({
  assignment,
  heat,
  testType,
  lane,
  running,
  submitted,
  submitting,
  elapsedMs,
  hasPenalty,
  totalWithPenalty,
  onStart,
  onStop,
  onTogglePenalty,
  onOpenConfirm,
  onNext,
  upcomingHeats,
  completedCount,
  totalCount,
}: {
  assignment: HeatAssignment;
  heat: Heat;
  testType: TestType;
  lane: Lane | null;
  running: boolean;
  submitted: boolean;
  submitting: boolean;
  elapsedMs: number;
  hasPenalty: boolean;
  totalWithPenalty: number;
  onStart: () => void;
  onStop: () => void;
  onTogglePenalty: () => void;
  onOpenConfirm: () => void;
  onNext: () => void;
  upcomingHeats: Heat[];
  completedCount: number;
  totalCount: number;
}) {
  return (
    <>
      <div className="text-center w-full max-w-sm">
        <p className="text-zinc-400 text-xs sm:text-sm uppercase tracking-wider">
          Manga {heat.heat_number} — {testType === "velocity" ? "Velocidad" : "Versatilidad"}
          {lane && ` — ${lane}`}
        </p>
        {assignment.teams && (
          <div className="mt-2 flex items-center justify-center gap-2 sm:gap-3">
            <div
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-full shrink-0"
              style={{ backgroundColor: assignment.teams.color_hex }}
            />
            <p className="text-xl sm:text-2xl font-bold truncate">{assignment.teams.name}</p>
          </div>
        )}
        <p className="text-zinc-400 text-xs sm:text-sm mt-1 truncate">{assignment.teams?.school}</p>
        <p className="text-zinc-600 text-xs mt-2">
          {completedCount} de {totalCount} mangas cronometradas
        </p>
      </div>

      <div className="text-center w-full">
        <div
          className={`font-mono text-6xl sm:text-7xl md:text-8xl font-bold tabular-nums transition-colors leading-none ${
            running ? "text-green-400" : submitted ? "text-blue-400" : elapsedMs > 0 ? "text-white" : "text-zinc-600"
          }`}
        >
          {formatTimePrecise(running ? elapsedMs : totalWithPenalty)}
        </div>
        {hasPenalty && (
          <p className="text-red-400 font-bold text-base sm:text-lg mt-2">+10 SEG PENALIZACIÓN</p>
        )}
      </div>

      {!submitted ? (
        <div className="flex flex-col items-center gap-3 sm:gap-4 w-full max-w-sm">
          {!running ? (
            <Button
              onClick={onStart}
              disabled={elapsedMs > 0}
              className="w-full h-20 sm:h-24 text-2xl sm:text-3xl font-bold bg-green-600 hover:bg-green-500 text-white rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              {elapsedMs > 0 ? "LISTO" : "START"}
            </Button>
          ) : (
            <Button
              onClick={onStop}
              className="w-full h-20 sm:h-24 text-2xl sm:text-3xl font-bold bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              STOP
            </Button>
          )}

          {testType === "velocity" && !running && (
            <Button
              onClick={onTogglePenalty}
              className={`w-full h-14 sm:h-16 text-base sm:text-xl font-bold rounded-2xl active:scale-95 transition-all ${
                hasPenalty
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border-2 border-zinc-500"
              }`}
            >
              {hasPenalty ? "✓ +10s ACTIVADO" : "+10s PENALIZACIÓN"}
            </Button>
          )}

          {elapsedMs > 0 && !running && (
            <Button
              onClick={onOpenConfirm}
              disabled={submitting}
              className="w-full h-14 sm:h-16 text-base sm:text-xl font-bold bg-yellow-400 text-black hover:bg-yellow-300 rounded-2xl active:scale-95 transition-transform"
            >
              ENVIAR TIEMPO ✓
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center space-y-4 w-full max-w-sm">
          <p className="text-green-400 text-lg sm:text-xl font-bold">✓ Tiempo registrado</p>
          <Button
            onClick={onNext}
            className="w-full h-14 text-lg sm:text-xl bg-yellow-400 text-black hover:bg-yellow-300 font-bold rounded-2xl active:scale-95 transition-transform"
          >
            {upcomingHeats.length > 0 ? "Siguiente equipo →" : "Listo →"}
          </Button>
        </div>
      )}

      {upcomingHeats.length > 0 && (
        <div className="w-full max-w-sm mt-2 sm:mt-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
            Próximas mangas ({upcomingHeats.length})
          </p>
          {upcomingHeats.map((h) => {
            const t = h.heat_assignments[0]?.teams;
            return (
              <div key={h.id} className="flex items-center gap-2 py-1">
                {t && <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color_hex }} />}
                <span className="text-zinc-400 text-sm truncate">
                  M{h.heat_number} — {t?.name ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
