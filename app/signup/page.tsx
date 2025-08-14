"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Mail, Lock, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import Link from "next/link";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const { signUp, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!email || !password || !confirmPassword) {
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
      const { error } = await signUp(email, password);

      if (error) {
        console.error("Signup error:", error);
        if (
          error.message.includes("already registered") ||
          error.message.includes("User already registered")
        ) {
          setError("Este email já está cadastrado. Tente fazer login.");
        } else if (
          error.message.includes("invalid email") ||
          error.message.includes("Invalid email")
        ) {
          setError("Email inválido. Verifique o formato do email.");
        } else if (
          error.message.includes("Password should be at least") ||
          error.message.includes("password")
        ) {
          setError("A senha deve ter pelo menos 8 caracteres.");
        } else if (
          error.message.includes("signup") ||
          error.message.includes("disabled")
        ) {
          setError(
            "Cadastro temporariamente desabilitado. Tente novamente mais tarde."
          );
        } else {
          setError(`Erro ao criar conta: ${error.message}`);
        }
      } else {
        setSuccess("Conta criada com sucesso! Redirecionando...");
        // Clear form
        setEmail("");
        setPassword("");
        setConfirmPassword("");

        // Redirect to pending approval page
        setTimeout(() => {
          router.push("/pending-approval");
        }, 1500);
      }
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-12 sm:h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl">Criar Conta</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Preencha os dados para criar sua conta no sistema
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

            {success && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
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
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Confirme sua senha"
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
                  Criando conta...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar Conta
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Fazer login
              </Link>
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center text-xs text-muted-foreground">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
