"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UnifiedPerformanceCard } from "./unified-performance-card";
import { MultiplierTable } from "./multiplier-table";
import { CommissionHistoryComponent } from "./commission-history";
import { OTESeller, OTESellerDashboard, OTEConfig } from "@/types/ote";
import { AlertCircle, User, DollarSign } from "lucide-react";

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

interface SellerDashboardViewProps {
  sellers: OTESeller[];
  config: OTEConfig | null;
}

export function SellerDashboardView({
  sellers,
  config,
}: SellerDashboardViewProps) {
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const [dashboard, setDashboard] = useState<OTESellerDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const fetchSellerDashboard = async (sellerId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/ote/dashboard/${sellerId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro na API:", errorData);
        throw new Error(
          errorData.details ||
            errorData.error ||
            "Erro ao carregar dashboard do vendedor"
        );
      }

      const data = await response.json();
      setDashboard(data);
    } catch (err) {
      console.error("Erro ao buscar dashboard:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Erro desconhecido";
      setError(`Erro ao carregar dados do vendedor: ${errorMessage}`);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSellerId) {
      fetchSellerDashboard(selectedSellerId);
    } else {
      setDashboard(null);
    }
  }, [selectedSellerId]);

  const activeSellers = sellers.filter((s) => s.active);

  return (
    <div className="space-y-6">
      {/* Seletor de Vendedor */}
      <Card className="relative z-0">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <User className="h-4 w-4 sm:h-5 sm:w-5" />
            Selecionar Vendedor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha um vendedor para visualizar" />
            </SelectTrigger>
            <SelectContent>
              {activeSellers.map((seller) => (
                <SelectItem key={seller.id} value={seller.id}>
                  {seller.seller_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Dashboard do Vendedor */}
      {!loading && !error && dashboard && (
        <div className="space-y-4 sm:space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold flex items-center gap-2">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                <span className="hidden sm:inline">
                  Dashboard de {dashboard.seller.seller_name}
                </span>
                <span className="sm:hidden">
                  {dashboard.seller.seller_name}
                </span>
              </h2>
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
                Não há meta definida para este mês.
              </AlertDescription>
            </Alert>
          )}

          {/* Card Unificado de Desempenho */}
          {dashboard.current_month && config && (
            <UnifiedPerformanceCard
              data={dashboard.current_month}
              config={config}
            />
          )}

          {/* Tabela de Multiplicadores */}
          {config && (
            <MultiplierTable
              multipliers={config.multipliers}
              currentPercentage={
                dashboard.current_month?.achievement_percentage
              }
            />
          )}

          {/* Histórico */}
          {dashboard.previous_months &&
            dashboard.previous_months.length > 0 && (
              <CommissionHistoryComponent history={dashboard.previous_months} />
            )}

          {/* Informações do Vendedor */}
          <Card>
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">
                Informações do Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Nome:</span>
                <span className="font-semibold text-right">
                  {dashboard.seller.seller_name}
                </span>
              </div>
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
                <span className="text-muted-foreground">
                  % de Comissão Base:
                </span>
                <span className="font-semibold">
                  {dashboard.seller.commission_percentage}%
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold">
                  {dashboard.seller.active ? "Ativo" : "Inativo"}
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
      )}

      {/* Mensagem quando nenhum vendedor está selecionado */}
      {!loading && !error && !dashboard && selectedSellerId === "" && (
        <Card>
          <CardContent className="py-8 sm:py-12 text-center text-muted-foreground">
            <User className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-xs sm:text-sm">
              Selecione um vendedor para visualizar seu dashboard
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
