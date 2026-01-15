"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommissionCard } from "@/components/ote/commission-card";
import { MultiplierTable } from "@/components/ote/multiplier-table";
import { CommissionHistoryComponent } from "@/components/ote/commission-history";
import { OTESellerDashboard, OTEConfig } from "@/types/ote";
import { DollarSign, AlertCircle, Settings, ArrowRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePermissions } from "@/hooks/usePermissions";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function OTEPage() {
  const { isOwnerOrAdmin, loading: permissionsLoading } = usePermissions();
  const [dashboard, setDashboard] = useState<OTESellerDashboard | null>(null);
  const [config, setConfig] = useState<OTEConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotRegistered, setIsNotRegistered] = useState(false);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchDashboard();
    fetchConfig();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/ote/dashboard");

      if (!response.ok) {
        if (response.status === 404) {
          setIsNotRegistered(true);
          setError("Você não está cadastrado no sistema OTE.");
          return;
        }
        throw new Error("Erro ao carregar dashboard");
      }

      const data = await response.json();
      setDashboard(data);
      setError(null);
      setIsNotRegistered(false);
    } catch (err) {
      console.error("Erro ao buscar dashboard:", err);
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/ote/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Erro ao buscar configuração:", err);
    }
  };

  if (loading || permissionsLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard OTE</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Se for admin/owner e não estiver cadastrado como vendedor, mostrar interface de seleção
  if (isNotRegistered && isOwnerOrAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
              Dashboard OTE - Administração
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Visualize os resultados de todos os vendedores
            </p>
          </div>
          <Link href="/ote/admin">
            <Button
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto text-sm"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Painel Admin</span>
              <span className="sm:hidden">Admin</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Modo Administrador</AlertTitle>
          <AlertDescription>
            Você não está cadastrado como vendedor, mas pode visualizar os
            dashboards de todos os vendedores. Use o painel admin para gerenciar
            vendedores, metas e configurações.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">
              Acesse o Painel Admin
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Para visualizar e gerenciar os dashboards dos vendedores, acesse o
              painel administrativo.
            </p>
            <Link href="/ote/admin">
              <Button className="flex items-center gap-2 mx-auto">
                <Settings className="h-4 w-4" />
                Ir para Painel Admin
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se não for admin/owner e não estiver cadastrado, mostrar erro
  if (error && isNotRegistered && !isOwnerOrAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold">Meu Dashboard OTE</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não Cadastrado</AlertTitle>
          <AlertDescription>
            Você não está cadastrado no sistema OTE. Entre em contato com o
            administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Outros erros
  if (error && !isNotRegistered) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold">Meu Dashboard OTE</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="hidden sm:inline">Meu Dashboard OTE</span>
            <span className="sm:hidden">Dashboard OTE</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {MONTH_NAMES[currentMonth]} de {currentYear}
          </p>
        </div>
      </div>

      {/* Alerta se não houver meta */}
      {!dashboard.monthly_target && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm sm:text-base">
            Meta não definida
          </AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">
            Você ainda não possui uma meta definida para este mês. Entre em
            contato com o administrador.
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de Comissão do Mês Atual */}
      {dashboard.current_month && (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-base sm:text-lg font-semibold">
            Desempenho do Mês Atual
          </h2>
          <CommissionCard data={dashboard.current_month} />
        </div>
      )}

      {/* Tabela de Multiplicadores */}
      {config && (
        <MultiplierTable
          multipliers={config.multipliers}
          currentPercentage={dashboard.current_month?.achievement_percentage}
        />
      )}

      {/* Histórico */}
      {dashboard.previous_months && dashboard.previous_months.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-base sm:text-lg font-semibold">
            Histórico de Comissões
          </h2>
          <CommissionHistoryComponent history={dashboard.previous_months} />
        </div>
      )}

      {/* Informações Adicionais */}
      <Card>
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">
            Informações do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs sm:text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Salário Fixo:</span>
            <span className="font-semibold whitespace-nowrap">
              R${" "}
              {dashboard.seller.salary_fixed.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">% de Comissão Base:</span>
            <span className="font-semibold">
              {dashboard.seller.commission_percentage}%
            </span>
          </div>
          {config && (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Tráfego Pago:</span>
                <span className="font-semibold">
                  {config.paid_traffic_percentage}%
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Orgânico:</span>
                <span className="font-semibold">
                  {config.organic_percentage}%
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
