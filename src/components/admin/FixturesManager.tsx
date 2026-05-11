"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  loadVelocityFixture,
  loadVersatilityFixture,
  deleteHeat,
  updateVersatilityHeat,
  assignLane,
  clearLane,
  resetLaneRun,
  restartHeat,
} from "@/app/actions/fixtures";
import { setHeatStatus } from "@/app/actions/heats";
import { toast } from "sonner";
import type { Lane } from "@/types/database";

interface Team {
  id: string;
  name: string;
  school: string;
  categories: { slug: string; name: string } | null;
}

interface TimerUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface HeatTeam {
  id: string;
  name: string;
  school: string;
  color_hex: string;
}

interface Run {
  id: string;
  status: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
}

interface HeatAssignment {
  id: string;
  team_id: string;
  lane: string | null;
  timer_user_id: string | null;
  teams: HeatTeam | null;
  timer: { id: string; full_name: string | null; email: string } | null;
  runs: Run[];
}

interface Heat {
  id: string;
  heat_number: number;
  status: string;
  heat_assignments: HeatAssignment[];
}

interface Props {
  teams: Team[];
  timers: TimerUser[];
  velocityHeats: Heat[];
  versatilityHeats: Heat[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:      { label: "Pendiente",    color: "bg-zinc-700 text-zinc-300" },
  active:       { label: "En curso",     color: "bg-yellow-500 text-black" },
  finished:     { label: "Finalizada",   color: "bg-green-700 text-white" },
  failed:       { label: "Fallida",      color: "bg-red-700 text-white" },
  reprogrammed: { label: "Reprogramada", color: "bg-blue-700 text-white" },
};

const LANES: Lane[] = ["C2", "C4", "C6"];

export default function FixturesManager({ teams, timers, velocityHeats, versatilityHeats }: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  // Realtime: debounced refresh para que los cambios se reflejen
  // automáticamente sin saturar al servidor con muchos refreshes.
  const debouncedRefresh = useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
  }, [router])();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("fixtures-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, debouncedRefresh)
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [debouncedRefresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium text-zinc-300">Cómo funciona</p>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
            <span>{connected ? "Sincronizado" : "Conectando…"}</span>
          </div>
        </div>
        <ul className="list-disc list-inside space-y-0.5">
          <li><span className="text-white">Velocidad</span> — hasta 3 equipos en paralelo (uno por carril). Los carriles pueden quedar vacíos.</li>
          <li><span className="text-white">Versatilidad</span> — un equipo por manga, en orden de salida.</li>
          <li>El admin asigna en cada celda: equipo + cronometrista. Cuando activas la manga, los 3 cronometristas designados pueden cronometrar a la vez.</li>
          <li>Si un tiempo sale mal, usa <strong>Repetir</strong> en ese carril para invalidarlo y permitir un nuevo intento.</li>
        </ul>
      </div>

      <Tabs defaultValue="velocity">
        <TabsList className="bg-zinc-800 border border-zinc-700">
          <TabsTrigger value="velocity" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
            Velocidad
          </TabsTrigger>
          <TabsTrigger value="versatility" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
            Versatilidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="velocity" className="mt-4">
          <VelocityFixture teams={teams} timers={timers} heats={velocityHeats} />
        </TabsContent>
        <TabsContent value="versatility" className="mt-4">
          <VersatilityFixture teams={teams} timers={timers} heats={versatilityHeats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Velocity (con timer + lane CRUD) ─────────────────────────────────────────

type VelocityRow = { c2: string; c4: string; c6: string };

function VelocityFixture({
  teams, timers, heats,
}: { teams: Team[]; timers: TimerUser[]; heats: Heat[] }) {
  const [rows, setRows] = useState<VelocityRow[]>([{ c2: "", c4: "", c6: "" }]);
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ heat: Heat; lane: Lane } | null>(null);
  const [deletingHeat, setDeletingHeat] = useState<Heat | null>(null);
  const [restartingHeat, setRestartingHeat] = useState<Heat | null>(null);

  const startHeatNum = heats.length > 0 ? Math.max(...heats.map((h) => h.heat_number)) + 1 : 1;

  function updateRow(i: number, lane: "c2" | "c4" | "c6", value: string) {
    const updated = [...rows];
    updated[i] = { ...updated[i], [lane]: value === "none" ? "" : value };
    setRows(updated);
  }

  function addRow() { setRows([...rows, { c2: "", c4: "", c6: "" }]); }
  function removeRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)); }

  async function handleSaveNewFixture() {
    // Validación cliente: detectar duplicados de equipo en una misma manga
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const used = [r.c2, r.c4, r.c6].filter(Boolean);
      if (new Set(used).size !== used.length) {
        toast.error(`Manga ${startHeatNum + i}: el mismo equipo está asignado a dos carriles. Cada equipo solo puede correr en un carril por manga.`);
        return;
      }
    }

    const flat: { team_id: string; heat_number: number; lane: Lane }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const heatNum = startHeatNum + i;
      if (r.c2) flat.push({ team_id: r.c2, heat_number: heatNum, lane: "C2" });
      if (r.c4) flat.push({ team_id: r.c4, heat_number: heatNum, lane: "C4" });
      if (r.c6) flat.push({ team_id: r.c6, heat_number: heatNum, lane: "C6" });
    }
    if (!flat.length) { toast.error("Agrega al menos un equipo en algún carril"); return; }
    setLoading(true);
    const result = await loadVelocityFixture(flat);
    if (result?.error) toast.error(result.error);
    else { toast.success("Fixture guardado"); setRows([{ c2: "", c4: "", c6: "" }]); }
    setLoading(false);
  }

  async function handleSetStatus(heatId: string, status: "active" | "finished" | "pending") {
    const result = await setHeatStatus(heatId, status);
    if (result?.error) toast.error(result.error);
    else toast.success(`Manga ${status === "active" ? "activada" : status === "finished" ? "finalizada" : "reabierta"}`);
  }

  return (
    <div className="space-y-6">
      {heats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-white">Fixture cargado — Velocidad</h3>
          <div className="overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-14">Manga</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 2</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 4</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 6</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                  <th className="py-2 px-3 text-right text-zinc-400 font-medium w-44">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const byLane: Record<string, HeatAssignment | null> = {};
                  for (const ha of heat.heat_assignments) {
                    if (ha.lane) byLane[ha.lane] = ha;
                  }
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  const isActive = heat.status === "active";

                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30 transition-colors align-top">
                      <td className="py-2 px-3 font-bold text-yellow-400 pt-3">M{heat.heat_number}</td>
                      {LANES.map((lane) => (
                        <td key={lane} className="py-2 px-3">
                          <LaneCell
                            ha={byLane[lane] ?? null}
                            heat={heat}
                            lane={lane}
                            onAssign={() => setEditingCell({ heat, lane })}
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 pt-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right pt-2">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {heat.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handleSetStatus(heat.id, "active")}
                              className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white"
                            >
                              ▶ Activar
                            </Button>
                          )}
                          {isActive && (
                            <Button
                              size="sm"
                              onClick={() => handleSetStatus(heat.id, "finished")}
                              className="h-7 text-xs bg-blue-700 hover:bg-blue-600 text-white"
                            >
                              Cerrar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRestartingHeat(heat)}
                            className="h-7 text-xs border-yellow-700 text-yellow-400 hover:bg-yellow-900/30"
                            title="Invalidar tiempos y volver la manga a Pendiente"
                          >
                            🔄 Reiniciar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeletingHeat(heat)}
                            className="h-7 text-xs"
                          >
                            Borrar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor para agregar mangas nuevas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {heats.length > 0 ? `Agregar mangas (desde M${startHeatNum})` : "Cargar fixture"}
          </h3>
          <p className="text-xs text-zinc-500">Asigna cronometristas después con &quot;Editar&quot; en cada carril</p>
        </div>

        <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] gap-2 px-1">
          <span className="text-xs font-medium text-zinc-500 self-center">Manga</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril 2</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril 4</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril 6</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] gap-2 items-center">
            <span className="text-center text-sm font-bold text-yellow-400">M{startHeatNum + i}</span>
            {(["c2", "c4", "c6"] as const).map((lane) => (
              <Select
                key={lane}
                value={row[lane] || "none"}
                onValueChange={(v) => updateRow(i, lane, v)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                  <SelectValue placeholder="Sin equipo" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-400 italic">Sin equipo</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-white">
                      <span>{t.name} <span className="text-zinc-400">— {t.school}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            <button
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              className="text-zinc-600 hover:text-red-400 disabled:opacity-20 transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
        ))}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={addRow} className="border-zinc-600 text-zinc-300">
            + Agregar manga
          </Button>
          <Button
            size="sm"
            onClick={handleSaveNewFixture}
            disabled={loading}
            className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
          >
            {loading ? "Guardando..." : "Guardar fixture"}
          </Button>
        </div>
      </div>

      <AssignLaneModal
        cell={editingCell}
        teams={teams}
        timers={timers}
        onClose={() => setEditingCell(null)}
      />
      <DeleteHeatModal heat={deletingHeat} onClose={() => setDeletingHeat(null)} />
      <RestartHeatModal heat={restartingHeat} onClose={() => setRestartingHeat(null)} />
    </div>
  );
}

// Render de cada celda de carril con acciones inline
function LaneCell({
  ha, heat, lane, onAssign,
}: {
  ha: HeatAssignment | null;
  heat: Heat;
  lane: Lane;
  onAssign: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClear() {
    if (!ha) return;
    if (!confirm(`¿Liberar el carril ${lane} de M${heat.heat_number}? Se borrará el equipo y su tiempo.`)) return;
    setLoading(true);
    const r = await clearLane(ha.id);
    if (r?.error) toast.error(r.error);
    else toast.success(`Carril ${lane} liberado`);
    setLoading(false);
  }

  async function handleReset() {
    if (!ha) return;
    setLoading(true);
    const r = await resetLaneRun(ha.id);
    if (r?.error) toast.error(r.error);
    else toast.success(`Tiempo de carril ${lane} invalidado, listo para reintento`);
    setLoading(false);
  }

  if (!ha) {
    return (
      <button
        onClick={onAssign}
        className="text-zinc-500 hover:text-yellow-400 text-xs italic transition-colors"
      >
        + Asignar
      </button>
    );
  }

  const run = ha.runs?.[0];
  const hasRecordedRun = run && run.status === "recorded";
  const timerLabel = ha.timer?.full_name ?? ha.timer?.email ?? null;

  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {ha.teams && (
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600"
            style={{ backgroundColor: ha.teams.color_hex }}
          />
        )}
        <div className="min-w-0">
          <p className="text-zinc-100 text-sm font-medium truncate">{ha.teams?.name ?? "—"}</p>
          <p className="text-zinc-500 text-xs truncate">{ha.teams?.school}</p>
        </div>
      </div>
      <p className={`text-xs truncate ${timerLabel ? "text-blue-400" : "text-zinc-600 italic"}`}>
        {timerLabel ? `👤 ${timerLabel}` : "sin cronometrista"}
      </p>
      <div className="flex gap-1 mt-1 flex-wrap">
        <button
          onClick={onAssign}
          disabled={loading}
          className="text-zinc-400 hover:text-yellow-400 text-xs disabled:opacity-30"
          title="Editar este carril"
        >
          ✏️ Editar
        </button>
        <button
          onClick={handleClear}
          disabled={loading}
          className="text-zinc-400 hover:text-red-400 text-xs disabled:opacity-30"
          title="Liberar este carril"
        >
          🗑 Borrar
        </button>
        {hasRecordedRun && (
          <button
            onClick={handleReset}
            disabled={loading}
            className="text-zinc-400 hover:text-yellow-400 text-xs disabled:opacity-30"
            title="Invalidar tiempo y permitir nuevo intento"
          >
            🔁 Repetir
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function AssignLaneModal({
  cell, teams, timers, onClose,
}: {
  cell: { heat: Heat; lane: Lane } | null;
  teams: Team[];
  timers: TimerUser[];
  onClose: () => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [timerId, setTimerId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cell) return;
    const existing = cell.heat.heat_assignments.find((a) => a.lane === cell.lane);
    setTeamId(existing?.team_id ?? "");
    setTimerId(existing?.timer_user_id ?? "");
  }, [cell]);

  async function handleSave() {
    if (!cell) return;
    if (!teamId || teamId === "none") { toast.error("Selecciona un equipo"); return; }
    setLoading(true);
    const r = await assignLane(cell.heat.id, cell.lane, teamId, timerId || null);
    if (r?.error) toast.error(r.error);
    else { toast.success(`Carril ${cell.lane} actualizado`); onClose(); }
    setLoading(false);
  }

  return (
    <Dialog open={!!cell} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>Asignar carril {cell?.lane} — M{cell?.heat.heat_number}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Define qué equipo corre en este carril y qué cronometrista lo opera.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-zinc-300 text-sm">Equipo</label>
            <Select value={teamId || ""} onValueChange={setTeamId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white">
                    <span>{t.name} <span className="text-zinc-400">— {t.school}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-zinc-300 text-sm">Cronometrista</label>
            <Select value={timerId || "none"} onValueChange={(v) => setTimerId(v === "none" ? "" : v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                <SelectValue placeholder="Sin cronometrista" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="none" className="text-zinc-400 italic">Sin cronometrista</SelectItem>
                {timers.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-white">
                    <span>
                      {u.full_name ?? u.email}
                      {u.role === "admin" && <span className="ml-1 text-xs text-zinc-400">(admin)</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              El cronometrista verá este carril cuando actives la manga.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RestartHeatModal({ heat, onClose }: { heat: Heat | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleRestart() {
    if (!heat) return;
    setLoading(true);
    const r = await restartHeat(heat.id);
    if (r?.error) toast.error(r.error);
    else { toast.success(`M${heat.heat_number} reiniciada — vuelve a Pendiente`); onClose(); }
    setLoading(false);
  }

  const recordedRuns = heat?.heat_assignments
    .filter((a) => a.runs?.some((r) => r.status === "recorded"))
    .map((a) => `${a.teams?.name ?? "—"} (${a.lane})`)
    .join(", ");

  const wasActive = heat?.status === "active";

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>¿Reiniciar manga M{heat?.heat_number}?</DialogTitle>
          <DialogDescription className="text-zinc-400 space-y-2">
            <span className="block">
              Esto hace dos cosas:
            </span>
            <span className="block">
              1. <strong className="text-zinc-200">Invalida los tiempos registrados</strong>{" "}
              (quedan en auditoría como &quot;failed&quot;)
            </span>
            <span className="block">
              2. <strong className="text-zinc-200">Vuelve la manga a &quot;Pendiente&quot;</strong> —
              tendrás que reactivarla manualmente cuando quieras que los cronometristas
              registren de nuevo
            </span>
            {wasActive && (
              <span className="block mt-2 text-yellow-400 font-medium">
                ⚠️ La manga está EN CURSO. Reiniciarla detendrá a los cronometristas hasta
                que vuelvas a activar.
              </span>
            )}
            {recordedRuns && (
              <span className="block mt-2 text-zinc-300">
                Tiempos afectados: {recordedRuns}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">
            Cancelar
          </Button>
          <Button onClick={handleRestart} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            {loading ? "Reiniciando..." : "Confirmar reinicio"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteHeatModal({ heat, onClose }: { heat: Heat | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!heat) return;
    setLoading(true);
    const r = await deleteHeat(heat.id);
    if (r?.error) toast.error(r.error);
    else { toast.success(`M${heat.heat_number} eliminada`); onClose(); }
    setLoading(false);
  }

  const teamNames = heat?.heat_assignments
    .map((a) => a.teams?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>¿Eliminar manga M{heat?.heat_number}?</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Esta acción no se puede deshacer.
            {teamNames && <> Se eliminarán las asignaciones de: <span className="text-zinc-200">{teamNames}</span>.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Versatility (sin carriles ni timer; un equipo por manga) ─────────────────

function VersatilityFixture({
  teams, timers, heats,
}: { teams: Team[]; timers: TimerUser[]; heats: Heat[] }) {
  const [rows, setRows] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [editingHeat, setEditingHeat] = useState<Heat | null>(null);
  const [deletingHeat, setDeletingHeat] = useState<Heat | null>(null);
  const [restartingHeat, setRestartingHeat] = useState<Heat | null>(null);

  const startHeatNum = heats.length > 0 ? Math.max(...heats.map((h) => h.heat_number)) + 1 : 1;

  function addRow() { setRows([...rows, ""]); }
  function removeRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    const flat = rows
      .map((teamId, i) => ({ team_id: teamId, heat_number: startHeatNum + i }))
      .filter((r) => r.team_id && r.team_id !== "none");
    if (!flat.length) { toast.error("Agrega al menos un equipo"); return; }
    setLoading(true);
    const result = await loadVersatilityFixture(flat);
    if (result?.error) toast.error(result.error);
    else { toast.success("Fixture guardado"); setRows([""]); }
    setLoading(false);
  }

  async function handleSetStatus(heatId: string, status: "active" | "finished") {
    const result = await setHeatStatus(heatId, status);
    if (result?.error) toast.error(result.error);
    else toast.success(`Manga ${status === "active" ? "activada" : "finalizada"}`);
  }

  return (
    <div className="space-y-6">
      {heats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-white">Fixture cargado — Versatilidad</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-16">Manga</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Equipo</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Cronometrista</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                  <th className="py-2 px-3 text-right text-zinc-400 font-medium w-52">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const ha = heat.heat_assignments[0];
                  const team = ha?.teams;
                  const timerLabel = ha?.timer?.full_name ?? ha?.timer?.email ?? null;
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  const isActive = heat.status === "active";
                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30">
                      <td className="py-2 px-3 font-bold text-yellow-400">M{heat.heat_number}</td>
                      <td className="py-2 px-3">
                        {team ? (
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={{ backgroundColor: team.color_hex }} />
                            <div className="min-w-0">
                              <p className="text-zinc-200 truncate">{team.name}</p>
                              <p className="text-zinc-500 text-xs truncate">{team.school}</p>
                            </div>
                          </div>
                        ) : <span className="text-zinc-600">Sin equipo</span>}
                      </td>
                      <td className="py-2 px-3">
                        {timerLabel ? (
                          <span className="text-blue-400 text-sm">👤 {timerLabel}</span>
                        ) : (
                          <span className="text-zinc-600 text-xs italic">Sin cronometrista</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {heat.status === "pending" && (
                            <Button size="sm" onClick={() => handleSetStatus(heat.id, "active")} className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white">▶ Activar</Button>
                          )}
                          {isActive && (
                            <Button size="sm" onClick={() => handleSetStatus(heat.id, "finished")} className="h-7 text-xs bg-blue-700 hover:bg-blue-600 text-white">Cerrar</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditingHeat(heat)} className="h-7 text-xs border-zinc-600 text-zinc-300">Editar</Button>
                          <Button size="sm" variant="outline" onClick={() => setRestartingHeat(heat)} className="h-7 text-xs border-yellow-700 text-yellow-400 hover:bg-yellow-900/30">🔄 Reiniciar</Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeletingHeat(heat)} className="h-7 text-xs">Borrar</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{heats.length > 0 ? `Agregar mangas (desde M${startHeatNum})` : "Cargar fixture"}</h3>
          <p className="text-xs text-zinc-500">Un equipo por manga, en orden de salida</p>
        </div>
        <div className="grid grid-cols-[3.5rem_1fr_2rem] gap-2 px-1">
          <span className="text-xs font-medium text-zinc-500 self-center">Manga</span>
          <span className="text-xs font-medium text-zinc-400">Equipo</span>
          <span />
        </div>
        {rows.map((teamId, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr_2rem] gap-2 items-center">
            <span className="text-center text-sm font-bold text-yellow-400">M{startHeatNum + i}</span>
            <Select value={teamId || "none"} onValueChange={(v) => { const u = [...rows]; u[i] = v === "none" ? "" : v; setRows(u); }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white">
                    <span>{t.name} <span className="text-zinc-400">— {t.school}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button onClick={() => removeRow(i)} disabled={rows.length === 1} className="text-zinc-600 hover:text-red-400 disabled:opacity-20 text-xl leading-none">×</button>
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={addRow} className="border-zinc-600 text-zinc-300">+ Agregar manga</Button>
          <Button size="sm" onClick={handleSave} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            {loading ? "Guardando..." : "Guardar fixture"}
          </Button>
        </div>
      </div>

      <EditVersatilityModal heat={editingHeat} teams={teams} timers={timers} onClose={() => setEditingHeat(null)} />
      <DeleteHeatModal heat={deletingHeat} onClose={() => setDeletingHeat(null)} />
      <RestartHeatModal heat={restartingHeat} onClose={() => setRestartingHeat(null)} />
    </div>
  );
}

function EditVersatilityModal({
  heat, teams, timers, onClose,
}: {
  heat: Heat | null;
  teams: Team[];
  timers: TimerUser[];
  onClose: () => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [timerId, setTimerId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!heat) return;
    const ha = heat.heat_assignments[0];
    setTeamId(ha?.team_id ?? "");
    setTimerId(ha?.timer_user_id ?? "");
  }, [heat]);

  async function handleSave() {
    if (!heat || !teamId || teamId === "none") { toast.error("Selecciona un equipo"); return; }
    setLoading(true);
    const r = await updateVersatilityHeat(heat.id, teamId, timerId || null);
    if (r?.error) toast.error(r.error);
    else { toast.success(`M${heat.heat_number} actualizada`); onClose(); }
    setLoading(false);
  }

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>Editar M{heat?.heat_number} — Versatilidad</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Define qué equipo corre esta manga y qué cronometrista toma el tiempo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-zinc-300 text-sm">Equipo</label>
            <Select value={teamId || ""} onValueChange={setTeamId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white">
                    <span>{t.name} <span className="text-zinc-400">— {t.school}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-zinc-300 text-sm">Cronometrista</label>
            <Select value={timerId || "none"} onValueChange={(v) => setTimerId(v === "none" ? "" : v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-full">
                <SelectValue placeholder="Sin cronometrista" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="none" className="text-zinc-400 italic">Sin cronometrista</SelectItem>
                {timers.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-white">
                    <span>
                      {u.full_name ?? u.email}
                      {u.role === "admin" && <span className="ml-1 text-xs text-zinc-400">(admin)</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              El cronometrista verá esta manga cuando la actives.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">{loading ? "Guardando..." : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
