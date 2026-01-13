"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRange } from "react-day-picker";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import Calendar23 from "@/components/calendar-23";
import {
  TrendingUp,
  Eye,
  MousePointer,
  DollarSign,
  Target,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  FileText,
  Info,
  Link,
  Play,
  TrendingDown,
  Users,
  ShoppingBag,
  BarChart3,
} from "lucide-react";

interface AccountData {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent: string;
}

interface BasicInsights {
  impressions: string;
  clicks: string;
  spend: string;
  cpm: string;
  cpc: string;
  ctr: string;
}

interface AdData {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  campaign_name: string;
  campaign_objective: string;
  adset_id: string;
  spend: string;
  cost_per_result: string;
}

interface AdPerformance {
  adId: string;
  adName: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  revenue: number;
  pairsSold: number;
  customersConverted: number;
  roi: number;
  profit: number;
}

interface NonMetaPerformance {
  utmSource: string;
  utmMedium: string;
  revenue: number;
  pairsSold: number;
  customersConverted: number;
  dealsCount: number;
}

interface PerformanceData {
  adsPerformance: AdPerformance[];
  nonMetaPerformance: NonMetaPerformance[];
  summary: {
    totalAdsSpend: number;
    totalRevenue: number;
    totalPairsSold: number;
    totalCustomers: number;
    nonMetaRevenue: number;
    nonMetaPairsSold: number;
  };
}

export default function MetaMarketingPage() {
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [insights, setInsights] = useState<BasicInsights | null>(null);
  const [adsData, setAdsData] = useState<AdData[]>([]);
  const [performanceData, setPerformanceData] =
    useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adsLoading, setAdsLoading] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  const fetchData = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      try {
        setLoading(true);
        setError(null);

        // Buscar dados da conta
        const accountResponse = await fetch("/api/meta-marketing/account");
        if (!accountResponse.ok) {
          throw new Error("Erro ao buscar dados da conta");
        }
        const accountData = await accountResponse.json();
        setAccountData(accountData);

        // Buscar insights básicos
        let insightsUrl = "/api/meta-marketing/insights";

        if (customDateRange?.from && customDateRange?.to) {
          // Use custom date range
          const startDate = customDateRange.from.toISOString().split("T")[0];
          const endDate = customDateRange.to.toISOString().split("T")[0];
          insightsUrl = `/api/meta-marketing/insights?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          // Use period-based filtering
          insightsUrl = `/api/meta-marketing/insights?days=${selectedPeriod}`;
        }

        const insightsResponse = await fetch(insightsUrl);
        if (!insightsResponse.ok) {
          throw new Error("Erro ao buscar insights");
        }
        const insightsData = await insightsResponse.json();
        setInsights(insightsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Handle period change using global hook
  const handlePeriodChangeLocal = async (newPeriod: number) => {
    handlePeriodChange(newPeriod);
    fetchData(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = async (
    newDateRange: DateRange | undefined
  ) => {
    handleDateRangeChange(newDateRange);
    if (newDateRange?.from && newDateRange?.to) {
      fetchData(undefined, newDateRange);
    }
  };

  // Function to fetch active ads
  const fetchAds = useCallback(async () => {
    try {
      setAdsLoading(true);
      const response = await fetch("/api/meta-marketing/ads");
      if (!response.ok) {
        throw new Error("Erro ao buscar anúncios");
      }
      const adsData = await response.json();
      setAdsData(adsData);
    } catch (err) {
      console.error("Erro ao buscar anúncios:", err);
      setAdsData([]);
    } finally {
      setAdsLoading(false);
    }
  }, []);

  // Function to fetch ads performance
  const fetchPerformance = useCallback(
    async (customDateRange?: DateRange) => {
      try {
        setPerformanceLoading(true);

        // Calculate date range
        let startDate: string;
        let endDate: string;

        if (customDateRange?.from && customDateRange?.to) {
          startDate = customDateRange.from.toISOString().split("T")[0];
          endDate = customDateRange.to.toISOString().split("T")[0];
        } else if (dateRange?.from && dateRange?.to) {
          startDate = dateRange.from.toISOString().split("T")[0];
          endDate = dateRange.to.toISOString().split("T")[0];
        } else {
          // Fallback: use period-based date range
          const today = new Date();
          const daysAgo = new Date();
          daysAgo.setDate(today.getDate() - period);
          startDate = daysAgo.toISOString().split("T")[0];
          endDate = today.toISOString().split("T")[0];
        }

        const performanceUrl = `/api/meta-marketing/ads-performance?startDate=${startDate}&endDate=${endDate}`;

        const response = await fetch(performanceUrl);
        if (!response.ok) {
          throw new Error("Erro ao buscar performance dos anúncios");
        }
        const data = await response.json();
        setPerformanceData(data);
      } catch (err) {
        console.error("Erro ao buscar performance:", err);
        setPerformanceData(null);
      } finally {
        setPerformanceLoading(false);
      }
    },
    [dateRange, period]
  );

  // Initialize data based on current global state
  useEffect(() => {
    // Only fetch data after hydration is complete
    if (!isHydrated) {
      console.log("⏳ Meta Marketing: Waiting for hydration...");
      return;
    }

    console.log("✅ Meta Marketing: Hydrated, fetching data...", {
      useCustomPeriod,
      period,
      dateRange,
    });

    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchData(undefined, dateRange);
      fetchPerformance(dateRange);
    } else {
      fetchData(period);
      fetchPerformance();
    }
    // Also fetch ads on initial load
    fetchAds();
  }, [
    period,
    useCustomPeriod,
    dateRange,
    fetchData,
    fetchAds,
    fetchPerformance,
    isHydrated,
  ]);

  const formatCurrency = (value: string | null | undefined) => {
    // Handle null, undefined, empty string, or string representations of null/undefined
    if (
      !value ||
      value === "null" ||
      value === "undefined" ||
      (typeof value === "string" && value.trim() === "")
    ) {
      return "R$ 0,00";
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "R$ 0,00";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  };

  const formatCurrencyAccountTotal = (value: string) => {
    // Divide por 100 para corrigir o valor do total gasto da conta
    const num = parseFloat(value) / 100;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const formatNumber = (value: string) => {
    const num = parseInt(value);
    return new Intl.NumberFormat("pt-BR").format(num);
  };

  const getAccountStatusBadge = (status: number) => {
    switch (status) {
      case 1:
        return (
          <Badge variant="default" className="bg-green-500">
            Ativa
          </Badge>
        );
      case 2:
        return <Badge variant="destructive">Desabilitada</Badge>;
      case 3:
        return <Badge variant="secondary">Não confirmada</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const getAdStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return (
          <Badge variant="default" className="bg-green-500">
            <Play className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case "paused":
        return <Badge variant="secondary">Pausado</Badge>;
      case "archived":
        return <Badge variant="outline">Arquivado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPeriodLabel = () => {
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      const startDate = dateRange.from.toLocaleDateString("pt-BR");
      const endDate = dateRange.to.toLocaleDateString("pt-BR");
      return `${startDate} - ${endDate}`;
    }

    switch (period) {
      case 30:
        return "Último mês";
      case 60:
        return "Últimos 2 meses";
      case 90:
        return "Últimos 3 meses";
      default:
        return `Últimos ${period} dias`;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meta Marketing</h1>
          <p className="text-muted-foreground">
            Dados de anúncios do Facebook e Instagram
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (useCustomPeriod && dateRange?.from && dateRange?.to) {
              fetchData(undefined, dateRange);
              fetchPerformance(dateRange);
            } else {
              fetchData(period);
              fetchPerformance();
            }
            fetchAds();
          }}
          disabled={loading || adsLoading || performanceLoading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${
              loading || adsLoading || performanceLoading ? "animate-spin" : ""
            }`}
          />
          Atualizar
        </Button>
      </div>

      {/* Seletor de Período */}
      <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 mb-4 mt-2 lg:items-center">
        {/* 3 botões de período */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(30)}
            className="text-xs sm:text-sm"
            disabled={loading}
          >
            Último mês
          </Button>
          <Button
            variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(60)}
            className="text-xs sm:text-sm"
            disabled={loading}
          >
            Últimos 2 meses
          </Button>
          <Button
            variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(90)}
            className="text-xs sm:text-sm"
            disabled={loading}
          >
            Últimos 3 meses
          </Button>
        </div>

        {/* Seletor de período personalizado */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Label className="text-sm sm:text-base whitespace-nowrap lg:hidden">
            Período personalizado:
          </Label>
          <div className="w-full sm:min-w-[250px] lg:w-auto">
            <Calendar23
              value={dateRange}
              onChange={handleDateRangeChangeLocal}
              hideLabel
            />
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Account Information - Minimized Button */}
      <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start h-auto p-4"
            disabled={loading}
          >
            <div className="flex items-center gap-3 w-full">
              <Info className="h-5 w-5 text-muted-foreground" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Informações da Conta</span>
                <span className="text-sm text-muted-foreground">
                  {loading
                    ? "Carregando..."
                    : accountData
                    ? `${
                        accountData.name
                      } - Total gasto: ${formatCurrencyAccountTotal(
                        accountData.amount_spent
                      )}`
                    : "Clique para ver detalhes"}
                </span>
              </div>
            </div>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Informações da Conta
            </DialogTitle>
            <DialogDescription>
              Dados básicos da conta de anúncios HUDLAB
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
            ) : accountData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Nome da Conta
                  </p>
                  <p className="text-lg font-medium">{accountData.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  <div className="mt-1">
                    {getAccountStatusBadge(accountData.account_status)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Moeda
                  </p>
                  <p className="text-lg font-medium">{accountData.currency}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Fuso Horário
                  </p>
                  <p className="text-lg font-medium">
                    {accountData.timezone_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Gasto
                  </p>
                  <p className="text-xl font-semibold text-green-600">
                    {formatCurrencyAccountTotal(accountData.amount_spent)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    ID da Conta
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {accountData.id}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhum dado disponível</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Impressões */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressões</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {formatNumber(insights.impressions)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">{getPeriodLabel()}</p>
          </CardContent>
        </Card>

        {/* Cliques */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cliques</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {formatNumber(insights.clicks)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">{getPeriodLabel()}</p>
          </CardContent>
        </Card>

        {/* Gasto */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gasto</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {formatCurrency(insights.spend)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">{getPeriodLabel()}</p>
          </CardContent>
        </Card>

        {/* CPM */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPM</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {formatCurrency(insights.cpm)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">
              Custo por mil impressões
            </p>
          </CardContent>
        </Card>

        {/* CPC */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPC</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {formatCurrency(insights.cpc)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">Custo por clique</p>
          </CardContent>
        </Card>

        {/* CTR */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CTR</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[100px]" />
            ) : insights ? (
              <div className="text-2xl font-bold">
                {parseFloat(insights.ctr).toFixed(2)}%
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
            <p className="text-xs text-muted-foreground">Taxa de cliques</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Ads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Anúncios Ativos
          </CardTitle>
          <CardDescription>
            Lista de anúncios ativos com métricas de performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : adsData.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Anúncio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead>Valor Gasto</TableHead>
                    <TableHead>Custo por Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adsData.map((ad) => (
                    <TableRow key={ad.id}>
                      <TableCell className="font-medium">{ad.name}</TableCell>
                      <TableCell>{getAdStatusBadge(ad.status)}</TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate">
                          {ad.campaign_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ad.campaign_objective}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">
                          {formatCurrency(ad.spend)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {ad.cost_per_result !== "0" &&
                          ad.cost_per_result !== "0.00" ? (
                            formatCurrency(ad.cost_per_result)
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Nenhum anúncio ativo encontrado
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ads Performance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Análise de Performance: Anúncios vs Vendas
          </CardTitle>
          <CardDescription>
            Comparação entre gastos com anúncios e faturamento gerado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {performanceLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : performanceData ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Gasto Total (Meta)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(
                        performanceData.summary.totalAdsSpend.toString()
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Faturamento (Meta)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(
                        performanceData.summary.totalRevenue.toString()
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      ROI Médio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${
                        performanceData.summary.totalRevenue >
                        performanceData.summary.totalAdsSpend
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {performanceData.summary.totalAdsSpend > 0
                        ? (
                            ((performanceData.summary.totalRevenue -
                              performanceData.summary.totalAdsSpend) /
                              performanceData.summary.totalAdsSpend) *
                            100
                          ).toFixed(1)
                        : "0"}
                      %
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Clientes Convertidos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {performanceData.summary.totalCustomers}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Ads Performance Table */}
              {performanceData.adsPerformance.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Performance por Anúncio
                  </h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Anúncio</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">
                            Faturamento
                          </TableHead>
                          <TableHead className="text-right">Lucro</TableHead>
                          <TableHead className="text-right">ROI</TableHead>
                          <TableHead className="text-right">
                            Pares Vendidos
                          </TableHead>
                          <TableHead className="text-right">Clientes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {performanceData.adsPerformance.map((ad) => (
                          <TableRow key={ad.adId}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {ad.adName}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              {formatCurrency(ad.spend.toString())}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              {formatCurrency(ad.revenue.toString())}
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                ad.profit >= 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatCurrency(ad.profit.toString())}
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                ad.roi >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {ad.roi.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              {ad.pairsSold}
                            </TableCell>
                            <TableCell className="text-right">
                              {ad.customersConverted}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Non-Meta UTM Performance */}
              {performanceData.nonMetaPerformance.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Faturamento de Outras Fontes (Não-Meta)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                          Faturamento Total (Não-Meta)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatCurrency(
                            performanceData.summary.nonMetaRevenue.toString()
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                          Pares Vendidos (Não-Meta)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {performanceData.summary.nonMetaPairsSold}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>UTM Source</TableHead>
                          <TableHead>UTM Medium</TableHead>
                          <TableHead className="text-right">
                            Faturamento
                          </TableHead>
                          <TableHead className="text-right">
                            Pares Vendidos
                          </TableHead>
                          <TableHead className="text-right">Clientes</TableHead>
                          <TableHead className="text-right">Vendas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {performanceData.nonMetaPerformance.map(
                          (group, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {group.utmSource}
                              </TableCell>
                              <TableCell>{group.utmMedium}</TableCell>
                              <TableCell className="text-right text-blue-600 font-medium">
                                {formatCurrency(group.revenue.toString())}
                              </TableCell>
                              <TableCell className="text-right">
                                {group.pairsSold}
                              </TableCell>
                              <TableCell className="text-right">
                                {group.customersConverted}
                              </TableCell>
                              <TableCell className="text-right">
                                {group.dealsCount}
                              </TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Selecione um período para ver a análise de performance
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
