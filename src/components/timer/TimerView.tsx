"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatTimePrecise } from "@/lib/utils";
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
  status: string;
  test_type: string;
  heat_assignments: HeatAssignment[];
}

interface UserAssignment {
  test_type: TestType;
  lane: Lane | null;
}

interface Props {
  profile: UserProfile;
  assignment: UserAssignment | null;
  heats: Heat[];
  testType: TestType;
  lane: Lane | null;
}

const LS_KEY = "timer_backup";

export default function TimerView({ profile, assignment, heats, testType, lane }: Props) {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasPenalty, setHasPenalty] = useState(false);
  const [currentHeatAssignment, setCurrentHeatAssignment] = useState<HeatAssignment | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tStartRef = useRef<number>(0);
  const tEndRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Pick the first available heat assignment
  useEffect(() => {
    if (!currentHeatAssignment) {
      for (const heat of heats) {
        for (const ha of heat.heat_assignments) {
          const run = ha.runs?.[0];
          if (!run || run.status === "pending") {
            setCurrentHeatAssignment(ha);
            return;
          }
        }
      }
    }
  }, [heats, currentHeatAssignment]);

  function tick() {
    setElapsedMs(performance.now() - tStartRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleStart() {
    if (running || submitted) return;
    tStartRef.current = performance.now();
    setElapsedMs(0);
    setRunning(true);
    setHasPenalty(false);

    // LocalStorage backup
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ t_start: Date.now(), ha_id: currentHeatAssignment?.id })
    );

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
    if (running || !currentHeatAssignment) return;
    const ms = elapsedMs;

    setSubmitting(true);
    const supabase = createClient();

    // Check if run exists or create it
    const existingRun = currentHeatAssignment.runs?.[0];

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
        heat_assignment_id: currentHeatAssignment.id,
        time_ms: Math.round(ms),
        has_penalty_velocity: hasPenalty,
        status: "recorded",
        recorded_by: profile.id,
        recorded_at: new Date().toISOString(),
      }));
    }

    if (error) {
      toast.error(`Error al guardar: ${error.message}`);
      // Keep time in localStorage for retry
    } else {
      toast.success("Tiempo guardado ✓");
      localStorage.removeItem(LS_KEY);
      setSubmitted(true);
    }
    setSubmitting(false);
  }, [running, currentHeatAssignment, elapsedMs, hasPenalty, profile.id]);

  function handleNext() {
    setSubmitted(false);
    setElapsedMs(0);
    setHasPenalty(false);
    setCurrentHeatAssignment(null);
  }

  const totalWithPenalty = elapsedMs + (hasPenalty ? 10000 : 0);
  const currentHeat = heats.find((h) =>
    h.heat_assignments.some((ha) => ha.id === currentHeatAssignment?.id)
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-yellow-400 font-bold text-sm">E5 Race</span>
          {lane && (
            <Badge className="ml-2 bg-blue-700 text-white text-xs">{lane}</Badge>
          )}
          {testType === "versatility" && (
            <Badge className="ml-2 bg-green-700 text-white text-xs">Versatilidad</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 text-xs">{profile.full_name ?? profile.email}</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="text-zinc-400 text-xs">
              Salir
            </Button>
          </form>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {!currentHeatAssignment ? (
          <div className="text-center space-y-3">
            <p className="text-zinc-400 text-xl">Sin mangas asignadas</p>
            <p className="text-zinc-600 text-sm">
              Espera a que el admin active una manga o recarga la página.
            </p>
          </div>
        ) : (
          <>
            {/* Current heat info */}
            <div className="text-center">
              <p className="text-zinc-400 text-sm uppercase tracking-wider">
                Manga {currentHeat?.heat_number} — {testType === "velocity" ? "Velocidad" : "Versatilidad"}
                {lane && ` — ${lane}`}
              </p>
              {currentHeatAssignment.teams && (
                <div className="mt-2 flex items-center justify-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: currentHeatAssignment.teams.color_hex }}
                  />
                  <p className="text-2xl font-bold">{currentHeatAssignment.teams.name}</p>
                </div>
              )}
              <p className="text-zinc-400 text-sm mt-1">
                {currentHeatAssignment.teams?.school}
              </p>
            </div>

            {/* Timer display */}
            <div className="text-center">
              <div
                className={`font-mono text-7xl sm:text-8xl font-bold tabular-nums transition-colors ${
                  running
                    ? "text-green-400"
                    : submitted
                    ? "text-blue-400"
                    : elapsedMs > 0
                    ? "text-white"
                    : "text-zinc-600"
                }`}
              >
                {formatTimePrecise(running ? elapsedMs : totalWithPenalty)}
              </div>
              {hasPenalty && (
                <p className="text-red-400 font-bold text-lg mt-2">+10 SEG PENALIZACIÓN</p>
              )}
            </div>

            {/* Controls */}
            {!submitted ? (
              <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                {!running ? (
                  <Button
                    onClick={handleStart}
                    disabled={elapsedMs > 0}
                    className="w-full h-24 text-3xl font-bold bg-green-600 hover:bg-green-500 text-white rounded-2xl shadow-lg active:scale-95 transition-transform"
                  >
                    {elapsedMs > 0 ? "LISTO" : "START"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleStop}
                    className="w-full h-24 text-3xl font-bold bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-lg active:scale-95 transition-transform"
                  >
                    STOP
                  </Button>
                )}

                {testType === "velocity" && !running && (
                  <Button
                    onClick={() => setHasPenalty((p) => !p)}
                    className={`w-full h-16 text-xl font-bold rounded-2xl active:scale-95 transition-all ${
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
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full h-16 text-xl font-bold bg-yellow-400 text-black hover:bg-yellow-300 rounded-2xl active:scale-95 transition-transform"
                  >
                    {submitting ? "Enviando..." : "ENVIAR TIEMPO ✓"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-green-400 text-xl font-bold">✓ Tiempo registrado</p>
                <Button
                  onClick={handleNext}
                  className="bg-yellow-400 text-black hover:bg-yellow-300 font-bold px-8"
                >
                  Siguiente equipo →
                </Button>
              </div>
            )}

            {/* Upcoming queue */}
            <div className="w-full max-w-sm mt-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                Próximas mangas
              </p>
              {heats.flatMap((h) =>
                h.heat_assignments
                  .filter((ha) => {
                    const run = ha.runs?.[0];
                    return ha.id !== currentHeatAssignment.id && (!run || run.status === "pending");
                  })
                  .map((ha) => (
                    <div key={ha.id} className="flex items-center gap-2 py-1">
                      {ha.teams && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ha.teams.color_hex }}
                        />
                      )}
                      <span className="text-zinc-400 text-sm">
                        M{h.heat_number} — {ha.teams?.name}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
