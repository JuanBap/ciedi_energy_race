"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createOperator, assignUserToEvent, deleteOperator } from "@/app/actions/users";
import { toast } from "sonner";
import type { UserRole, TestType, Lane } from "@/types/database";

interface UserAssignment {
  test_type: TestType;
  lane: Lane | null;
}

interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  user_assignments: UserAssignment[];
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-purple-700",
  timer: "bg-blue-700",
  judge: "bg-green-700",
};

export default function UsersManager({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const result = await createOperator(
      fd.get("email") as string,
      fd.get("password") as string,
      fd.get("role") as UserRole,
      fd.get("fullName") as string
    );
    if (result?.error) toast.error(result.error);
    else { toast.success("Operador creado"); setOpen(false); }
    setLoading(false);
  }

  async function handleAssign(e: React.FormEvent<HTMLFormElement>, userId: string) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const lane = fd.get("lane") as Lane | null;
    const result = await assignUserToEvent(
      userId,
      fd.get("testType") as TestType,
      lane || null
    );
    if (result?.error) toast.error(result.error);
    else { toast.success("Asignación guardada"); setAssignOpen(null); }
    setLoading(false);
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`¿Eliminar operador ${email}?`)) return;
    const result = await deleteOperator(id);
    if (result?.error) toast.error(result.error);
    else toast.success("Operador eliminado");
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-yellow-400 text-black hover:bg-yellow-300 font-medium">
            + Nuevo Operador
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Crear Operador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Nombre completo</Label>
              <Input name="fullName" required className="bg-zinc-800 border-zinc-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Email</Label>
              <Input name="email" type="email" required className="bg-zinc-800 border-zinc-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Contraseña</Label>
              <Input name="password" type="password" required minLength={6} className="bg-zinc-800 border-zinc-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Rol</Label>
              <Select name="role" defaultValue="timer" required>
                <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="timer" className="text-white">Cronometrista</SelectItem>
                  <SelectItem value="judge" className="text-white">Juez</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
            >
              {loading ? "Creando..." : "Crear Operador"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-zinc-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-700">
              <TableHead className="text-zinc-400">Nombre</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Rol</TableHead>
              <TableHead className="text-zinc-400">Asignación</TableHead>
              <TableHead className="text-zinc-400 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  No hay operadores registrados
                </TableCell>
              </TableRow>
            )}
            {profiles.map((p) => (
              <TableRow key={p.id} className="border-zinc-700">
                <TableCell className="text-white">{p.full_name ?? "—"}</TableCell>
                <TableCell className="text-zinc-300 text-sm">{p.email}</TableCell>
                <TableCell>
                  <Badge className={`${ROLE_COLORS[p.role]} text-white text-xs capitalize`}>
                    {p.role === "timer" ? "Cronometrista" : "Juez"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-zinc-300">
                  {p.user_assignments?.map((ua, i) => (
                    <span key={i} className="text-xs">
                      {ua.test_type}{ua.lane ? ` (${ua.lane})` : ""}
                    </span>
                  )) ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Dialog
                      open={assignOpen === p.id}
                      onOpenChange={(o) => setAssignOpen(o ? p.id : null)}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-zinc-600 text-zinc-300 h-7 text-xs"
                        onClick={() => setAssignOpen(p.id)}
                      >
                        Asignar
                      </Button>
                      <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
                        <DialogHeader>
                          <DialogTitle>Asignar {p.full_name ?? p.email}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={(e) => handleAssign(e, p.id)} className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-zinc-300">Prueba</Label>
                            <Select name="testType" defaultValue="velocity" required>
                              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700">
                                <SelectItem value="velocity" className="text-white">Velocidad</SelectItem>
                                <SelectItem value="versatility" className="text-white">Versatilidad</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {p.role === "timer" && (
                            <div className="space-y-2">
                              <Label className="text-zinc-300">Carril (solo velocidad)</Label>
                              <Select name="lane" defaultValue="">
                                <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                                  <SelectValue placeholder="Sin carril" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700">
                                  <SelectItem value="" className="text-zinc-400">Sin carril</SelectItem>
                                  <SelectItem value="C2" className="text-white">C2</SelectItem>
                                  <SelectItem value="C4" className="text-white">C4</SelectItem>
                                  <SelectItem value="C6" className="text-white">C6</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
                          >
                            {loading ? "Guardando..." : "Guardar Asignación"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleDelete(p.id, p.email)}
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
    </div>
  );
}
