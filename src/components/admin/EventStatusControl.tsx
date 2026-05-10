"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setEventStatus } from "@/app/actions/heats";
import { toast } from "sonner";

export default function EventStatusControl({
  currentStatus,
}: {
  currentStatus: "draft" | "active" | "finished";
}) {
  const [loading, setLoading] = useState(false);

  async function handleStatus(status: "draft" | "active" | "finished") {
    setLoading(true);
    const result = await setEventStatus(status);
    if (result?.error) toast.error(result.error);
    else toast.success(`Evento marcado como ${status}`);
    setLoading(false);
  }

  return (
    <div className="flex gap-3 flex-wrap">
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
  );
}
