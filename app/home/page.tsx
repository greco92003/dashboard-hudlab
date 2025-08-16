"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Mail, Lock, LogIn, CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import HeroImage from "@/components/HeroImage";

function HomeLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    signIn,
    isAuthenticated,
    isApproved,
    loading: authLoading,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for success message from URL params
  useEffect(() => {
    const message = searchParams.get("message");
    if (message) {
      setSuccess(message);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isApproved) {
        router.push("/dashboard");
      } else {
        router.push("/pending-approval");
      }
    }
  }, [isAuthenticated, isApproved, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Por favor, preencha todos os campos.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await signIn(email, password);

      if (error) {
        setError("Email ou senha incorretos. Tente novamente.");
        setLoading(false);
      } else {
        // Don't redirect immediately, let the useEffect handle it
        // The AuthContext will update and trigger the redirect
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <HeroImage />
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Logo and title */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Logo className="h-16 sm:h-20 w-auto" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Bem-vindo à HUD LAB
              </h1>
              <p className="text-muted-foreground mt-2">
                Faça login para acessar seu dashboard
              </p>
            </div>
          </div>

          {/* Login Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Entrar</CardTitle>
              <CardDescription>
                Digite suas credenciais para acessar o sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
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

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                      Entrando...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Entrar
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Esqueceu sua senha?{" "}
                  <Link
                    href="/forgot-password"
                    className="font-medium text-primary hover:underline"
                  >
                    Recuperar senha
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

          {/* Footer links */}
          <div className="text-center space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center text-sm text-muted-foreground">
              <Link
                href="/privacy-policy"
                className="hover:text-primary hover:underline"
              >
                Política de Privacidade
              </Link>
              <span className="hidden sm:inline">•</span>
              <Link
                href="/terms-of-service"
                className="hover:text-primary hover:underline"
              >
                Termos de Uso
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2025 HUD LAB. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <HomeLoginForm />
    </Suspense>
  );
}
