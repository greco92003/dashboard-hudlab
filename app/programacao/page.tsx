"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { formatCurrency } from "@/lib/utils";
import {
  AlertCircle,
  TrendingUp,
  Package,
  Calendar,
  User,
  Palette,
  RefreshCw,
  MapPin,
  DollarSign,
  Clock,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageTitle: string | null;
  createdDate: string;
  estado: string | null;
  quantidadePares: string | null;
  vendedor: string | null;
  designer: string | null;
  customField54: string | null;
}

interface Group {
  id: string;
  title: string;
  dealsCount: number;
  deals: Deal[];
}

interface ProgramacaoData {
  success: boolean;
  message: string;
  summary: {
    totalDeals: number;
    totalValue: number;
    totalGroups: number;
  };
  groups: Group[];
}

export default function ProgramacaoPage() {
  const [data, setData] = useState<ProgramacaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"value" | "title" | "embarque">(
    "embarque"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);

  // Get sidebar state to hide header when collapsed
  const { state } = useSidebar();

  useEffect(() => {
    fetchProgramacaoData();
  }, []);

  // Load from localStorage after hydration
  useEffect(() => {
    setIsHydrated(true);

    // Load sortBy
    const savedSortBy = localStorage.getItem("programacao-sortBy");
    if (savedSortBy) {
      setSortBy(savedSortBy as "value" | "title" | "embarque");
    }

    // Load sortDirection
    const savedSortDirection = localStorage.getItem(
      "programacao-sortDirection"
    );
    if (savedSortDirection) {
      setSortDirection(savedSortDirection as "asc" | "desc");
    }

    // Load visibleGroups
    const savedVisibleGroups = localStorage.getItem(
      "programacao-visibleGroups"
    );
    if (savedVisibleGroups) {
      try {
        const parsed = JSON.parse(savedVisibleGroups);
        setVisibleGroups(new Set(parsed));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save sortBy to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("programacao-sortBy", sortBy);
    }
  }, [sortBy, isHydrated]);

  // Save sortDirection to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("programacao-sortDirection", sortDirection);
    }
  }, [sortDirection, isHydrated]);

  // Save visibleGroups to localStorage
  useEffect(() => {
    if (isHydrated && visibleGroups.size > 0) {
      localStorage.setItem(
        "programacao-visibleGroups",
        JSON.stringify(Array.from(visibleGroups))
      );
    }
  }, [visibleGroups, isHydrated]);

  // Initialize visible groups when data is loaded
  useEffect(() => {
    if (data && visibleGroups.size === 0) {
      const allGroupIds = new Set<string>();
      data.groups.forEach((group) => {
        if (group.deals.length > 0) {
          allGroupIds.add(group.id);
        }
      });
      setVisibleGroups(allGroupIds);
    }
  }, [data, visibleGroups.size]);

  const fetchProgramacaoData = async (showToast = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/programacao");

      if (!response.ok) {
        throw new Error(`Erro ao buscar dados: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);

      if (showToast) {
        toast.success("Dados atualizados com sucesso!");
      }
    } catch (err) {
      console.error("Erro ao buscar dados de programação:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Erro desconhecido";
      setError(errorMessage);

      if (showToast) {
        toast.error(`Erro ao atualizar: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Call the sync endpoint to fetch fresh data from ActiveCampaign
    try {
      const syncResponse = await fetch("/api/programacao/sync", {
        method: "POST",
      });

      if (!syncResponse.ok) {
        throw new Error("Failed to sync data");
      }

      // After sync, fetch the updated data
      await fetchProgramacaoData(true);
    } catch (err) {
      console.error("Error syncing data:", err);
      toast.error("Erro ao sincronizar dados");
      setRefreshing(false);
    }
  };

  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";

    // Check if date is in YYYY-MM-DD format
    if (dateStr.includes("-")) {
      const [year, month, day] = dateStr.split("-");
      return `${day}/${month}/${year}`;
    }

    // If already in DD/MM/YYYY format, return as is
    return dateStr;
  };

  // Parse date string to Date object (handles both YYYY-MM-DD and DD/MM/YYYY formats)
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    try {
      if (dateStr.includes("-")) {
        // YYYY-MM-DD format
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(year, month - 1, day);
      } else {
        // DD/MM/YYYY format
        const [day, month, year] = dateStr.split("/").map(Number);
        return new Date(year, month - 1, day);
      }
    } catch {
      return null;
    }
  };

  // Get current date in Brasília timezone (UTC-3)
  const getCurrentDateBrasilia = (): Date => {
    const now = new Date();
    // Convert to Brasília time (UTC-3)
    const brasiliaOffset = -3 * 60; // -3 hours in minutes
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const brasiliaTime = new Date(utcTime + brasiliaOffset * 60000);
    // Reset time to start of day for date comparison
    brasiliaTime.setHours(0, 0, 0, 0);
    return brasiliaTime;
  };

  // Calculate days difference between two dates
  const getDaysDifference = (targetDate: Date, currentDate: Date): number => {
    const diffTime = targetDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get card background color class based on stage title and shipping date
  const getCardBackgroundClass = (deal: Deal): string => {
    // Stage titles that should always be green
    const greenStages = [
      "Em trânsito (Link Rastreio)",
      "Recebido Amostra",
      "Recebido Pedido",
    ];

    // Check if deal is in a green stage
    if (deal.stageTitle && greenStages.includes(deal.stageTitle)) {
      return "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800";
    }

    // If no shipping date, return default
    if (!deal.customField54) {
      return "";
    }

    // Parse shipping date
    const shippingDate = parseDate(deal.customField54);
    if (!shippingDate) {
      return "";
    }

    // Get current date in Brasília timezone
    const currentDate = getCurrentDateBrasilia();
    const daysUntilShipping = getDaysDifference(shippingDate, currentDate);

    // Determine color based on days until shipping
    if (daysUntilShipping < 0) {
      // Past due - red
      return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800";
    } else if (daysUntilShipping <= 3) {
      // 3 days or less - yellow
      return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
    } else if (daysUntilShipping <= 7) {
      // 7 days or less - orange
      return "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800";
    }

    // More than 7 days - default
    return "";
  };

  // Get days until shipping message with appropriate color
  const getDaysUntilShippingInfo = (
    deal: Deal
  ): { message: string; colorClass: string } | null => {
    // Stage titles that should always be green
    const greenStages = [
      "Em trânsito (Link Rastreio)",
      "Recebido Amostra",
      "Recebido Pedido",
    ];

    // Check if deal is in a green stage
    if (deal.stageTitle && greenStages.includes(deal.stageTitle)) {
      return {
        message: "✓ Concluído",
        colorClass: "text-green-700 dark:text-green-400 font-semibold",
      };
    }

    // If no shipping date, return null
    if (!deal.customField54) {
      return null;
    }

    // Parse shipping date
    const shippingDate = parseDate(deal.customField54);
    if (!shippingDate) {
      return null;
    }

    // Get current date in Brasília timezone
    const currentDate = getCurrentDateBrasilia();
    const daysUntilShipping = getDaysDifference(shippingDate, currentDate);

    // Determine message and color based on days until shipping
    if (daysUntilShipping < 0) {
      const daysOverdue = Math.abs(daysUntilShipping);
      return {
        message: `⚠ Atrasado ${daysOverdue} ${
          daysOverdue === 1 ? "dia" : "dias"
        }`,
        colorClass: "text-red-700 dark:text-red-400 font-semibold",
      };
    } else if (daysUntilShipping === 0) {
      return {
        message: "🚨 Embarque HOJE",
        colorClass: "text-yellow-700 dark:text-yellow-400 font-bold",
      };
    } else if (daysUntilShipping <= 3) {
      return {
        message: `⏰ Faltam ${daysUntilShipping} ${
          daysUntilShipping === 1 ? "dia" : "dias"
        }`,
        colorClass: "text-yellow-700 dark:text-yellow-400 font-semibold",
      };
    } else if (daysUntilShipping <= 7) {
      return {
        message: `📅 Faltam ${daysUntilShipping} dias`,
        colorClass: "text-orange-700 dark:text-orange-400 font-medium",
      };
    } else {
      return {
        message: `📅 Faltam ${daysUntilShipping} dias`,
        colorClass: "text-muted-foreground",
      };
    }
  };

  // Sort deals within each group
  const sortDeals = (deals: Deal[]) => {
    return [...deals].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "value":
          comparison = b.value - a.value;
          break;
        case "embarque":
          // Sort by customField54 (Data de Embarque)
          // Deals without embarque date
          if (!a.customField54 && !b.customField54) {
            comparison = 0;
          } else if (!a.customField54) {
            // Deals without date go to the end (positive value pushes 'a' down)
            comparison = sortDirection === "asc" ? 1 : -1;
            return comparison;
          } else if (!b.customField54) {
            // Deals without date go to the end (negative value pushes 'b' down)
            comparison = sortDirection === "asc" ? -1 : 1;
            return comparison;
          } else {
            const dateA = parseDate(a.customField54);
            const dateB = parseDate(b.customField54);
            comparison = (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
          }
          break;
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        default:
          return 0;
      }

      // Apply sort direction
      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsDealDialogOpen(true);
  };

  const handleGroupToggle = (groupId: string) => {
    setVisibleGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleSelectAllGroups = () => {
    const allGroupIds = new Set<string>();
    data?.groups.forEach((group) => {
      if (group.deals.length > 0) {
        allGroupIds.add(group.id);
      }
    });
    setVisibleGroups(allGroupIds);
  };

  const handleDeselectAllGroups = () => {
    setVisibleGroups(new Set());
  };

  return (
    <div className="flex flex-1 flex-col gap-4 min-w-0">
      {/* Page Title */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <SidebarTrigger />
        <Clock className="h-6 w-6" />
        <h1 className="text-xl sm:text-2xl font-bold">Programação</h1>
      </div>

      {/* Filters and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Sort By */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setSortDirection(sortDirection === "asc" ? "desc" : "asc")
              }
              className="h-8 w-8"
              title={
                sortDirection === "asc"
                  ? "Ordem crescente"
                  : "Ordem decrescente"
              }
            >
              {sortDirection === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
            <Select
              value={sortBy}
              onValueChange={(value: any) => setSortBy(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Valor</SelectItem>
                <SelectItem value="title">Título</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex-1 overflow-hidden min-h-0 min-w-0">
          <Skeleton className="h-full w-full" />
        </div>
      ) : data && data.groups.length > 0 ? (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0 min-w-0">
          {/* Summary Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-xl font-bold">Data de Embarque</h2>
            <Badge variant="outline">
              {data.summary.totalDeals}{" "}
              {data.summary.totalDeals === 1 ? "deal" : "deals"}
            </Badge>
          </div>

          {/* Kanban Cards Container with white border */}
          <div className="flex-1 min-h-0 min-w-0 border border-white rounded-lg bg-transparent overflow-hidden">
            {/* Groups - Horizontal Scroll with scrollbar on top */}
            <div
              className="overflow-x-auto h-full"
              style={{ transform: "rotateX(180deg)" }}
            >
              <div
                className="flex gap-4 min-w-max h-full p-4 justify-center"
                style={{ transform: "rotateX(180deg)" }}
              >
                {data.groups
                  .filter(
                    (group) =>
                      group.deals.length > 0 && visibleGroups.has(group.id)
                  )
                  .map((group) => (
                    <div
                      key={group.id}
                      className="flex-shrink-0 w-80 h-full"
                      style={{ minWidth: "320px" }}
                    >
                      {/* Group Card */}
                      <Card className="h-full flex flex-col">
                        <CardHeader className="pb-3 flex-shrink-0">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold">
                              {formatDate(group.title)}
                            </CardTitle>
                            <Badge variant="secondary" className="ml-2">
                              {group.dealsCount}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 flex-1 overflow-y-auto">
                          {group.deals.length > 0 ? (
                            sortDeals(group.deals).map((deal) => (
                              <Card
                                key={deal.id}
                                className={`p-3 hover:shadow-md transition-shadow cursor-pointer border ${getCardBackgroundClass(
                                  deal
                                )}`}
                                onClick={() => handleDealClick(deal)}
                              >
                                <div className="space-y-2">
                                  {/* Deal Title */}
                                  <h4 className="font-semibold text-sm line-clamp-2">
                                    {deal.title}
                                  </h4>

                                  {/* Custom Field 54 - Data de Embarque */}
                                  {deal.customField54 && (
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1 text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                                        <Clock className="h-4 w-4" />
                                        {formatDate(deal.customField54)}
                                      </div>
                                      {/* Days until shipping indicator */}
                                      {(() => {
                                        const info =
                                          getDaysUntilShippingInfo(deal);
                                        return info ? (
                                          <div
                                            className={`text-xs px-2 py-0.5 ${info.colorClass}`}
                                          >
                                            {info.message}
                                          </div>
                                        ) : null;
                                      })()}
                                    </div>
                                  )}

                                  {/* Deal Value */}
                                  <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                                    <TrendingUp className="h-3 w-3" />
                                    {formatCurrency(
                                      deal.value / 100,
                                      deal.currency
                                    )}
                                  </div>

                                  {/* Stage Title */}
                                  {deal.stageTitle && (
                                    <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-2 py-1 rounded">
                                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                      {deal.stageTitle}
                                    </div>
                                  )}

                                  {/* Deal Details */}
                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    {deal.quantidadePares && (
                                      <div className="flex items-center gap-1">
                                        <Package className="h-3 w-3" />
                                        {deal.quantidadePares} pares
                                      </div>
                                    )}
                                    {deal.vendedor && (
                                      <div className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {deal.vendedor}
                                      </div>
                                    )}
                                    {deal.designer && (
                                      <div className="flex items-center gap-1">
                                        <Palette className="h-3 w-3" />
                                        {deal.designer}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))
                          ) : (
                            <div className="text-center py-8 text-sm text-muted-foreground">
                              Nenhum deal neste grupo
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Alert className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum dado disponível. Clique em &quot;Atualizar&quot; para
            sincronizar os dados.
          </AlertDescription>
        </Alert>
      )}

      {/* Deal Details Dialog */}
      <Dialog open={isDealDialogOpen} onOpenChange={setIsDealDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedDeal?.title}</DialogTitle>
            <DialogDescription>Detalhes completos do deal</DialogDescription>
          </DialogHeader>

          {selectedDeal && (
            <div className="space-y-6">
              {/* Custom Field 54 - Data de Embarque */}
              {selectedDeal.customField54 && (
                <div className="flex items-center gap-3 p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary">
                  <Clock className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">
                      Data de Embarque
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {formatDate(selectedDeal.customField54)}
                    </p>
                  </div>
                </div>
              )}

              {/* Value Section */}
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Valor do Deal</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(
                      selectedDeal.value / 100,
                      selectedDeal.currency
                    )}
                  </p>
                  {/* Stage Title below value */}
                  {selectedDeal.stageTitle && (
                    <p className="text-sm text-blue-600 font-medium mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      {selectedDeal.stageTitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedDeal.quantidadePares && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Quantidade de Pares</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeal.quantidadePares}
                      </p>
                    </div>
                  </div>
                )}

                {selectedDeal.vendedor && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Vendedor</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeal.vendedor}
                      </p>
                    </div>
                  </div>
                )}

                {selectedDeal.designer && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Palette className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Designer</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeal.designer}
                      </p>
                    </div>
                  </div>
                )}

                {selectedDeal.estado && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Estado</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeal.estado}
                      </p>
                    </div>
                  </div>
                )}

                {selectedDeal.createdDate && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Data de Criação</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedDeal.createdDate).toLocaleDateString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          }
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Deal ID */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  ID do Deal:{" "}
                  <span className="font-mono">{selectedDeal.id}</span>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
