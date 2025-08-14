"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-6xl font-bold text-muted-foreground mb-2">
              404
            </CardTitle>
            <CardTitle className="text-2xl">Página não encontrada</CardTitle>
            <CardDescription>
              A página que você está procurando não existe ou foi movida.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Ir para o Dashboard
              </Link>
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>

          <div className="text-center pt-4">
            <p className="text-sm text-muted-foreground">
              Se você acredita que isso é um erro, entre em contato com o
              suporte.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
