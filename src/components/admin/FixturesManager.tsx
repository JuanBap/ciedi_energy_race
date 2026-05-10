"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

const LANES: Lane[] = ["C2", "C4", "C6"];

export default function FixturesManager({ teams, velocityHeats, versatilityHeats }: Props) {
  return (
    <Tabs defaultValue="velocity">
      <TabsList className="bg-zinc-800 border border-zinc-700">
        <TabsTrigger value="velocity" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
          Velocidad
        </TabsTrigger>
        <TabsTrigger value="versatility" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
          Versatilidad
        </TabsTrigger>
      </TabsList>

      <TabsContent value="velocity">
        <VelocityFixture teams={teams} heats={velocityHeats} />
      </TabsContent>

      <TabsContent value="versatility">
        <VersatilityFixture teams={teams} heats={versatilityHeats} />
      </TabsContent>
    </Tabs>
  );
}

function VelocityFixture({ teams, heats }: { teams: Team[]; heats: Heat[] }) {
  const [rows, setRows] = useState<{ teamId: string; heatNum: number; lane: Lane }[]>([]);
  const [loading, setLoading] = useState(false);

  function addRow() {
    setRows([...rows, { teamId: "", heatNum: 1, lane: "C2" }]);
  }

  function updateRow(i: number, field: string, value: string | number) {
    const updated = [...rows];
    updated[i] = { ...updated[i], [field]: value };
    setRows(updated);
  }

  function removeRow(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }

  async function handleLoad() {
    if (rows.some((r) => !r.teamId)) {
      toast.error("Todos los campos son requeridos");
      return;
    }
    setLoading(true);
    const result = await loadVelocityFixture(
      rows.map((r) => ({ team_id: r.teamId, heat_number: r.heatNum, lane: r.lane }))
    );
    if (result?.error) toast.error(result.error);
    else { toast.success("Fixture de velocidad cargado"); setRows([]); }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar todo el fixture de velocidad?")) return;
    const result = await deleteFixture("velocity");
    if (result?.error) toast.error(result.error);
    else toast.success("Fixture eliminado");
  }

  return (
    <div className="space-y-4 mt-4">
      {heats.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-white">Fixture actual — Velocidad</h3>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="text-xs h-7">
              Limpiar fixture
            </Button>
          </div>
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-700">
                  <TableHead className="text-zinc-400">Manga</TableHead>
                  <TableHead className="text-zinc-400">Carril</TableHead>
                  <TableHead className="text-zinc-400">Equipo</TableHead>
                  <TableHead className="text-zinc-400">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heats.map((heat) =>
                  heat.heat_assignments.map((ha, i) => (
                    <TableRow key={`${heat.id}-${i}`} className="border-zinc-700">
                      <TableCell className="text-white">M{heat.heat_number}</TableCell>
                      <TableCell className="text-yellow-400 font-mono">{ha.lane}</TableCell>
                      <TableCell className="text-zinc-300">{ha.teams?.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs capitalize">
                          {heat.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium text-white">Agregar asignaciones</h3>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <Select value={row.teamId} onValueChange={(v) => updateRow(i, "teamId", v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-48">
                <SelectValue placeholder="Equipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(row.heatNum)}
              onValueChange={(v) => updateRow(i, "heatNum", Number(v))}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Array.from({ length: 14 }, (_, j) => j + 1).map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-white">
                    Manga {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.lane}
              onValueChange={(v) => updateRow(i, "lane", v as Lane)}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {LANES.map((l) => (
                  <SelectItem key={l} value={l} className="text-white">
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeRow(i)}
              className="text-red-400 hover:text-red-300 h-8"
            >
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="border-zinc-600 text-zinc-300"
          >
            + Agregar fila
          </Button>
          {rows.length > 0 && (
            <Button
              size="sm"
              onClick={handleLoad}
              disabled={loading}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              {loading ? "Cargando..." : "Guardar fixture"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function VersatilityFixture({ teams, heats }: { teams: Team[]; heats: Heat[] }) {
  const [rows, setRows] = useState<{ teamId: string; heatNum: number }[]>([]);
  const [loading, setLoading] = useState(false);

  function addRow() {
    setRows([...rows, { teamId: "", heatNum: 1 }]);
  }

  function updateRow(i: number, field: string, value: string | number) {
    const updated = [...rows];
    updated[i] = { ...updated[i], [field]: value };
    setRows(updated);
  }

  async function handleLoad() {
    if (rows.some((r) => !r.teamId)) {
      toast.error("Todos los campos son requeridos");
      return;
    }
    setLoading(true);
    const result = await loadVersatilityFixture(
      rows.map((r) => ({ team_id: r.teamId, heat_number: r.heatNum }))
    );
    if (result?.error) toast.error(result.error);
    else { toast.success("Fixture de versatilidad cargado"); setRows([]); }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar todo el fixture de versatilidad?")) return;
    const result = await deleteFixture("versatility");
    if (result?.error) toast.error(result.error);
    else toast.success("Fixture eliminado");
  }

  return (
    <div className="space-y-4 mt-4">
      {heats.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-white">Fixture actual — Versatilidad</h3>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="text-xs h-7">
              Limpiar fixture
            </Button>
          </div>
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-700">
                  <TableHead className="text-zinc-400">Manga</TableHead>
                  <TableHead className="text-zinc-400">Equipo</TableHead>
                  <TableHead className="text-zinc-400">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heats.map((heat) =>
                  heat.heat_assignments.map((ha, i) => (
                    <TableRow key={`${heat.id}-${i}`} className="border-zinc-700">
                      <TableCell className="text-white">M{heat.heat_number}</TableCell>
                      <TableCell className="text-zinc-300">{ha.teams?.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs capitalize">
                          {heat.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium text-white">Agregar asignaciones</h3>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Select value={row.teamId} onValueChange={(v) => updateRow(i, "teamId", v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-48">
                <SelectValue placeholder="Equipo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(row.heatNum)}
              onValueChange={(v) => updateRow(i, "heatNum", Number(v))}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Array.from({ length: 20 }, (_, j) => j + 1).map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-white">
                    Manga {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              className="text-red-400 hover:text-red-300 h-8"
            >
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="border-zinc-600 text-zinc-300"
          >
            + Agregar fila
          </Button>
          {rows.length > 0 && (
            <Button
              size="sm"
              onClick={handleLoad}
              disabled={loading}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              {loading ? "Cargando..." : "Guardar fixture"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
