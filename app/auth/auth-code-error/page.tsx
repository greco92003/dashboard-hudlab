"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Logo } from "@/components/Logo";
import { storage } from "@/lib/storage";

export default function AuthCodeError() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDebug = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth-debug");
      const data = await response.json();
      setDebugInfo(data);
      setShowDebug(true);
    } catch (error) {
      console.error("Debug error:", error);
      setDebugInfo({ error: "Failed to fetch debug info" });
      setShowDebug(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    // Clear any cached auth data
    if (typeof window !== "undefined") {
      storage.clear();
      sessionStorage.clear();
    }
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Erro de Autenticação
            </CardTitle>
            <CardDescription>
              Ocorreu um problema durante o processo de login
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Não foi possível completar o processo de autenticação. Isso pode
              acontecer se o link de confirmação expirou ou já foi usado.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Button onClick={handleRetry} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar Novamente
            </Button>

            <Button variant="outline" asChild className="w-full">
              <Link href="/login">
                <Home className="mr-2 h-4 w-4" />
                Voltar ao Login
              </Link>
            </Button>

            {/* Debug button for production troubleshooting */}
            <Button
              variant="ghost"
              onClick={handleDebug}
              disabled={loading}
              className="w-full text-sm"
            >
              <Bug className="mr-2 h-3 w-3" />
              {loading ? "Carregando..." : "Informações de Debug"}
            </Button>
          </div>

          {/* Debug info display */}
          {showDebug && debugInfo && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <h4 className="text-sm font-medium mb-2">Debug Info:</h4>
              <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(false)}
                className="mt-2 text-xs"
              >
                Fechar
              </Button>
            </div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            <p>
              Se o problema persistir, entre em contato com o suporte técnico.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
