"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  setEventStatus,
  publishResults,
  hideResults,
  revealNextPodium,
  resetPodiumReveal,
} from "@/app/actions/heats";
import { toast } from "sonner";

interface Props {
  currentStatus: "draft" | "active" | "finished";
  resultsPublished: boolean;
  podiumStep: number;
}

// Etiquetas de los 6 pasos de revelación
const PODIUM_LABELS = [
  "Revelar 3° Pushcarts",
  "Revelar 2° Pushcarts",
  "Revelar 1° Pushcarts 🏆",
  "Revelar 3° HPV's",
  "Revelar 2° HPV's",
  "Revelar 1° HPV's 🏆",
];

export default function EventStatusControl({ currentStatus, resultsPublished, podiumStep }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleStatus(status: "draft" | "active" | "finished") {
    setLoading(true);
    const r = await setEventStatus(status);
    if (r?.error) toast.error(r.error);
    else toast.success(`Evento marcado como ${status}`);
    setLoading(false);
  }

  async function handlePublish() {
    setLoading(true);
    const r = await publishResults();
    if (r?.error) toast.error(r.error);
    else toast.success("Resultados publicados — listo para revelar el podio");
    setLoading(false);
  }

  async function handleHide() {
    if (!confirm("¿Ocultar resultados al público? Volverá a aparecer el mensaje de suspense.")) return;
    setLoading(true);
    const r = await hideResults();
    if (r?.error) toast.error(r.error);
    else toast.success("Resultados ocultos");
    setLoading(false);
  }

  async function handleRevealNext() {
    setLoading(true);
    const r = await revealNextPodium();
    if (r?.error) toast.error(r.error);
    else toast.success(PODIUM_LABELS[podiumStep] ?? "Podio revelado");
    setLoading(false);
  }

  async function handleResetPodium() {
    setLoading(true);
    const r = await resetPodiumReveal();
    if (r?.error) toast.error(r.error);
    else toast.success("Podio reiniciado (todas las tarjetas dadas vuelta)");
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Estado del evento */}
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium mb-2">Estado del evento</p>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || currentStatus === "draft"}
            onClick={() => handleStatus("draft")}
            className="border-zinc-600 text-zinc-300"
          >
            Borrador
          </Button>
          <Button
            size="sm"
            disabled={loading || currentStatus === "active"}
            onClick={() => handleStatus("active")}
            className="bg-green-700 hover:bg-green-600 text-white"
          >
            Activar Evento
          </Button>
          <Button
            size="sm"
            disabled={loading || currentStatus === "finished"}
            onClick={() => handleStatus("finished")}
            className="bg-blue-700 hover:bg-blue-600 text-white"
          >
            Finalizar Competencia
          </Button>
        </div>
      </div>

      {/* Publicación de resultados */}
      <div className="rounded-lg border border-yellow-700/40 bg-yellow-900/5 p-4">
        <p className="text-yellow-400 text-xs uppercase tracking-wider font-bold mb-2">
          Publicación de resultados (/scores)
        </p>
        <p className="text-zinc-400 text-xs mb-3">
          {!resultsPublished
            ? "El público ve un mensaje de suspense. Cuando publiques, comienzas con el podio de Pushcarts."
            : podiumStep === 0
            ? "Resultados publicados. Las tarjetas de Pushcarts están de espaldas. Comienza revelando el 3er puesto."
            : podiumStep < 3
            ? `Pushcarts: ${podiumStep} de 3 puestos revelados. Continúa.`
            : podiumStep === 3
            ? "🎉 Pushcarts completo. Ahora comienza con HPV's: revela el 3er puesto."
            : podiumStep < 6
            ? `HPV's: ${podiumStep - 3} de 3 puestos revelados. Continúa.`
            : "🏆 Ambos podios revelados. Las tablas de puntajes ya son visibles."}
        </p>

        {/* Indicador visual del progreso */}
        {resultsPublished && (
          <div className="flex items-center gap-4 mb-3 text-xs">
            <CategoryProgress label="Pushcarts" current={Math.min(podiumStep, 3)} />
            <CategoryProgress label="HPV's" current={Math.max(0, podiumStep - 3)} />
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!resultsPublished ? (
            <Button
              size="sm"
              disabled={loading}
              onClick={handlePublish}
              className="bg-yellow-400 text-black hover:bg-yellow-300 font-bold"
            >
              🎬 Publicar resultados
            </Button>
          ) : (
            <>
              {podiumStep < 6 && (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={handleRevealNext}
                  className="bg-yellow-400 text-black hover:bg-yellow-300 font-bold"
                >
                  🎉 {PODIUM_LABELS[podiumStep]}
                </Button>
              )}
              {podiumStep > 0 && (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={handleResetPodium}
                  variant="outline"
                  className="border-zinc-600 text-zinc-300"
                >
                  ↺ Reiniciar podio
                </Button>
              )}
              <Button
                size="sm"
                disabled={loading}
                onClick={handleHide}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-900/30"
              >
                🙈 Ocultar resultados
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryProgress({ label, current }: { label: string; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-400 font-medium">{label}:</span>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-2 h-2 rounded-full ${
            current >= n ? "bg-yellow-400" : "bg-zinc-700"
          }`}
        />
      ))}
      <span className="text-zinc-500 text-[10px] tabular-nums">{current}/3</span>
    </div>
  );
}
