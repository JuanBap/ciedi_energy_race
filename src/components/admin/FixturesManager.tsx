"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  loadVelocityFixture,
  loadVersatilityFixture,
  deleteHeat,
  updateVelocityHeat,
  updateVersatilityHeat,
} from "@/app/actions/fixtures";
import { toast } from "sonner";
import type { Lane } from "@/types/database";

interface Team {
  id: string;
  name: string;
  school: string;
  categories: { slug: string; name: string } | null;
}

interface HeatTeam {
  id: string;
  name: string;
  school: string;
  color_hex: string;
}

interface HeatAssignment {
  id: string;
  team_id: string;
  lane: string | null;
  teams: HeatTeam | null;
}

interface Heat {
  id: string;
  heat_number: number;
  status: string;
  heat_assignments: HeatAssignment[];
}

interface Props {
  teams: Team[];
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

// Render reusable de un equipo (color + nombre + colegio)
function TeamCell({ team }: { team: HeatTeam | null | undefined }) {
  if (!team) return <span className="text-zinc-600">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-zinc-600"
        style={{ backgroundColor: team.color_hex }}
        title={team.color_hex}
      />
      <div className="min-w-0">
        <div className="text-zinc-200 truncate">{team.name}</div>
        <div className="text-zinc-500 text-xs truncate">{team.school}</div>
      </div>
    </div>
  );
}

export default function FixturesManager({ teams, velocityHeats, versatilityHeats }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300 mb-1">¿Cómo funciona?</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><span className="text-white">Velocidad</span> — hasta 3 equipos corren a la vez, uno por carril.</li>
          <li><span className="text-white">Versatilidad</span> — los equipos corren uno a la vez en orden de manga.</li>
          <li>Puedes editar o borrar cualquier manga del fixture (siempre que no esté en curso).</li>
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
          <VelocityFixture teams={teams} heats={velocityHeats} />
        </TabsContent>
        <TabsContent value="versatility" className="mt-4">
          <VersatilityFixture teams={teams} heats={versatilityHeats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Velocity ──────────────────────────────────────────────────────────────────

type VelocityRow = { c2: string; c4: string; c6: string };

function VelocityFixture({ teams, heats }: { teams: Team[]; heats: Heat[] }) {
  const [rows, setRows] = useState<VelocityRow[]>([{ c2: "", c4: "", c6: "" }]);
  const [loading, setLoading] = useState(false);
  const [editingHeat, setEditingHeat] = useState<Heat | null>(null);
  const [deletingHeat, setDeletingHeat] = useState<Heat | null>(null);

  const startHeatNum = heats.length > 0
    ? Math.max(...heats.map((h) => h.heat_number)) + 1
    : 1;

  function updateRow(i: number, lane: "c2" | "c4" | "c6", value: string) {
    const updated = [...rows];
    updated[i] = { ...updated[i], [lane]: value === "none" ? "" : value };
    setRows(updated);
  }

  function addRow() { setRows([...rows, { c2: "", c4: "", c6: "" }]); }
  function removeRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)); }

  async function handleSave() {
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

  return (
    <div className="space-y-6">
      {heats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-white">Fixture cargado — Velocidad</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-16">Manga</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 2</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 4</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Carril 6</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                  <th className="py-2 px-3 text-right text-zinc-400 font-medium w-32">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const byLane: Record<string, HeatTeam | null> = {};
                  for (const ha of heat.heat_assignments) {
                    if (ha.lane) byLane[ha.lane] = ha.teams;
                  }
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  const disabled = heat.status === "active";
                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-3 font-bold text-yellow-400 align-top">M{heat.heat_number}</td>
                      <td className="py-2 px-3 align-top"><TeamCell team={byLane["C2"]} /></td>
                      <td className="py-2 px-3 align-top"><TeamCell team={byLane["C4"]} /></td>
                      <td className="py-2 px-3 align-top"><TeamCell team={byLane["C6"]} /></td>
                      <td className="py-2 px-3 align-top">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right align-top">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => setEditingHeat(heat)}
                            className="h-7 text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={disabled}
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
          <p className="text-xs text-zinc-500">Deja vacío un carril si no corre nadie en él</p>
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
              title="Eliminar fila"
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
            onClick={handleSave}
            disabled={loading}
            className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
          >
            {loading ? "Guardando..." : "Guardar fixture"}
          </Button>
        </div>
      </div>

      {/* Edit modal */}
      <EditVelocityModal
        heat={editingHeat}
        teams={teams}
        onClose={() => setEditingHeat(null)}
      />

      {/* Delete confirm modal */}
      <DeleteHeatModal
        heat={deletingHeat}
        onClose={() => setDeletingHeat(null)}
      />
    </div>
  );
}

// ── Versatility ───────────────────────────────────────────────────────────────

function VersatilityFixture({ teams, heats }: { teams: Team[]; heats: Heat[] }) {
  const [rows, setRows] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [editingHeat, setEditingHeat] = useState<Heat | null>(null);
  const [deletingHeat, setDeletingHeat] = useState<Heat | null>(null);

  const startHeatNum = heats.length > 0
    ? Math.max(...heats.map((h) => h.heat_number)) + 1
    : 1;

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
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                  <th className="py-2 px-3 text-right text-zinc-400 font-medium w-32">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const team = heat.heat_assignments[0]?.teams;
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  const disabled = heat.status === "active";
                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-3 font-bold text-yellow-400 align-top">M{heat.heat_number}</td>
                      <td className="py-2 px-3 align-top"><TeamCell team={team} /></td>
                      <td className="py-2 px-3 align-top">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right align-top">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => setEditingHeat(heat)}
                            className="h-7 text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={disabled}
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
            <Select
              value={teamId || "none"}
              onValueChange={(v) => {
                const updated = [...rows];
                updated[i] = v === "none" ? "" : v;
                setRows(updated);
              }}
            >
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
            onClick={handleSave}
            disabled={loading}
            className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
          >
            {loading ? "Guardando..." : "Guardar fixture"}
          </Button>
        </div>
      </div>

      <EditVersatilityModal
        heat={editingHeat}
        teams={teams}
        onClose={() => setEditingHeat(null)}
      />
      <DeleteHeatModal
        heat={deletingHeat}
        onClose={() => setDeletingHeat(null)}
      />
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function EditVelocityModal({
  heat,
  teams,
  onClose,
}: {
  heat: Heat | null;
  teams: Team[];
  onClose: () => void;
}) {
  const [c2, setC2] = useState("");
  const [c4, setC4] = useState("");
  const [c6, setC6] = useState("");
  const [loading, setLoading] = useState(false);

  // Cuando se abre, pre-llena con las asignaciones actuales
  useStateInit(heat, () => {
    if (!heat) return;
    const byLane: Record<string, string> = {};
    for (const a of heat.heat_assignments) {
      if (a.lane && a.team_id) byLane[a.lane] = a.team_id;
    }
    setC2(byLane["C2"] ?? "");
    setC4(byLane["C4"] ?? "");
    setC6(byLane["C6"] ?? "");
  });

  async function handleSave() {
    if (!heat) return;
    const assignments: { team_id: string; lane: Lane }[] = [];
    if (c2 && c2 !== "none") assignments.push({ team_id: c2, lane: "C2" });
    if (c4 && c4 !== "none") assignments.push({ team_id: c4, lane: "C4" });
    if (c6 && c6 !== "none") assignments.push({ team_id: c6, lane: "C6" });

    setLoading(true);
    const result = await updateVelocityHeat(heat.id, assignments);
    if (result?.error) toast.error(result.error);
    else { toast.success(`M${heat.heat_number} actualizada`); onClose(); }
    setLoading(false);
  }

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar manga M{heat?.heat_number} — Velocidad</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Cambia los equipos de cada carril. Selecciona &quot;Sin equipo&quot; para dejar un carril vacío.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {(["C2", "C4", "C6"] as const).map((lane) => {
            const value = lane === "C2" ? c2 : lane === "C4" ? c4 : c6;
            const setter = lane === "C2" ? setC2 : lane === "C4" ? setC4 : setC6;
            return (
              <div key={lane} className="grid grid-cols-[5rem_1fr] gap-3 items-center">
                <label className="text-zinc-400 text-sm">Carril {lane.slice(1)}</label>
                <Select value={value || "none"} onValueChange={(v) => setter(v === "none" ? "" : v)}>
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
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditVersatilityModal({
  heat,
  teams,
  onClose,
}: {
  heat: Heat | null;
  teams: Team[];
  onClose: () => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false);

  useStateInit(heat, () => {
    if (!heat) return;
    setTeamId(heat.heat_assignments[0]?.team_id ?? "");
  });

  async function handleSave() {
    if (!heat) return;
    if (!teamId || teamId === "none") { toast.error("Selecciona un equipo"); return; }
    setLoading(true);
    const result = await updateVersatilityHeat(heat.id, teamId);
    if (result?.error) toast.error(result.error);
    else { toast.success(`M${heat.heat_number} actualizada`); onClose(); }
    setLoading(false);
  }

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Editar manga M{heat?.heat_number} — Versatilidad</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Cambia el equipo asignado a esta manga.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
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
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-zinc-600 text-zinc-300">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            {loading ? "Guardando..." : "Guardar cambios"}
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
    const result = await deleteHeat(heat.id);
    if (result?.error) toast.error(result.error);
    else { toast.success(`M${heat.heat_number} eliminada`); onClose(); }
    setLoading(false);
  }

  const teamNames = heat?.heat_assignments
    .map((a) => a.teams?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={!!heat} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>¿Eliminar manga M{heat?.heat_number}?</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Esta acción no se puede deshacer.
            {teamNames && <> Se eliminarán las asignaciones de: <span className="text-zinc-200">{teamNames}</span>.</>}
            {heat?.heat_assignments.some((a) => false) /* placeholder for runs check */ && null}
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

// Helper para resetear estado del modal cuando se abre con una manga distinta
function useStateInit(dep: unknown, fn: () => void) {
  useEffect(() => { fn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dep]);
}
