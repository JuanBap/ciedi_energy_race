"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadVelocityFixture, loadVersatilityFixture, deleteFixture } from "@/app/actions/fixtures";
import { toast } from "sonner";
import type { Lane } from "@/types/database";

interface Team {
  id: string;
  name: string;
  school: string;
  categories: { slug: string; name: string } | null;
}

interface HeatAssignment {
  team_id: string;
  lane: string | null;
  teams: { name: string; school: string } | null;
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

export default function FixturesManager({ teams, velocityHeats, versatilityHeats }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300 mb-1">¿Cómo funciona?</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><span className="text-white">Velocidad</span> — hasta 3 equipos corren a la vez, uno por carril (C2, C4, C6).</li>
          <li><span className="text-white">Versatilidad</span> — los equipos corren uno a la vez en orden de manga.</li>
          <li>Carga el fixture completo antes del evento. Puedes agregar mangas sin borrar las anteriores.</li>
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

  async function handleDelete() {
    if (!confirm("¿Eliminar todo el fixture de velocidad?")) return;
    const result = await deleteFixture("velocity");
    if (result?.error) toast.error(result.error);
    else toast.success("Fixture eliminado");
  }

  return (
    <div className="space-y-6">
      {heats.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Fixture cargado — Velocidad</h3>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="h-7 text-xs">
              Limpiar todo
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-16">Manga</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">C2</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">C4</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">C6</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const byLane = Object.fromEntries(
                    heat.heat_assignments.map((ha) => [ha.lane, ha.teams?.name ?? "—"])
                  );
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-3 font-bold text-yellow-400">M{heat.heat_number}</td>
                      <td className="py-2 px-3 text-zinc-200">{byLane["C2"] ?? <span className="text-zinc-600">—</span>}</td>
                      <td className="py-2 px-3 text-zinc-200">{byLane["C4"] ?? <span className="text-zinc-600">—</span>}</td>
                      <td className="py-2 px-3 text-zinc-200">{byLane["C6"] ?? <span className="text-zinc-600">—</span>}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {heats.length > 0 ? `Agregar mangas (desde M${startHeatNum})` : "Cargar fixture"}
          </h3>
          <p className="text-xs text-zinc-500">Deja vacío un carril si no corre nadie en él</p>
        </div>

        <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] gap-2 px-1">
          <span className="text-xs font-medium text-zinc-500 self-center">Manga</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril C2</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril C4</span>
          <span className="text-xs font-medium text-zinc-400 text-center">Carril C6</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] gap-2 items-center">
            <span className="text-center text-sm font-bold text-yellow-400">
              M{startHeatNum + i}
            </span>
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
                      {t.name}
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
    </div>
  );
}

// ── Versatility ───────────────────────────────────────────────────────────────

function VersatilityFixture({ teams, heats }: { teams: Team[]; heats: Heat[] }) {
  const [rows, setRows] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
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

  async function handleDelete() {
    if (!confirm("¿Eliminar todo el fixture de versatilidad?")) return;
    const result = await deleteFixture("versatility");
    if (result?.error) toast.error(result.error);
    else toast.success("Fixture eliminado");
  }

  return (
    <div className="space-y-6">
      {heats.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Fixture cargado — Versatilidad</h3>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="h-7 text-xs">
              Limpiar todo
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-16">Manga</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Equipo</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium">Colegio</th>
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium w-28">Estado</th>
                </tr>
              </thead>
              <tbody>
                {heats.map((heat) => {
                  const s = STATUS_LABEL[heat.status] ?? STATUS_LABEL.pending;
                  return (
                    <tr key={heat.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-3 font-bold text-yellow-400">M{heat.heat_number}</td>
                      <td className="py-2 px-3 text-zinc-200">
                        {heat.heat_assignments[0]?.teams?.name ?? <span className="text-zinc-600">Sin asignar</span>}
                      </td>
                      <td className="py-2 px-3 text-zinc-400 text-xs">
                        {heat.heat_assignments[0]?.teams?.school ?? ""}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.label}
                        </span>
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
            <span className="text-center text-sm font-bold text-yellow-400">
              M{startHeatNum + i}
            </span>
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
                    {t.name}
                    <span className="ml-1 text-xs text-zinc-400">— {t.school}</span>
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
    </div>
  );
}
