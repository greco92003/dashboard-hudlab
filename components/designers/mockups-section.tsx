"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, FileText, Clock } from "lucide-react";
import { useDesignerMockupsCache } from "@/hooks/useDesignerMockupsCache";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { getAllDesigners } from "@/lib/constants/designers";

interface MockupsSectionProps {
  designers: string[];
  dateRange?: DateRange;
  period?: number;
  useCustomPeriod?: boolean;
  isHydrated?: boolean;
}

export function MockupsSection({
  designers,
  dateRange,
  period = 30,
  useCustomPeriod = false,
  isHydrated = true,
}: MockupsSectionProps) {
  const {
    data,
    loading,
    error,
    lastSync,
    cached,
    fetchMockupsData,
    syncMockups,
  } = useDesignerMockupsCache();
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const loadingRef = useRef(false);

  // Memoize the date range calculation to prevent unnecessary re-renders
  const dateRangeParams = useMemo(() => {
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      // Para range customizado, ajustar o endDate para incluir o dia todo
      const endDate = new Date(dateRange.to);
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date(dateRange.from);
      startDate.setHours(0, 0, 0, 0);

      return { startDate, endDate };
    } else {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period);
      startDate.setHours(0, 0, 0, 0);

      return { startDate, endDate };
    }
  }, [useCustomPeriod, dateRange?.from, dateRange?.to, period]);

  // Stable function to load data with debounce protection
  const loadData = useCallback(() => {
    if (designers.length > 0 && !loadingRef.current) {
      loadingRef.current = true;
      console.log("📊 Loading mockups data with params:", {
        designers,
        startDate: dateRangeParams.startDate.toISOString(),
        endDate: dateRangeParams.endDate.toISOString(),
      });

      fetchMockupsData(
        designers,
        dateRangeParams.startDate,
        dateRangeParams.endDate
      ).finally(() => {
        // Reset loading flag after a short delay to prevent rapid successive calls
        setTimeout(() => {
          loadingRef.current = false;
        }, 1000);
      });
    }
  }, [
    designers,
    dateRangeParams.startDate,
    dateRangeParams.endDate,
    fetchMockupsData,
  ]);

  // Load data only once when component mounts AND when hydrated
  useEffect(() => {
    if (!autoLoaded && isHydrated) {
      console.log("📊 Initial load - hydrated and ready");
      loadData();
      setAutoLoaded(true);
    }
  }, [loadData, autoLoaded, isHydrated]);

  // Reload data when parameters change (but only after initial load and when hydrated)
  useEffect(() => {
    if (autoLoaded && isHydrated) {
      console.log("🔄 Parameters changed, reloading data...");
      loadData();
    }
  }, [loadData, autoLoaded, isHydrated]);

  const handleUnifiedSync = useCallback(async () => {
    console.log("🔄 COMPONENT - Unified sync button clicked");
    console.log("🔄 COMPONENT - Date range params:", {
      startDate: dateRangeParams.startDate.toISOString(),
      endDate: dateRangeParams.endDate.toISOString(),
      useCustomPeriod,
    });

    // Ativar loading imediatamente
    setSyncLoading(true);

    try {
      // Call the cache API directly for manual sync
      // Note: We don't pass date filters to sync because we want to sync ALL data
      // The filtering happens when fetching from cache
      const response = await fetch("/api/designer-mockups-cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          designers: getAllDesigners(), // Use centralized designer list
          forceSync: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.details || "Erro na sincronização"
        );
      }

      console.log("✅ UNIFIED SYNC - Cache sync completed:", result);

      // Show success toast
      toast.success("Sincronização concluída com sucesso!", {
        description: `${
          result.syncStats?.newRecords || 0
        } registros processados`,
      });

      // Reload data in the component with current date filters
      loadData();
    } catch (error) {
      console.error("❌ UNIFIED SYNC - Error:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      toast.error("Erro na sincronização", {
        description: errorMessage,
      });
    } finally {
      // Desativar loading sempre
      setSyncLoading(false);
    }
  }, [loadData, dateRangeParams, useCustomPeriod]);

  const formatLastSync = (date: Date | null) => {
    if (!date) return "Nunca";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 sm:h-5 sm:w-5" />
            <CardTitle className="text-lg sm:text-xl">
              Mockups / Alterações / Arquivos de Serigrafia
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {lastSync && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">Atualizado em:</span>
                <span>{formatLastSync(lastSync)}</span>
              </div>
            )}
            <Button
              onClick={handleUnifiedSync}
              disabled={syncLoading || loading}
              size="sm"
              className="flex items-center gap-2"
            >
              {syncLoading || loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {syncLoading || loading
                  ? "Sincronizando..."
                  : "Sincronizar Dados"}
              </span>
              <span className="sm:hidden">
                {syncLoading || loading ? "..." : "Sync"}
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading || syncLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {designers.map((designer, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {designers.map((designer) => {
              const stats = data[designer] || {
                quantidadeNegocios: 0,
                mockupsFeitos: 0,
                alteracoesFeitas: 0,
                arquivosSerigrafia: 0,
              };

              return (
                <Card key={designer} className="relative overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold truncate">
                      {designer}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {/* Quantidade de Negócios */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          Negócios:
                        </span>
                        <span className="font-semibold text-purple-600 text-xs sm:text-sm">
                          {stats.quantidadeNegocios}
                        </span>
                      </div>

                      {/* Mockups Feitos */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          Mockups Feitos:
                        </span>
                        <span className="font-semibold text-green-600 text-xs sm:text-sm">
                          {stats.mockupsFeitos}
                        </span>
                      </div>

                      {/* Alterações Feitas */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          Alterações:
                        </span>
                        <span className="font-semibold text-orange-600 text-xs sm:text-sm">
                          {stats.alteracoesFeitas}
                        </span>
                      </div>

                      {/* Arquivos de Serigrafia */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          Arquivos de Serigrafia:
                        </span>
                        <span className="font-semibold text-blue-600 text-xs sm:text-sm">
                          {stats.arquivosSerigrafia}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && !syncLoading && designers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum designer encontrado para exibir dados de mockups.</p>
          </div>
        )}

        {!loading &&
          !syncLoading &&
          designers.length > 0 &&
          Object.keys(data).length === 0 &&
          !error && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                Clique em &quot;Sincronizar Todos&quot; para carregar os dados
                de mockups.
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
