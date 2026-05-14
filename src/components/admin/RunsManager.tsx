"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateRun, markRunFailed, assignWorstTimePlusTen, reprogramRun, deleteRun } from "@/app/actions/runs";
import { setNoShow } from "@/app/actions/fixtures";
import { toast } from "sonner";
import { formatTimePrecise } from "@/lib/utils";

interface Run {
  id: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
  penalty_versatility_count_out: number;
  penalty_versatility_count_crash: number;
  penalty_versatility_count_cut: number;
  status: string;
  edited_by: string | null;
  edited_at: string | null;
  heat_assignments: {
    id: string;
    lane: string | null;
    no_show: boolean;
    teams: { id: string; name: string; school: string; color_hex: string } | null;
    heats: { heat_number: number; test_type: string; status: string } | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-700 text-zinc-300",
  recorded: "bg-green-800 text-green-200",
  failed: "bg-red-800 text-red-200",
  reprogrammed: "bg-yellow-800 text-yellow-200",
};

export default function RunsManager({ runs: initialRuns }: { runs: Run[] }) {
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [editRun, setEditRun] = useState<Run | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Run | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("runs")
      .select(`
        *,
        heat_assignments(
          id, lane, no_show,
          teams(id, name, school, color_hex),
          heats(heat_number, test_type, status)
        )
      `)
      .order("created_at", { ascending: false });
    if (data) setRuns(data.filter((r) => r.heat_assignments?.heats));
  }, []);

  // Mantener `runs` sincronizado si llegan nuevas props (SSR)
  useEffect(() => { setRuns(initialRuns); }, [initialRuns]);

  // Suscripción Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetch)
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const velocityRuns = runs.filter((r) => r.heat_assignments?.heats?.test_type === "velocity");
  const versatilityRuns = runs.filter((r) => r.heat_assignments?.heats?.test_type === "versatility");

  async function handleMarkFailed(runId: string) {
    setLoading(runId);
    const result = await markRunFailed(runId);
    if (result?.error) toast.error(result.error);
    else toast.success("Manga marcada como fallida");
    setLoading(null);
  }

  async function handleWorstTime(runId: string) {
    setLoading(runId);
    const result = await assignWorstTimePlusTen(runId);
    if (result?.error) toast.error(result.error);
    else toast.success("Peor tiempo +10s asignado");
    setLoading(null);
  }

  async function handleReprogram(runId: string) {
    setLoading(runId);
    const result = await reprogramRun(runId);
    if (result?.error) toast.error(result.error);
    else toast.success("Manga reprogramada al final");
    setLoading(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setLoading(deleteTarget.id);
    const result = await deleteRun(deleteTarget.id);
    if (result?.error) toast.error(result.error);
    else { toast.success("Tiempo eliminado"); setDeleteTarget(null); }
    setLoading(null);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
        <span>{connected ? "Sincronizado en vivo" : "Conectando…"}</span>
        <span className="text-zinc-600 ml-2">· {runs.length} tiempo(s) registrado(s)</span>
      </div>
      <RunSection
        title="Velocidad"
        runs={velocityRuns}
        onEdit={setEditRun}
        onFail={handleMarkFailed}
        onWorstTime={handleWorstTime}
        onReprogram={handleReprogram}
        onDelete={setDeleteTarget}
        loading={loading}
      />
      <RunSection
        title="Versatilidad"
        runs={versatilityRuns}
        onEdit={setEditRun}
        onFail={handleMarkFailed}
        onWorstTime={handleWorstTime}
        onReprogram={handleReprogram}
        onDelete={setDeleteTarget}
        loading={loading}
      />

      <EditRunDialog run={editRun} onClose={() => setEditRun(null)} />
      <DeleteRunDialog
        run={deleteTarget}
        loading={loading === deleteTarget?.id}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function RunSection({
  title,
  runs,
  onEdit,
  onFail,
  onWorstTime,
  onReprogram,
  onDelete,
  loading,
}: {
  title: string;
  runs: Run[];
  onEdit: (r: Run) => void;
  onFail: (id: string) => void;
  onWorstTime: (id: string) => void;
  onReprogram: (id: string) => void;
  onDelete: (r: Run) => void;
  loading: string | null;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-yellow-400">{title}</h2>
      {runs.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sin tiempos registrados</p>
      ) : (
        <div className="rounded-lg border border-zinc-700 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-700">
                <TableHead className="text-zinc-400">Manga</TableHead>
                <TableHead className="text-zinc-400">Carril</TableHead>
                <TableHead className="text-zinc-400">Equipo</TableHead>
                <TableHead className="text-zinc-400">Presentación</TableHead>
                <TableHead className="text-zinc-400">Tiempo</TableHead>
                <TableHead className="text-zinc-400">Penalización</TableHead>
                <TableHead className="text-zinc-400">Estado</TableHead>
                <TableHead className="text-zinc-400 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const ha = run.heat_assignments;
                const penaltyMs = run.has_penalty_velocity ? 10000 : 0;
                const totalMs = run.time_ms != null ? run.time_ms + penaltyMs : null;

                const noShow = ha?.no_show ?? false;
                return (
                  <TableRow key={run.id} className={`border-zinc-700 ${noShow ? "bg-red-950/20" : ""}`}>
                    <TableCell className="text-white font-mono">
                      M{ha?.heats?.heat_number}
                    </TableCell>
                    <TableCell className="text-yellow-400 font-mono text-sm">
                      {ha?.lane ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {ha?.teams && (
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: ha.teams.color_hex }}
                          />
                        )}
                        <span className="text-zinc-200">{ha?.teams?.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {noShow ? (
                        <Badge className="bg-red-900 text-red-200 text-[10px] font-bold uppercase">
                          🚫 No se presentó
                        </Badge>
                      ) : (
                        <span className="text-green-400 text-xs">✓ Sí</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-white">
                      {totalMs != null ? (
                        <span className={noShow ? "text-orange-400" : ""}>
                          {formatTimePrecise(totalMs)}
                          {noShow && totalMs > 0 && <span className="text-orange-500 text-xs ml-1">*</span>}
                        </span>
                      ) : (
                        noShow ? <span className="text-red-400 italic text-xs">Sin tiempo asignado</span> : "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.has_penalty_velocity ? (
                        <span className="text-red-400">+10s</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLORS[run.status]} text-xs capitalize`}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs border-zinc-600 text-zinc-300"
                          onClick={() => onEdit(run)}
                        >
                          Editar
                        </Button>
                        {run.status === "failed" && (
                          <>
                            <Button
                              size="sm"
                              className="h-6 text-xs bg-orange-700 hover:bg-orange-600 text-white"
                              disabled={loading === run.id}
                              onClick={() => onWorstTime(run.id)}
                            >
                              Peor+10s
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 text-xs bg-blue-700 hover:bg-blue-600 text-white"
                              disabled={loading === run.id}
                              onClick={() => onReprogram(run.id)}
                            >
                              Reprog.
                            </Button>
                          </>
                        )}
                        {run.status !== "failed" && (
                          <Button
                            size="sm"
                            className="h-6 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                            disabled={loading === run.id}
                            onClick={() => onFail(run.id)}
                          >
                            Fallar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-xs"
                          disabled={loading === run.id}
                          onClick={() => onDelete(run)}
                          title="Eliminar este registro de tiempo"
                        >
                          🗑 Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EditRunDialog({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [penalty, setPenalty] = useState(false);

  function handleOpen() {
    if (!run) return;
    const seconds = run.time_ms != null ? Math.round(run.time_ms / 1000) : 0;
    const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
    const ss = (seconds % 60).toString().padStart(2, "0");
    setTimeInput(`${mm}:${ss}`);
    setPenalty(run.has_penalty_velocity);
  }

  async function handleSave() {
    if (!run) return;
    const parts = timeInput.split(":");
    if (parts.length !== 2) {
      toast.error("Formato inválido. Usa MM:SS");
      return;
    }
    const ms = (Number(parts[0]) * 60 + Number(parts[1])) * 1000;
    if (isNaN(ms)) {
      toast.error("Tiempo inválido");
      return;
    }
    setLoading(true);
    const result = await updateRun(run.id, ms, penalty);
    if (result?.error) toast.error(result.error);
    else { toast.success("Tiempo actualizado"); onClose(); }
    setLoading(false);
  }

  async function handleWorstPlus10() {
    if (!run) return;
    setLoading(true);
    const result = await assignWorstTimePlusTen(run.id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      const assigned = (result as { assignedMs?: number }).assignedMs;
      toast.success(
        assigned
          ? `Tiempo adjudicado: ${Math.floor(assigned / 60000)}:${String(Math.floor((assigned % 60000) / 1000)).padStart(2, "0")} (peor + 10s)`
          : "Peor tiempo + 10s asignado"
      );
      onClose();
    }
    setLoading(false);
  }

  async function handleToggleNoShow() {
    if (!run?.heat_assignments) return;
    const haId = run.heat_assignments.id;
    if (!haId) return;
    setLoading(true);
    const r = await setNoShow(haId, !run.heat_assignments.no_show);
    if (r?.error) toast.error(r.error);
    else toast.success(run.heat_assignments.no_show ? "Marcado como sí presentado" : "Marcado como NO SE PRESENTÓ");
    setLoading(false);
  }

  const isNoShow = run?.heat_assignments?.no_show ?? false;

  return (
    <Dialog
      open={!!run}
      onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}
    >
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle>Editar Tiempo</DialogTitle>
        </DialogHeader>
        {run && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              <strong className="text-white">{run.heat_assignments?.teams?.name}</strong> — M
              {run.heat_assignments?.heats?.heat_number}
              {run.heat_assignments?.lane && ` · ${run.heat_assignments.lane}`}
              {run.heat_assignments?.heats?.test_type && (
                <span className="ml-2 text-zinc-500 text-xs uppercase">
                  ({run.heat_assignments.heats.test_type === "velocity" ? "velocidad" : "versatilidad"})
                </span>
              )}
            </p>

            {/* Banner si el equipo no se presentó */}
            {isNoShow && (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 space-y-2">
                <p className="text-red-300 text-sm font-bold flex items-center gap-2">
                  🚫 ESTE EQUIPO NO SE PRESENTÓ
                </p>
                <p className="text-red-400/80 text-xs">
                  Según el reglamento, debes adjudicar el peor tiempo registrado en la
                  prueba + 10 segundos. Usa el botón naranja para calcularlo automáticamente.
                </p>
                <Button
                  onClick={handleWorstPlus10}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold"
                >
                  ⏱ Asignar peor tiempo + 10s (auto)
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-zinc-300 text-sm">Tiempo (MM:SS)</label>
              <Input
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                placeholder="01:23"
                className="bg-zinc-800 border-zinc-600 text-white font-mono text-lg"
              />
              <p className="text-zinc-500 text-xs">Ej: 01:23 para 1 minuto 23 segundos</p>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="penalty"
                checked={penalty}
                onCheckedChange={(v) => setPenalty(!!v)}
              />
              <label htmlFor="penalty" className="text-zinc-300 text-sm cursor-pointer">
                Penalización +10s
              </label>
            </div>

            {/* Toggle no_show */}
            <button
              onClick={handleToggleNoShow}
              disabled={loading}
              className={`w-full text-xs rounded-md border px-3 py-2 transition-colors ${
                isNoShow
                  ? "border-green-700 text-green-400 hover:bg-green-900/30"
                  : "border-red-700 text-red-400 hover:bg-red-900/30"
              }`}
            >
              {isNoShow ? "✓ Marcar como sí presentado" : "🚫 Marcar como no se presentó"}
            </button>

            {run.edited_at && (
              <p className="text-zinc-600 text-xs">
                Última edición: {new Date(run.edited_at).toLocaleString("es-CO")}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
              >
                {loading ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="border-zinc-600 text-zinc-300"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteRunDialog({
  run,
  loading,
  onConfirm,
  onClose,
}: {
  run: Run | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const team = run?.heat_assignments?.teams?.name ?? "—";
  const manga = run?.heat_assignments?.heats?.heat_number;
  const lane = run?.heat_assignments?.lane;
  const hasTime = run?.time_ms != null;

  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>¿Eliminar este registro?</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Esta acción borra el tiempo de la tabla de forma permanente.
            La asignación del carril en el fixture se mantiene — si necesitas
            que el equipo vuelva a registrar tiempo, lo puede hacer normalmente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm space-y-1">
          <p className="text-zinc-200">
            <strong>{team}</strong>
            {manga && <span className="text-zinc-500"> · M{manga}</span>}
            {lane && <span className="text-zinc-500"> · {lane}</span>}
          </p>
          {hasTime && (
            <p className="text-zinc-500 text-xs">
              Tiempo registrado: <span className="font-mono text-zinc-300">{formatTimePrecise(run!.time_ms!)}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="border-zinc-600 text-zinc-300"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
