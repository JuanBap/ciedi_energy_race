"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createTeam, updateTeam, deleteTeam } from "@/app/actions/teams";
import { toast } from "sonner";
import type { Team, Category } from "@/types/database";

interface Props {
  teams: (Team & { categories: Category })[];
  categories: Category[];
}

export default function TeamsList({ teams, categories }: Props) {
  const [open, setOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await createTeam(formData);
    if (result?.error) toast.error(result.error);
    else { toast.success("Equipo creado"); setOpen(false); }
    setLoading(false);
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTeam) return;
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateTeam(editTeam.id, formData);
    if (result?.error) toast.error(result.error);
    else { toast.success("Equipo actualizado"); setEditTeam(null); }
    setLoading(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar equipo "${name}"?`)) return;
    const result = await deleteTeam(id);
    if (result?.error) toast.error(result.error);
    else toast.success("Equipo eliminado");
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            + Nuevo Equipo
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Crear Equipo</DialogTitle>
          </DialogHeader>
          <TeamForm
            categories={categories}
            onSubmit={handleCreate}
            loading={loading}
            submitLabel="Crear"
          />
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-zinc-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-700 hover:bg-transparent">
              <TableHead className="text-zinc-400">Color</TableHead>
              <TableHead className="text-zinc-400">Nombre</TableHead>
              <TableHead className="text-zinc-400">Colegio</TableHead>
              <TableHead className="text-zinc-400">Categoría</TableHead>
              <TableHead className="text-zinc-400 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  No hay equipos registrados
                </TableCell>
              </TableRow>
            )}
            {teams.map((team) => (
              <TableRow key={team.id} className="border-zinc-700">
                <TableCell>
                  <div
                    className="w-8 h-8 rounded-full border border-zinc-600"
                    style={{ backgroundColor: team.color_hex }}
                  />
                </TableCell>
                <TableCell className="font-medium text-white">{team.name}</TableCell>
                <TableCell className="text-zinc-300">{team.school}</TableCell>
                <TableCell className="text-zinc-300">{team.categories.name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-600 text-zinc-300 h-7 text-xs"
                      onClick={() => setEditTeam(team)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleDelete(team.id, team.name)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editTeam} onOpenChange={(o) => !o && setEditTeam(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Editar Equipo</DialogTitle>
          </DialogHeader>
          {editTeam && (
            <TeamForm
              categories={categories}
              defaultValues={editTeam}
              onSubmit={handleUpdate}
              loading={loading}
              submitLabel="Guardar"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamForm({
  categories,
  defaultValues,
  onSubmit,
  loading,
  submitLabel,
}: {
  categories: Category[];
  defaultValues?: Team;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-zinc-300">Nombre del equipo</Label>
        <Input
          name="name"
          defaultValue={defaultValues?.name}
          required
          className="bg-zinc-800 border-zinc-600 text-white"
          placeholder="Ej: Turbo Racers"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-zinc-300">Colegio</Label>
        <Input
          name="school"
          defaultValue={defaultValues?.school}
          required
          className="bg-zinc-800 border-zinc-600 text-white"
          placeholder="Ej: CIEDI"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-zinc-300">Categoría</Label>
        <Select name="category_id" defaultValue={defaultValues?.category_id} required>
          <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
            <SelectValue placeholder="Seleccionar categoría" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-white">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-zinc-300">Color del equipo</Label>
        <div className="flex gap-2 items-center">
          <Input
            name="color_hex"
            type="color"
            defaultValue={defaultValues?.color_hex ?? "#FF0000"}
            required
            className="w-14 h-10 p-1 bg-zinc-800 border-zinc-600 cursor-pointer"
          />
          <span className="text-zinc-400 text-sm">Formato #RRGGBB</span>
        </div>
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
      >
        {loading ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}
