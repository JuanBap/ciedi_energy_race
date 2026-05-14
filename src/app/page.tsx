import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-black text-white">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        {/* Logos en la cabecera */}
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <Image
            src="/e5-logo.jpg"
            alt="E5 Energy Race 2026"
            width={200}
            height={70}
            className="h-12 sm:h-16 w-auto object-contain"
            priority
          />
          <div className="w-px h-12 sm:h-14 bg-zinc-700" />
          <Image
            src="/ciedi-logo.jpg"
            alt="CIEDI"
            width={140}
            height={70}
            className="h-12 sm:h-16 w-auto object-contain"
            priority
          />
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Energy Race 2026</h1>
          <p className="text-zinc-400 text-base sm:text-lg">
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
            <Link href="/scores">Ver Puntajes</Link>
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
      </div>
      <Footer />
    </main>
  );
}
