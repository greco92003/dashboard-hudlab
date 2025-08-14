"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSyncContext } from "@/contexts/SyncContext";

interface HealthData {
  status: "healthy" | "warning" | "critical";
  timestamp: string;
  responseTimeMs: number;
  issues: string[] | null;
  cache: {
    totalDeals: number;
    recentDeals: number;
    lastSyncAt: string | null;
    lastSyncStatus: string;
    lastSyncDuration: number | null;
    minutesSinceLastSync: number | null;
  };
  sync: {
    successRate: number;
    totalSyncs: number;
    lastError: string | null;
    isRunning: boolean;
  };
  history: Array<{
    startedAt: string;
    completedAt: string | null;
    status: string;
    dealsProcessed: number;
    durationSeconds: number | null;
    error: string | null;
  }>;
}

export function DealsCacheMonitor() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Use global sync context
  const { isSyncing, startSync, stopSync } = useSyncContext();

  const fetchHealthData = async () => {
    try {
      const response = await fetch("/api/deals-health");
      const data = await response.json();
      setHealthData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching health data:", error);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    // Marca no localStorage que a sincronização começou
    localStorage.setItem("hudlab_sync_state", "true");
    localStorage.setItem("hudlab_sync_start_time", Date.now().toString());
    startSync();
    try {
      const response = await fetch("/api/deals-health", {
        method: "POST",
      });

      if (response.ok) {
        // Wait a bit then refresh health data
        setTimeout(() => {
          fetchHealthData();
        }, 2000);
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
    } finally {
      // Remove do localStorage que a sincronização terminou
      localStorage.removeItem("hudlab_sync_state");
      localStorage.removeItem("hudlab_sync_start_time");
      stopSync();
    }
  };

  useEffect(() => {
    fetchHealthData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "critical":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-800 border-green-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Status do Cache de Deals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!healthData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Status do Cache de Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">
            Erro ao carregar dados de saúde do cache
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Status do Cache de Deals
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(healthData.status)}>
              {getStatusIcon(healthData.status)}
              {healthData.status === "healthy"
                ? "Saudável"
                : healthData.status === "warning"
                ? "Atenção"
                : "Crítico"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHealthData}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Issues */}
        {healthData.issues && healthData.issues.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">
              Problemas Detectados:
            </h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              {healthData.issues.map((issue, index) => (
                <li key={index}>• {issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Cache Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {healthData.cache.totalDeals.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Total de Deals</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {healthData.cache.recentDeals.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Últimos 30 dias</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {healthData.sync.successRate}%
            </div>
            <div className="text-sm text-gray-500">Taxa de Sucesso</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {healthData.responseTimeMs}ms
            </div>
            <div className="text-sm text-gray-500">Tempo Resposta</div>
          </div>
        </div>

        {/* Last Sync Info */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="text-sm">
              Última sincronização:{" "}
              {healthData.cache.lastSyncAt ? (
                <span className="font-medium">
                  {formatDistanceToNow(new Date(healthData.cache.lastSyncAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              ) : (
                <span className="text-red-500">Nunca</span>
              )}
            </span>
          </div>

          {healthData.sync.isRunning ? (
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              Sincronizando...
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={triggerSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
            </Button>
          )}
        </div>

        {/* Sync History */}
        {healthData.history.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Histórico de Sincronizações</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {healthData.history.slice(0, 3).map((sync, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    {sync.status === "completed" ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : sync.status === "failed" ? (
                      <XCircle className="h-3 w-3 text-red-500" />
                    ) : (
                      <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                    )}
                    <span>
                      {formatDistanceToNow(new Date(sync.startedAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  <div className="text-right">
                    <div>{sync.dealsProcessed} deals</div>
                    {sync.durationSeconds && (
                      <div className="text-xs text-gray-500">
                        {sync.durationSeconds}s
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Update */}
        <div className="text-xs text-gray-500 text-center">
          Atualizado{" "}
          {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: ptBR })}
        </div>
      </CardContent>
    </Card>
  );
}
