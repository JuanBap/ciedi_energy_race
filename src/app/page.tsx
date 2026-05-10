import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-8 p-8">
      <div className="text-center space-y-3">
        <p className="text-sm font-medium tracking-widest text-yellow-400 uppercase">
          CIEDI — E5 Challenge
        </p>
        <h1 className="text-5xl font-bold tracking-tight">Energy Race 2026</h1>
        <p className="text-zinc-400 text-lg">
          Sistema de cronometraje y rankings en tiempo real
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          asChild
          size="lg"
          className="bg-yellow-400 text-black hover:bg-yellow-300 font-bold text-lg px-8"
        >
          <Link href="/live">Ver Scoreboard en Vivo</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="border-zinc-600 text-white hover:bg-zinc-800"
        >
          <Link href="/login">Acceso Operadores</Link>
        </Button>
      </div>
    </main>
  );
}
