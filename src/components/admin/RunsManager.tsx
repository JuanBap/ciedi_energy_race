"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateRun, markRunFailed, assignWorstTimePlusTen, reprogramRun } from "@/app/actions/runs";
import { toast } from "sonner";
import { formatTime } from "@/lib/utils";

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
    lane: string | null;
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

export default function RunsManager({ runs }: { runs: Run[] }) {
  const [editRun, setEditRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      <RunSection
        title="Velocidad"
        runs={velocityRuns}
        onEdit={setEditRun}
        onFail={handleMarkFailed}
        onWorstTime={handleWorstTime}
        onReprogram={handleReprogram}
        loading={loading}
      />
      <RunSection
        title="Versatilidad"
        runs={versatilityRuns}
        onEdit={setEditRun}
        onFail={handleMarkFailed}
        onWorstTime={handleWorstTime}
        onReprogram={handleReprogram}
        loading={loading}
      />

      <EditRunDialog run={editRun} onClose={() => setEditRun(null)} />
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
  loading,
}: {
  title: string;
  runs: Run[];
  onEdit: (r: Run) => void;
  onFail: (id: string) => void;
  onWorstTime: (id: string) => void;
  onReprogram: (id: string) => void;
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
                {title === "Velocidad" && <TableHead className="text-zinc-400">Carril</TableHead>}
                <TableHead className="text-zinc-400">Equipo</TableHead>
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
                const versatilityPenalty =
                  (run.penalty_versatility_count_out +
                    run.penalty_versatility_count_crash +
                    run.penalty_versatility_count_cut) *
                  5000;
                const totalMs =
                  run.time_ms != null
                    ? run.time_ms + penaltyMs + versatilityPenalty
                    : null;

                return (
                  <TableRow key={run.id} className="border-zinc-700">
                    <TableCell className="text-white font-mono">
                      M{ha?.heats?.heat_number}
                    </TableCell>
                    {title === "Velocidad" && (
                      <TableCell className="text-yellow-400 font-mono text-sm">
                        {ha?.lane ?? "—"}
                      </TableCell>
                    )}
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
                    <TableCell className="font-mono text-white">
                      {totalMs != null ? formatTime(totalMs) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.has_penalty_velocity && (
                        <span className="text-red-400">+10s vel</span>
                      )}
                      {versatilityPenalty > 0 && (
                        <span className="text-orange-400">
                          +{versatilityPenalty / 1000}s
                          ({run.penalty_versatility_count_out}S/
                          {run.penalty_versatility_count_crash}C/
                          {run.penalty_versatility_count_cut}T)
                        </span>
                      )}
                      {!run.has_penalty_velocity && versatilityPenalty === 0 && (
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
                            variant="destructive"
                            className="h-6 text-xs"
                            disabled={loading === run.id}
                            onClick={() => onFail(run.id)}
                          >
                            Fallar
                          </Button>
                        )}
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
            </p>
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
            {run.heat_assignments?.heats?.test_type === "velocity" && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="penalty"
                  checked={penalty}
                  onCheckedChange={(v) => setPenalty(!!v)}
                />
                <label htmlFor="penalty" className="text-zinc-300 text-sm cursor-pointer">
                  Penalización +10s (no frenó en zona / salió de pista)
                </label>
              </div>
            )}
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
