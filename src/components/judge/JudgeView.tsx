"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { UserProfile } from "@/types/database";

interface Team {
  id: string;
  name: string;
  school: string;
  color_hex: string;
}

interface Run {
  id: string;
  status: string;
  time_ms: number | null;
  penalty_versatility_count_out: number;
  penalty_versatility_count_crash: number;
  penalty_versatility_count_cut: number;
}

interface HeatAssignment {
  id: string;
  teams: Team | null;
  runs: Run[];
}

interface Heat {
  id: string;
  heat_number: number;
  status: string;
  heat_assignments: HeatAssignment[];
}

interface Penalties {
  out: number;    // Salió de pista
  crash: number;  // Chocó con obstáculo
  cut: number;    // Cortó trayectoria
}

export default function JudgeView({ profile, heats }: { profile: UserProfile; heats: Heat[] }) {
  const [currentHA, setCurrentHA] = useState<HeatAssignment | null>(null);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [penalties, setPenalties] = useState<Penalties>({ out: 0, crash: 0, cut: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentHA) {
      for (const heat of heats) {
        for (const ha of heat.heat_assignments) {
          const run = ha.runs?.[0];
          if (!run || run.status === "pending") {
            setCurrentHA(ha);
            setCurrentRun(run ?? null);
            setPenalties({
              out: run?.penalty_versatility_count_out ?? 0,
              crash: run?.penalty_versatility_count_crash ?? 0,
              cut: run?.penalty_versatility_count_cut ?? 0,
            });
            return;
          }
        }
      }
    }
  }, [heats, currentHA]);

  const totalPenalties = penalties.out + penalties.crash + penalties.cut;
  const totalPenaltySeconds = totalPenalties * 5;

  async function increment(type: keyof Penalties) {
    const newPenalties = { ...penalties, [type]: penalties[type] + 1 };
    setPenalties(newPenalties);
    await savePenalties(newPenalties);
  }

  async function decrement(type: keyof Penalties) {
    if (penalties[type] <= 0) return;
    const newPenalties = { ...penalties, [type]: penalties[type] - 1 };
    setPenalties(newPenalties);
    await savePenalties(newPenalties);
  }

  async function savePenalties(p: Penalties) {
    if (!currentHA) return;
    setSaving(true);
    const supabase = createClient();

    const existingRun = currentRun;
    let error;

    if (existingRun) {
      ({ error } = await supabase
        .from("runs")
        .update({
          penalty_versatility_count_out: p.out,
          penalty_versatility_count_crash: p.crash,
          penalty_versatility_count_cut: p.cut,
        })
        .eq("id", existingRun.id));
    } else {
      const { data, error: insertError } = await supabase
        .from("runs")
        .insert({
          heat_assignment_id: currentHA.id,
          penalty_versatility_count_out: p.out,
          penalty_versatility_count_crash: p.crash,
          penalty_versatility_count_cut: p.cut,
          status: "pending",
        })
        .select()
        .single();
      if (data) setCurrentRun(data);
      error = insertError;
    }

    if (error) toast.error(error.message);
    setSaving(false);
  }

  function handleNext() {
    setSaved(false);
    setCurrentHA(null);
    setCurrentRun(null);
    setPenalties({ out: 0, crash: 0, cut: 0 });
  }

  const currentHeat = heats.find((h) =>
    h.heat_assignments.some((ha) => ha.id === currentHA?.id)
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/e5-logo.jpg"
            alt="E5 Energy Race 2026"
            width={120}
            height={40}
            className="h-7 w-auto object-contain"
            priority
          />
          <Badge className="bg-green-700 text-white text-xs">Juez Versatilidad</Badge>
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

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {!currentHA ? (
          <div className="text-center space-y-3">
            <p className="text-zinc-400 text-xl">Sin equipos en pista</p>
            <p className="text-zinc-600 text-sm">
              Espera a que el admin active una manga o recarga la página.
            </p>
          </div>
        ) : (
          <>
            {/* Current team */}
            <div className="text-center">
              <p className="text-zinc-400 text-sm uppercase tracking-wider mb-2">
                Manga {currentHeat?.heat_number} — Versatilidad
              </p>
              {currentHA.teams && (
                <div className="flex items-center justify-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: currentHA.teams.color_hex }}
                  />
                  <p className="text-3xl font-bold">{currentHA.teams.name}</p>
                </div>
              )}
              <p className="text-zinc-400 text-sm mt-1">{currentHA.teams?.school}</p>
            </div>

            {/* Penalty summary */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 text-center w-full max-w-sm">
              <p className="text-zinc-400 text-sm mb-1">Total penalizaciones</p>
              <p className="text-4xl font-bold font-mono">
                <span className={totalPenaltySeconds > 0 ? "text-red-400" : "text-zinc-500"}>
                  +{totalPenaltySeconds}s
                </span>
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {totalPenalties} faltas × 5s = {totalPenaltySeconds}s adicionales
              </p>
              {saving && (
                <p className="text-zinc-600 text-xs mt-1">Guardando...</p>
              )}
            </div>

            {/* Penalty counters */}
            <div className="space-y-3 w-full max-w-sm">
              <PenaltyCounter
                label="Salió de pista"
                value={penalties.out}
                onIncrement={() => increment("out")}
                onDecrement={() => decrement("out")}
              />
              <PenaltyCounter
                label="Chocó con obstáculo"
                value={penalties.crash}
                onIncrement={() => increment("crash")}
                onDecrement={() => decrement("crash")}
              />
              <PenaltyCounter
                label="Cortó trayectoria"
                value={penalties.cut}
                onIncrement={() => increment("cut")}
                onDecrement={() => decrement("cut")}
              />
            </div>

            {/* Queue */}
            <div className="w-full max-w-sm mt-2">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                Próximos equipos
              </p>
              {heats.flatMap((h) =>
                h.heat_assignments
                  .filter((ha) => {
                    const run = ha.runs?.[0];
                    return ha.id !== currentHA.id && (!run || run.status === "pending");
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

function PenaltyCounter({
  label,
  value,
  onIncrement,
  onDecrement,
}: {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <div>
        <p className="text-white font-medium">{label}</p>
        <p className="text-zinc-500 text-xs">+{value * 5}s acumulados</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={onDecrement}
          disabled={value <= 0}
          variant="outline"
          className="w-12 h-12 text-2xl font-bold border-zinc-600 text-zinc-300 disabled:opacity-30 rounded-xl"
        >
          −
        </Button>
        <span className="text-3xl font-bold font-mono w-8 text-center text-white">
          {value}
        </span>
        <Button
          onClick={onIncrement}
          className="w-12 h-12 text-2xl font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl active:scale-95 transition-transform"
        >
          +
        </Button>
      </div>
    </div>
  );
}
