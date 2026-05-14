"use client";

import { useState } from "react";
import Image from "next/image";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-zinc-950 p-4">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-sm bg-zinc-900 border-zinc-700">
          <CardHeader className="text-center">
            <Image
              src="/e5-logo.jpg"
              alt="E5 Energy Race 2026"
              width={400}
              height={130}
              className="w-full h-auto object-contain mb-2"
              priority
            />
            <CardTitle className="text-zinc-300 text-xl">Acceso Operadores</CardTitle>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
                placeholder="operador@ciedi.edu.co"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Contraseña
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-300 font-bold"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
        </Card>
      </div>
      <Footer />
    </main>
  );
}
