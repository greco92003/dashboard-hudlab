// =====================================================
// INDICADOR DE STATUS DOS WEBHOOKS
// =====================================================
// Componente para mostrar status dos webhooks em tempo real

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Zap, 
  Settings,
  RefreshCw,
  Activity
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface WebhookHealth {
  total: number;
  active: number;
  inactive: number;
  errors: number;
  last_received: string | null;
}

interface WebhookStats {
  total_received: number;
  total_processed: number;
  total_failed: number;
  success_rate: number;
}

export function WebhookStatusIndicator() {
  const [health, setHealth] = useState<WebhookHealth | null>(null);
  const [todayStats, setTodayStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Buscar status dos webhooks
  const fetchWebhookStatus = async () => {
    try {
      setError(null);
      
      // Buscar saúde dos webhooks
      const healthResponse = await fetch("/api/webhooks/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health_check" }),
      });

      if (healthResponse.ok) {
        const healthResult = await healthResponse.json();
        if (healthResult.success) {
          setHealth(healthResult.data);
        }
      }

      // Buscar estatísticas de hoje
      const today = new Date().toISOString().split("T")[0];
      const statsResponse = await fetch(`/api/webhooks/logs?date_from=${today}&date_to=${today}&limit=1`);
      
      if (statsResponse.ok) {
        const statsResult = await statsResponse.json();
        if (statsResult.success && statsResult.data.today_stats.length > 0) {
          const stats = statsResult.data.today_stats.reduce((acc: any, stat: any) => ({
            total_received: acc.total_received + stat.total_received,
            total_processed: acc.total_processed + stat.total_processed,
            total_failed: acc.total_failed + stat.total_failed,
          }), { total_received: 0, total_processed: 0, total_failed: 0 });

          stats.success_rate = stats.total_received > 0 
            ? Math.round((stats.total_processed / stats.total_received) * 100)
            : 100;

          setTodayStats(stats);
        } else {
          setTodayStats({ total_received: 0, total_processed: 0, total_failed: 0, success_rate: 100 });
        }
      }

      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar status dos webhooks");
    } finally {
      setLoading(false);
    }
  };

  // Configurar webhooks essenciais
  const setupEssentialWebhooks = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/webhooks/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup_essential" }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(`Webhooks essenciais configurados: ${result.data.registered} registrados`);
        await fetchWebhookStatus(); // Atualizar status
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro ao configurar webhooks";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Obter status geral
  const getOverallStatus = () => {
    if (!health) return { status: "unknown", color: "gray", text: "Carregando..." };
    
    if (health.errors > 0) {
      return { status: "error", color: "red", text: "Com Erros" };
    }
    
    if (health.active === 0) {
      return { status: "inactive", color: "yellow", text: "Inativo" };
    }
    
    if (health.active > 0 && health.inactive === 0) {
      return { status: "healthy", color: "green", text: "Saudável" };
    }
    
    return { status: "partial", color: "yellow", text: "Parcial" };
  };

  // Carregar dados iniciais
  useEffect(() => {
    fetchWebhookStatus();
  }, []);

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(fetchWebhookStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = getOverallStatus();

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <CardTitle className="text-lg">Status dos Webhooks</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchWebhookStatus}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Link href="/admin/webhooks">
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
        <CardDescription>
          Sincronização em tempo real com Nuvemshop
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Status Geral */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {overallStatus.status === "healthy" && <CheckCircle className="w-5 h-5 text-green-500" />}
            {overallStatus.status === "error" && <AlertCircle className="w-5 h-5 text-red-500" />}
            {overallStatus.status === "partial" && <Clock className="w-5 h-5 text-yellow-500" />}
            {overallStatus.status === "inactive" && <Clock className="w-5 h-5 text-gray-500" />}
            {overallStatus.status === "unknown" && <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />}
            <span className="font-medium">Status Geral:</span>
          </div>
          <Badge 
            variant={overallStatus.status === "healthy" ? "default" : "secondary"}
            className={
              overallStatus.status === "healthy" ? "bg-green-500" :
              overallStatus.status === "error" ? "bg-red-500" :
              overallStatus.status === "partial" ? "bg-yellow-500" :
              "bg-gray-500"
            }
          >
            {overallStatus.text}
          </Badge>
        </div>

        {/* Métricas */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{health.total}</div>
              <div className="text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{health.active}</div>
              <div className="text-muted-foreground">Ativos</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">{health.inactive}</div>
              <div className="text-muted-foreground">Inativos</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{health.errors}</div>
              <div className="text-muted-foreground">Erros</div>
            </div>
          </div>
        )}

        {/* Estatísticas de Hoje */}
        {todayStats && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2">Atividade de Hoje</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{todayStats.total_received}</div>
                <div className="text-muted-foreground">Recebidos</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{todayStats.total_processed}</div>
                <div className="text-muted-foreground">Processados</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{todayStats.total_failed}</div>
                <div className="text-muted-foreground">Falharam</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-600">{todayStats.success_rate}%</div>
                <div className="text-muted-foreground">Taxa Sucesso</div>
              </div>
            </div>
          </div>
        )}

        {/* Último Webhook */}
        {health?.last_received && (
          <div className="text-xs text-muted-foreground">
            Último webhook: {new Date(health.last_received).toLocaleString()}
          </div>
        )}

        {/* Ações Rápidas */}
        {health?.total === 0 && (
          <div className="border-t pt-3">
            <div className="text-sm text-muted-foreground mb-2">
              Nenhum webhook configurado. Configure webhooks essenciais para começar:
            </div>
            <Button 
              onClick={setupEssentialWebhooks} 
              disabled={loading}
              size="sm"
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              Configurar Webhooks Essenciais
            </Button>
          </div>
        )}

        {/* Timestamp da última atualização */}
        <div className="text-xs text-muted-foreground text-center">
          Atualizado: {lastUpdate.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
