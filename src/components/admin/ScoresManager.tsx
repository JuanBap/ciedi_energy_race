"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { upsertScore } from "@/app/actions/scores";
import { toast } from "sonner";

interface Score {
  design_brief_score: number;
  pitch_score: number;
}

interface Team {
  id: string;
  name: string;
  school: string;
  color_hex: string;
  categories: { name: string; slug: string } | null;
  scores: Score[] | null;
}

export default function ScoresManager({ teams }: { teams: Team[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, { db: number; pitch: number }>>(() => {
    const init: Record<string, { db: number; pitch: number }> = {};
    teams.forEach((t) => {
      const s = t.scores?.[0];
      init[t.id] = { db: s?.design_brief_score ?? 0, pitch: s?.pitch_score ?? 0 };
    });
    return init;
  });

  async function handleSave(teamId: string) {
    const v = values[teamId];
    if (!v) return;
    if (v.db < 0 || v.db > 30 || v.pitch < 0 || v.pitch > 20) {
      toast.error("Valores fuera de rango");
      return;
    }
    setLoading(teamId);
    const result = await upsertScore(teamId, v.db, v.pitch);
    if (result?.error) toast.error(result.error);
    else toast.success("Notas guardadas");
    setLoading(null);
  }

  // Group by category
  const byCategory: Record<string, Team[]> = {};
  teams.forEach((t) => {
    const key = t.categories?.slug ?? "other";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(t);
  });

  return (
    <div className="space-y-8">
      {Object.entries(byCategory).map(([slug, catTeams]) => (
        <div key={slug} className="space-y-3">
          <h2 className="text-lg font-semibold text-yellow-400">
            {catTeams[0].categories?.name ?? slug}
          </h2>
          <div className="space-y-2">
            {catTeams.map((team) => {
              const v = values[team.id] ?? { db: 0, pitch: 0 };
              const total = v.db + v.pitch;
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-4 bg-zinc-900 border border-zinc-700 rounded-lg p-4 flex-wrap"
                >
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: team.color_hex }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{team.name}</p>
                    <p className="text-zinc-400 text-xs">{team.school}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-zinc-400 text-xs whitespace-nowrap">Design Brief (0-30)</label>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={v.db}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [team.id]: { ...prev[team.id], db: Number(e.target.value) },
                          }))
                        }
                        className="w-20 bg-zinc-800 border-zinc-600 text-white text-center h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-zinc-400 text-xs whitespace-nowrap">Pitch (0-20)</label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={v.pitch}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [team.id]: { ...prev[team.id], pitch: Number(e.target.value) },
                          }))
                        }
                        className="w-20 bg-zinc-800 border-zinc-600 text-white text-center h-8"
                      />
                    </div>
                    <Badge variant="outline" className="border-zinc-600 text-zinc-300 w-16 justify-center">
                      {total}/50
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleSave(team.id)}
                      disabled={loading === team.id}
                      className="bg-yellow-400 text-black hover:bg-yellow-300 h-8 text-xs"
                    >
                      {loading === team.id ? "..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {teams.length === 0 && (
        <p className="text-zinc-500 text-center py-8">
          No hay equipos registrados. Crea los equipos primero.
        </p>
      )}
    </div>
  );
}
