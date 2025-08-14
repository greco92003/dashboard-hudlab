"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trash2,
  Copy,
  Settings,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Database,
  TrendingUp,
} from "lucide-react";

interface MaintenanceStats {
  products: {
    total: number;
    active: number;
    deleted: number;
    synced: number;
    pending: number;
    error: number;
  };
  coupons: {
    total: number;
    active: number;
    deleted: number;
    created: number;
    pending: number;
    error: number;
  };
  duplicates: {
    potential_duplicate_groups: number;
  };
  last_sync: {
    products: string | null;
    coupons: string | null;
    cleanup: string | null;
    deduplication: string | null;
  };
}

interface Recommendation {
  type: "warning" | "info" | "suggestion";
  action: string;
  message: string;
}

export function MaintenancePanel() {
  const [stats, setStats] = useState<MaintenanceStats | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<any>(null);

  // Load maintenance stats
  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/nuvemshop-sync/maintenance");
      const data = await response.json();

      if (data.stats) {
        setStats(data.stats);
      }
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      }
    } catch (error) {
      console.error("Error loading maintenance stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // Execute maintenance operation
  const executeOperation = async (
    operation: string,
    dryRun: boolean = false
  ) => {
    try {
      setOperationLoading(operation);

      let endpoint = "";
      if (operation === "cleanup") {
        endpoint = "/api/nuvemshop-sync/cleanup";
      } else if (operation === "deduplicate") {
        endpoint = `/api/nuvemshop-sync/deduplicate?dry_run=${dryRun}`;
      } else if (operation === "maintenance") {
        endpoint = `/api/nuvemshop-sync/maintenance?operations=cleanup,deduplicate&dry_run=${dryRun}`;
      }

      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json();

      setLastResults(result);

      // Reload stats after operation
      await loadStats();
    } catch (error) {
      console.error(`Error executing ${operation}:`, error);
    } finally {
      setOperationLoading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manutenção NuvemShop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Carregando estatísticas...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manutenção NuvemShop
          </CardTitle>
          <CardDescription>
            Gerencie a sincronização e limpeza de produtos e cupons do NuvemShop
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          {recommendations.map((rec, index) => (
            <Alert
              key={index}
              variant={rec.type === "warning" ? "destructive" : "default"}
            >
              {rec.type === "warning" && <AlertTriangle className="h-4 w-4" />}
              {rec.type === "info" && <Info className="h-4 w-4" />}
              {rec.type === "suggestion" && <TrendingUp className="h-4 w-4" />}
              <AlertDescription>{rec.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="operations">Operações</TabsTrigger>
          <TabsTrigger value="results">Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Products Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Produtos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Total:</span>
                  <Badge variant="outline">{stats?.products.total || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Ativos:</span>
                  <Badge variant="default">{stats?.products.active || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Deletados:</span>
                  <Badge variant="destructive">
                    {stats?.products.deleted || 0}
                  </Badge>
                </div>
                {stats?.products.total && (
                  <Progress
                    value={(stats.products.active / stats.products.total) * 100}
                    className="h-2"
                  />
                )}
              </CardContent>
            </Card>

            {/* Coupons Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Copy className="h-5 w-5" />
                  Cupons
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Total:</span>
                  <Badge variant="outline">{stats?.coupons.total || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Ativos:</span>
                  <Badge variant="default">{stats?.coupons.active || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Deletados:</span>
                  <Badge variant="destructive">
                    {stats?.coupons.deleted || 0}
                  </Badge>
                </div>
                {stats?.coupons.total && (
                  <Progress
                    value={(stats.coupons.active / stats.coupons.total) * 100}
                    className="h-2"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Duplicates Alert */}
          {(stats?.duplicates?.potential_duplicate_groups ?? 0) > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Encontrados {stats?.duplicates?.potential_duplicate_groups ?? 0}{" "}
                grupos de produtos duplicados
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cleanup Operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Limpeza
                </CardTitle>
                <CardDescription>
                  Remove produtos e cupons que não existem mais no NuvemShop
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => executeOperation("cleanup")}
                  disabled={operationLoading === "cleanup"}
                  className="w-full"
                >
                  {operationLoading === "cleanup" && (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Executar Limpeza
                </Button>
              </CardContent>
            </Card>

            {/* Deduplication */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Copy className="h-5 w-5" />
                  Deduplicação
                </CardTitle>
                <CardDescription>
                  Remove produtos duplicados mantendo o mais recente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Button
                    onClick={() => executeOperation("deduplicate", true)}
                    disabled={operationLoading === "deduplicate"}
                    variant="outline"
                    className="w-full"
                  >
                    {operationLoading === "deduplicate" && (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Simular Deduplicação
                  </Button>
                  <Button
                    onClick={() => executeOperation("deduplicate", false)}
                    disabled={operationLoading === "deduplicate"}
                    className="w-full"
                  >
                    {operationLoading === "deduplicate" && (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Executar Deduplicação
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Maintenance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Manutenção Completa
              </CardTitle>
              <CardDescription>
                Executa todas as operações de limpeza e deduplicação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => executeOperation("maintenance", true)}
                  disabled={operationLoading === "maintenance"}
                  variant="outline"
                  className="flex-1"
                >
                  {operationLoading === "maintenance" && (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Simular Manutenção
                </Button>
                <Button
                  onClick={() => executeOperation("maintenance", false)}
                  disabled={operationLoading === "maintenance"}
                  className="flex-1"
                >
                  {operationLoading === "maintenance" && (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Executar Manutenção
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {lastResults ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Últimos Resultados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
                  {JSON.stringify(lastResults, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  Nenhuma operação executada ainda
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
