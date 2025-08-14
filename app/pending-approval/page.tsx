"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { createClient } from "@/utils/supabase/client";
import { useApprovalSubscription } from "@/hooks/useApprovalSubscription";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Mail, Shield, LogOut, RefreshCw } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function PendingApprovalPage() {
  const { user, signOut, loading, isApproved, refreshApprovalStatus } =
    useAuth();
  const router = useRouter();
  const [checkingApproval, setCheckingApproval] = useState(false);
  const supabase = createClient();

  // Use real-time subscription for approval changes
  useApprovalSubscription();

  // Check if user is approved and redirect
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Redirect to dashboard if user is approved
  useEffect(() => {
    if (isApproved === true) {
      router.push("/dashboard");
    }
  }, [isApproved, router]);

  // Set up periodic checking for approval status
  useEffect(() => {
    if (!user?.id) return;

    const checkApprovalStatus = async () => {
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("approved")
          .eq("id", user.id)
          .single();

        if (profile?.approved) {
          // User has been approved, redirect to dashboard
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("Error checking approval status:", error);
      }
    };

    // Check immediately
    checkApprovalStatus();

    // Set up interval to check every 5 seconds
    const interval = setInterval(checkApprovalStatus, 5000);

    return () => clearInterval(interval);
  }, [user?.id, router, supabase]);

  const handleManualCheck = async () => {
    if (!user?.id) return;

    setCheckingApproval(true);
    try {
      await refreshApprovalStatus();
      // The useEffect will handle the redirect if approved
    } catch (error) {
      console.error("Error checking approval status:", error);
    } finally {
      setCheckingApproval(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Clock className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-semibold">
            Aguardando Aprovação
          </CardTitle>
          <CardDescription>
            Sua conta foi criada com sucesso e seu email foi confirmado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{user.email}</span>
            </div>

            <div className="bg-accent border border-border rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-left">
                  <h3 className="text-sm font-medium text-foreground">
                    Próximo passo
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Um administrador precisa aprovar seu acesso ao dashboard.
                    Caso esteja demorando demais para isso acontecer entre em
                    contato via email no contato@hudlab.com.br
                  </p>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>
                Se você acredita que isso é um erro ou tem dúvidas, entre em
                contato com o administrador do sistema.
              </p>
            </div>

            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualCheck}
                disabled={checkingApproval}
                className="text-xs"
              >
                {checkingApproval ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-2" />
                )}
                Verificar aprovação
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
