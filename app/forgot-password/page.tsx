"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email) {
      setError("Por favor, digite seu email.");
      setLoading(false);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Por favor, digite um email válido.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      if (error) {
        console.error("Reset password error:", error);
        if (error.message.includes("rate limit")) {
          setError("Muitas tentativas. Tente novamente em alguns minutos.");
        } else if (error.message.includes("not found")) {
          setError("Email não encontrado em nosso sistema.");
        } else {
          setError("Erro ao enviar email de recuperação. Tente novamente.");
        }
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <Logo className="h-16 w-auto" />
            </div>
            <div>
              <CardTitle className="text-2xl flex items-center justify-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Email Enviado
              </CardTitle>
              <CardDescription>Verifique sua caixa de entrada</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="success">
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Enviamos um link de recuperação de senha para{" "}
                <strong>{email}</strong>. Verifique sua caixa de entrada e spam.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                O link expira em 1 hora. Se não receber o email, você pode
                tentar novamente.
              </p>

              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setSuccess(false);
                    setEmail("");
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar Novamente
                </Button>

                <Button asChild variant="ghost" className="w-full">
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao Login
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-12 sm:h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl">
              Esqueci a Senha
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Digite seu email para receber um link de recuperação
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar Link de Recuperação
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Lembrou da senha?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Voltar ao login
              </Link>
            </p>

            <p className="text-sm text-muted-foreground">
              Não tem uma conta?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                Criar conta
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
