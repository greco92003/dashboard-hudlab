"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  OTESeller,
  OTEMonthlyTarget,
  OTEConfig,
  OTEMultiplier,
} from "@/types/ote";
import {
  Plus,
  Settings,
  Users,
  Target,
  ShieldAlert,
  BarChart3,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { SellerFormDialog } from "@/components/ote/seller-form-dialog";
import { TargetFormDialog } from "@/components/ote/target-form-dialog";
import { MultiplierConfigForm } from "@/components/ote/multiplier-config-form";
import { TrafficConfigForm } from "@/components/ote/traffic-config-form";
import { SellerDashboardView } from "@/components/ote/seller-dashboard-view";
import { usePermissions } from "@/hooks/usePermissions";

export default function OTEAdminPage() {
  const router = useRouter();
  const { isOwnerOrAdmin, loading: permissionsLoading } = usePermissions();

  const [sellers, setSellers] = useState<OTESeller[]>([]);
  const [targets, setTargets] = useState<OTEMonthlyTarget[]>([]);
  const [config, setConfig] = useState<OTEConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [sellerDialogOpen, setSellerDialogOpen] = useState(false);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<OTESeller | undefined>();
  const [editingTarget, setEditingTarget] = useState<
    OTEMonthlyTarget | undefined
  >();

  // Verificar permissões
  useEffect(() => {
    if (!permissionsLoading && !isOwnerOrAdmin) {
      router.push("/dashboard");
    }
  }, [permissionsLoading, isOwnerOrAdmin, router]);

  useEffect(() => {
    if (isOwnerOrAdmin) {
      fetchData();
    }
  }, [isOwnerOrAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Buscar vendedores
      const sellersResponse = await fetch("/api/ote/sellers");
      if (sellersResponse.ok) {
        const sellersData = await sellersResponse.json();
        setSellers(sellersData.sellers || []);
      }

      // Buscar metas
      const targetsResponse = await fetch("/api/ote/targets");
      if (targetsResponse.ok) {
        const targetsData = await targetsResponse.json();
        setTargets(targetsData.targets || []);
      }

      // Buscar configuração
      const configResponse = await fetch("/api/ote/config");
      if (configResponse.ok) {
        const configData = await configResponse.json();
        setConfig(configData.config || null);
      }

      setError(null);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleNewSeller = () => {
    setEditingSeller(undefined);
    setSellerDialogOpen(true);
  };

  const handleEditSeller = (seller: OTESeller) => {
    setEditingSeller(seller);
    setSellerDialogOpen(true);
  };

  const handleNewTarget = () => {
    setEditingTarget(undefined);
    setTargetDialogOpen(true);
  };

  const handleEditTarget = (target: OTEMonthlyTarget) => {
    setEditingTarget(target);
    setTargetDialogOpen(true);
  };

  // Mostrar loading enquanto verifica permissões
  if (permissionsLoading || loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold">Administração OTE</h1>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Verificar permissões
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso Negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar esta página. Apenas
            administradores e proprietários podem gerenciar o sistema OTE.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold">Administração OTE</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Administração OTE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie vendedores, metas e configurações do sistema
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sellers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sellers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Vendedores
          </TabsTrigger>
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Metas
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* Tab: Vendedores */}
        <TabsContent value="sellers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Vendedores Cadastrados</CardTitle>
                <Button size="sm" onClick={handleNewSeller}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Vendedor
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sellers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum vendedor cadastrado ainda.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold text-sm">
                          Nome
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-sm">
                          Salário Fixo
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-sm">
                          % Comissão
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-sm">
                          Status
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-sm">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellers.map((seller) => (
                        <tr
                          key={seller.id}
                          className="border-b hover:bg-gray-50 dark:hover:bg-gray-900"
                        >
                          <td className="py-3 px-4 font-medium">
                            {seller.seller_name}
                          </td>
                          <td className="text-right py-3 px-4">
                            R${" "}
                            {seller.salary_fixed.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="text-center py-3 px-4">
                            {seller.commission_percentage}%
                          </td>
                          <td className="text-center py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                seller.active
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                              }`}
                            >
                              {seller.active ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSeller(seller)}
                            >
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Metas */}
        <TabsContent value="targets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Metas Mensais</CardTitle>
                <Button size="sm" onClick={handleNewTarget}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Meta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : targets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma meta cadastrada ainda.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">
                          Período
                        </th>
                        <th className="text-right py-3 px-4 font-medium">
                          Meta (R$)
                        </th>
                        <th className="text-right py-3 px-4 font-medium">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((target) => {
                        const monthName = new Date(
                          target.year,
                          target.month - 1
                        ).toLocaleDateString("pt-BR", { month: "long" });

                        return (
                          <tr key={target.id} className="border-b">
                            <td className="py-3 px-4">
                              <span className="capitalize">
                                {monthName} / {target.year}
                              </span>
                            </td>
                            <td className="text-right py-3 px-4">
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(target.target_amount)}
                            </td>
                            <td className="text-right py-3 px-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditTarget(target)}
                              >
                                Editar
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configurações */}
        <TabsContent value="config" className="space-y-4">
          {loading ? (
            <Card>
              <CardHeader>
                <CardTitle>Configurações do Sistema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CardContent>
            </Card>
          ) : config ? (
            <div className="grid gap-4">
              {/* Configuração de Tráfego */}
              <TrafficConfigForm
                paidTrafficPercentage={config.paid_traffic_percentage}
                organicPercentage={config.organic_percentage}
                onSave={async (paidTraffic: number, organic: number) => {
                  const response = await fetch("/api/ote/config", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      paid_traffic_percentage: paidTraffic,
                      organic_percentage: organic,
                    }),
                  });

                  if (!response.ok) {
                    const data = await response.json();
                    throw new Error(
                      data.error || "Erro ao salvar configurações"
                    );
                  }

                  // Atualizar config local
                  await fetchData();
                }}
              />

              {/* Configuração de Multiplicadores */}
              <MultiplierConfigForm
                initialMultipliers={config.multipliers}
                onSave={async (multipliers: OTEMultiplier[]) => {
                  const response = await fetch("/api/ote/config", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ multipliers }),
                  });

                  if (!response.ok) {
                    const data = await response.json();
                    throw new Error(
                      data.error || "Erro ao salvar configurações"
                    );
                  }

                  // Atualizar config local
                  await fetchData();
                }}
              />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Configurações do Sistema</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-8">
                  Erro ao carregar configurações
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Dashboard Vendedores */}
        <TabsContent value="dashboard" className="space-y-4">
          <SellerDashboardView sellers={sellers} config={config} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <SellerFormDialog
        open={sellerDialogOpen}
        onOpenChange={setSellerDialogOpen}
        seller={editingSeller}
        onSuccess={fetchData}
      />

      <TargetFormDialog
        open={targetDialogOpen}
        onOpenChange={setTargetDialogOpen}
        target={editingTarget}
        onSuccess={fetchData}
      />
    </div>
  );
}
