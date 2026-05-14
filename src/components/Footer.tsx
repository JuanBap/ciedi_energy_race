import Image from "next/image";

/**
 * Footer reutilizable con los dos logos: E5 a la izquierda, CIEDI a la derecha.
 * Mantiene branding consistente en todas las rutas de la app.
 */
export default function Footer() {
  return (
    <footer className="bg-zinc-950 border-t border-zinc-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4">
        <Image
          src="/e5-logo.jpg"
          alt="E5 Energy Race 2026"
          width={120}
          height={40}
          className="h-6 sm:h-7 w-auto object-contain shrink-0"
        />
        <p className="text-zinc-600 text-[10px] sm:text-xs text-center hidden sm:block">
          Energy Race 2026 · Sistema de cronometraje
        </p>
        <Image
          src="/ciedi-logo.png"
          alt="CIEDI"
          width={280}
          height={100}
          className="h-7 sm:h-9 w-auto object-contain shrink-0"
        />
      </div>
    </footer>
  );
}
