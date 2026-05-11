"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setHeatStatus } from "@/app/actions/heats";
import { toast } from "sonner";
import { formatTimePrecise } from "@/lib/utils";

const EVENT_ID = "00000000-0000-0000-0000-000000000001";

interface Run {
  id: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
  penalty_versatility_count_out: number;
  penalty_versatility_count_crash: number;
  penalty_versatility_count_cut: number;
  status: string;
}

interface HeatAssignment {
  id: string;
  lane: string | null;
  teams: { id: string; name: string; school: string; color_hex: string } | null;
  runs: Run[];
}

interface Heat {
  id: string;
  test_type: string;
  heat_number: number;
  status: string;
  heat_assignments: HeatAssignment[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-700 text-zinc-300",
  active: "bg-green-700 text-white",
  finished: "bg-blue-700 text-white",
  failed: "bg-red-700 text-white",
};

export default function HeatsManager({ heats: initialHeats }: { heats: Heat[] }) {
  const [heats, setHeats] = useState<Heat[]>(initialHeats);
  const [connected, setConnected] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("heats")
      .select(`
        *,
        heat_assignments(
          *,
          teams(id, name, school, color_hex),
          runs(*)
        )
      `)
      .eq("event_id", EVENT_ID)
      .order("test_type")
      .order("heat_number");
    if (data) setHeats(data);
  }, []);

  useEffect(() => { setHeats(initialHeats); }, [initialHeats]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-heats")
      .on("postgres_changes", { event: "*", schema: "public", table: "heats" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "heat_assignments" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, refetch)
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const velocityHeats = heats.filter((h) => h.test_type === "velocity");
  const versatilityHeats = heats.filter((h) => h.test_type === "versatility");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
        <span>{connected ? "Sincronizado en vivo" : "Conectando…"}</span>
      </div>
      <Tabs defaultValue="velocity">
        <TabsList className="bg-zinc-800 border border-zinc-700">
          <TabsTrigger value="velocity" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
            Velocidad ({velocityHeats.length})
          </TabsTrigger>
          <TabsTrigger value="versatility" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black">
            Versatilidad ({versatilityHeats.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="velocity">
          <HeatList heats={velocityHeats} />
        </TabsContent>
        <TabsContent value="versatility">
          <HeatList heats={versatilityHeats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeatList({ heats }: { heats: Heat[] }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleStatus(heatId: string, status: "pending" | "active" | "finished" | "failed") {
    setLoading(heatId);
    const result = await setHeatStatus(heatId, status);
    if (result?.error) toast.error(result.error);
    else toast.success(`Manga actualizada: ${status}`);
    setLoading(null);
  }

  if (heats.length === 0) {
    return <p className="text-zinc-500 text-center py-8">No hay mangas cargadas.</p>;
  }

  return (
    <div className="space-y-3 mt-4">
      {heats.map((heat) => (
        <div key={heat.id} className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-lg">
                Manga {heat.heat_number}
              </span>
              <Badge className={`${STATUS_COLORS[heat.status]} capitalize text-xs`}>
                {heat.status}
              </Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                disabled={loading === heat.id || heat.status === "active"}
                onClick={() => handleStatus(heat.id, "active")}
                className="bg-green-700 hover:bg-green-600 text-white h-7 text-xs"
              >
                Activar
              </Button>
              <Button
                size="sm"
                disabled={loading === heat.id || heat.status === "finished"}
                onClick={() => handleStatus(heat.id, "finished")}
                className="bg-blue-700 hover:bg-blue-600 text-white h-7 text-xs"
              >
                Finalizar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={loading === heat.id || heat.status === "failed"}
                onClick={() => handleStatus(heat.id, "failed")}
                className="h-7 text-xs"
              >
                Marcar fallida
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {heat.heat_assignments.map((ha) => {
              const run = ha.runs?.[0];
              const penaltyMs = run?.has_penalty_velocity ? 10000 : 0;
              const totalMs = run?.time_ms != null ? run.time_ms + penaltyMs : null;

              return (
                <div
                  key={ha.id}
                  className="flex items-center gap-2 bg-zinc-800 rounded p-2"
                >
                  {ha.teams && (
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: ha.teams.color_hex }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {ha.teams?.name ?? "—"}
                    </p>
                    {ha.lane && (
                      <p className="text-yellow-400 text-xs font-mono">{ha.lane}</p>
                    )}
                  </div>
                  <div className="text-right text-sm font-mono">
                    {totalMs != null ? (
                      <span className={`${run?.has_penalty_velocity ? "text-red-400" : "text-green-400"}`}>
                        {formatTimePrecise(totalMs)}
                        {run?.has_penalty_velocity && " +10s"}
                      </span>
                    ) : (
                      <span className="text-zinc-500">pendiente</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
