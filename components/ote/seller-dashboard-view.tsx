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
import { CommissionCard } from "./commission-card";
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
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
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <DollarSign className="h-6 w-6" />
                Dashboard de {dashboard.seller.seller_name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {MONTH_NAMES[currentMonth]} de {currentYear}
              </p>
            </div>
          </div>

          {/* Alerta se não houver meta */}
          {!dashboard.monthly_target && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Meta não definida</AlertTitle>
              <AlertDescription>
                Não há meta definida para este mês.
              </AlertDescription>
            </Alert>
          )}

          {/* Cards de Comissão do Mês Atual */}
          {dashboard.current_month && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Desempenho do Mês Atual</h3>
              <CommissionCard data={dashboard.current_month} />
            </div>
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
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  Histórico de Comissões
                </h3>
                <CommissionHistoryComponent
                  history={dashboard.previous_months}
                />
              </div>
            )}

          {/* Informações do Vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>Informações do Vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome:</span>
                <span className="font-semibold">
                  {dashboard.seller.seller_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salário Fixo:</span>
                <span className="font-semibold">
                  R${" "}
                  {dashboard.seller.salary_fixed.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  % de Comissão Base:
                </span>
                <span className="font-semibold">
                  {dashboard.seller.commission_percentage}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold">
                  {dashboard.seller.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              {config && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tráfego Pago:</span>
                    <span className="font-semibold">
                      {config.paid_traffic_percentage}%
                    </span>
                  </div>
                  <div className="flex justify-between">
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
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecione um vendedor para visualizar seu dashboard</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
