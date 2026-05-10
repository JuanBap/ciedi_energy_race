"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { SessionPayload } from "@/lib/session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/teams", label: "Equipos" },
  { href: "/admin/fixtures", label: "Fixtures" },
  { href: "/admin/scores", label: "Notas" },
  { href: "/admin/heats", label: "Mangas" },
  { href: "/admin/runs", label: "Tiempos" },
  { href: "/admin/users", label: "Operadores" },
];

export default function AdminNav({ profile }: { profile: SessionPayload }) {
  const pathname = usePathname();

  return (
    <header className="bg-zinc-900 border-b border-zinc-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <span className="font-bold text-yellow-400 text-sm whitespace-nowrap">
          E5 Race
        </span>
        <nav className="flex gap-1 overflow-x-auto flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors",
                pathname === item.href
                  ? "bg-yellow-400 text-black font-medium"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/live"
            target="_blank"
            className="text-xs text-zinc-400 hover:text-white"
          >
            Ver Live
          </Link>
          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white text-xs"
            >
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
