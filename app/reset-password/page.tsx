"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const validateToken = async () => {
      try {
        // Check if we have the necessary URL parameters for password reset
        const accessToken = searchParams.get("access_token");
        const refreshToken = searchParams.get("refresh_token");
        const type = searchParams.get("type");

        if (type === "recovery" && accessToken && refreshToken) {
          // Set the session with the tokens from the URL
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error("Error setting session:", error);
            setError("Link de recuperação inválido ou expirado.");
            setTokenValid(false);
          } else {
            setTokenValid(true);
          }
        } else {
          // Check if user already has a valid session (came from callback)
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (session && !error) {
            setTokenValid(true);
          } else {
            setError("Link de recuperação inválido ou expirado.");
            setTokenValid(false);
          }
        }
      } catch (err) {
        console.error("Error validating token:", err);
        setError("Erro ao validar link de recuperação.");
        setTokenValid(false);
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [searchParams, supabase.auth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!password || !confirmPassword) {
      setError("Por favor, preencha todos os campos.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error("Update password error:", error);
        if (error.message.includes("session")) {
          setError("Sessão expirada. Solicite um novo link de recuperação.");
        } else {
          setError("Erro ao atualizar senha. Tente novamente.");
        }
      } else {
        setSuccess(true);
        // Redirect to login immediately
        router.push("/login?message=Senha atualizada com sucesso");
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Show loading while validating token
  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">
            Validando link de recuperação...
          </p>
        </div>
      </div>
    );
  }

  // Show error if token is invalid
  if (!tokenValid) {
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
                Link Inválido
              </CardTitle>
              <CardDescription>
                O link de recuperação não é válido
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error || "O link de recuperação é inválido ou expirou."}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/forgot-password">Solicitar Novo Link</Link>
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Voltar ao Login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show success message
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
                Senha Atualizada
              </CardTitle>
              <CardDescription>
                Sua senha foi alterada com sucesso
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Sua senha foi atualizada com sucesso. Você será redirecionado
                para a página de login em alguns segundos.
              </AlertDescription>
            </Alert>

            <Button asChild className="w-full">
              <Link href="/login">Ir para Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show password reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-12 sm:h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl">Nova Senha</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Digite sua nova senha
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
              <Label htmlFor="password">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                <PasswordInput
                  id="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                  required
                />
              </div>
              <PasswordRequirements password={password} showOnlyLength />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Digite a senha novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Atualizando...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Atualizar Senha
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Lembrou da senha?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Voltar ao login
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
