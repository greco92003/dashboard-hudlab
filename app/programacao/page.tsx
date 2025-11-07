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
import { Checkbox } from "@/components/ui/checkbox";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { formatCurrency } from "@/lib/utils";
import {
  Kanban,
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  closingDate: string;
  createdDate: string;
  estado: string | null;
  quantidadePares: string | null;
  vendedor: string | null;
  designer: string | null;
  customField54: string | null;
}

interface Stage {
  id: string;
  title: string;
  order: number;
  color: string;
  pipelineId: string;
  pipelineName: string;
  dealsCount: number;
  deals: Deal[];
}

interface Pipeline {
  pipelineId: string;
  pipelineName: string;
  stages: Stage[];
  totalDeals: number;
}

interface ProgramacaoData {
  success: boolean;
  message: string;
  summary: {
    totalStages: number;
    totalPipelines: number;
    totalWonDeals: number;
    totalValue: number;
    stagesWithDeals: number;
  };
  pipelines: Pipeline[];
}

export default function ProgramacaoPage() {
  const [data, setData] = useState<ProgramacaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"value" | "date" | "title" | "embarque">(
    "embarque"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [visibleStages, setVisibleStages] = useState<Set<string>>(new Set());
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
      setSortBy(savedSortBy as "value" | "date" | "title" | "embarque");
    }

    // Load sortDirection
    const savedSortDirection = localStorage.getItem(
      "programacao-sortDirection"
    );
    if (savedSortDirection) {
      setSortDirection(savedSortDirection as "asc" | "desc");
    }

    // Load visibleStages
    const savedVisibleStages = localStorage.getItem(
      "programacao-visibleStages"
    );
    if (savedVisibleStages) {
      try {
        const parsed = JSON.parse(savedVisibleStages);
        setVisibleStages(new Set(parsed));
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

  // Save visibleStages to localStorage
  useEffect(() => {
    if (isHydrated && visibleStages.size > 0) {
      localStorage.setItem(
        "programacao-visibleStages",
        JSON.stringify(Array.from(visibleStages))
      );
    }
  }, [visibleStages, isHydrated]);

  // Initialize visible stages when data is loaded
  useEffect(() => {
    if (data && visibleStages.size === 0) {
      const allStageIds = new Set<string>();
      data.pipelines.forEach((pipeline) => {
        pipeline.stages.forEach((stage) => {
          if (stage.deals.length > 0) {
            allStageIds.add(stage.id);
          }
        });
      });
      setVisibleStages(allStageIds);
    }
  }, [data]);

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
    await fetchProgramacaoData(true);
  };

  // Filter to show only "Atendimento" pipeline
  const filteredPipelines =
    data?.pipelines.filter((pipeline) =>
      pipeline.pipelineName.toLowerCase().includes("atendimento")
    ) || [];

  // Sort deals within each stage
  const sortDeals = (deals: Deal[]) => {
    return [...deals].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "value":
          comparison = b.value - a.value;
          break;
        case "date":
          comparison =
            new Date(b.closingDate).getTime() -
            new Date(a.closingDate).getTime();
          break;
        case "embarque":
          // Sort by customField54 (Data de Embarque)
          // Parse dates in DD/MM/YYYY format
          const parseDate = (dateStr: string) => {
            const [day, month, year] = dateStr.split("/").map(Number);
            return new Date(year, month - 1, day).getTime();
          };

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
            comparison =
              parseDate(a.customField54) - parseDate(b.customField54);
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

  const handleStageToggle = (stageId: string) => {
    setVisibleStages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stageId)) {
        newSet.delete(stageId);
      } else {
        newSet.add(stageId);
      }
      return newSet;
    });
  };

  const handleSelectAllStages = () => {
    const allStageIds = new Set<string>();
    filteredPipelines.forEach((pipeline) => {
      pipeline.stages.forEach((stage) => {
        if (stage.deals.length > 0) {
          allStageIds.add(stage.id);
        }
      });
    });
    setVisibleStages(allStageIds);
  };

  const handleDeselectAllStages = () => {
    setVisibleStages(new Set());
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
                <SelectItem value="embarque">Data de Embarque</SelectItem>
                <SelectItem value="date">Data de Fechamento</SelectItem>
                <SelectItem value="value">Valor</SelectItem>
                <SelectItem value="title">Título</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Settings and Refresh Buttons */}
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsSettingsDialogOpen(true)}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            title="Configurações de visualização"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
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
      ) : data && filteredPipelines.length > 0 ? (
        filteredPipelines.map((pipeline) => (
          <div
            key={pipeline.pipelineId}
            className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0 min-w-0"
          >
            {/* Pipeline Header */}
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-bold">{pipeline.pipelineName}</h2>
              <Badge variant="outline">
                {pipeline.totalDeals}{" "}
                {pipeline.totalDeals === 1 ? "deal" : "deals"}
              </Badge>
            </div>

            {/* Kanban Cards Container with white border */}
            <div className="flex-1 min-h-0 min-w-0 border border-white rounded-lg bg-transparent overflow-hidden">
              {/* Stages - Horizontal Scroll with scrollbar on top */}
              <div
                className="overflow-x-auto h-full"
                style={{ transform: "rotateX(180deg)" }}
              >
                <div
                  className="flex gap-4 min-w-max h-full p-4 justify-center"
                  style={{ transform: "rotateX(180deg)" }}
                >
                  {pipeline.stages
                    .filter(
                      (stage) =>
                        stage.deals.length > 0 && visibleStages.has(stage.id)
                    )
                    .map((stage) => (
                      <div
                        key={stage.id}
                        className="flex-shrink-0 w-80 h-full"
                        style={{ minWidth: "320px" }}
                      >
                        {/* Stage Card */}
                        <Card className="h-full flex flex-col">
                          <CardHeader
                            className="pb-3 flex-shrink-0"
                            style={{
                              borderLeft: `4px solid #${stage.color}`,
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base font-semibold">
                                {stage.title}
                              </CardTitle>
                              <Badge variant="secondary" className="ml-2">
                                {stage.dealsCount}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 flex-1 overflow-y-auto">
                            {stage.deals.length > 0 ? (
                              sortDeals(stage.deals).map((deal) => (
                                <Card
                                  key={deal.id}
                                  className="p-3 hover:shadow-md transition-shadow cursor-pointer"
                                  onClick={() => handleDealClick(deal)}
                                >
                                  <div className="space-y-2">
                                    {/* Deal Title */}
                                    <h4 className="font-semibold text-sm line-clamp-2">
                                      {deal.title}
                                    </h4>

                                    {/* Custom Field 54 - Data de Embarque */}
                                    {deal.customField54 && (
                                      <div className="flex items-center gap-1 text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                                        <Clock className="h-4 w-4" />
                                        {deal.customField54}
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
                                      {deal.closingDate && (
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {new Date(
                                            deal.closingDate
                                          ).toLocaleDateString("pt-BR")}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              ))
                            ) : (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                Nenhum deal neste stage
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
        ))
      ) : (
        <Alert className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum dado disponível. Verifique se há deals ganhos no sistema.
          </AlertDescription>
        </Alert>
      )}

      {/* Settings Dialog */}
      <Dialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações de Visualização</DialogTitle>
            <DialogDescription>
              Selecione quais stages deseja visualizar no quadro de programação
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Select/Deselect All Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleSelectAllStages}
                variant="outline"
                size="sm"
              >
                Selecionar Todos
              </Button>
              <Button
                onClick={handleDeselectAllStages}
                variant="outline"
                size="sm"
              >
                Desmarcar Todos
              </Button>
            </div>

            {/* Stages List */}
            {filteredPipelines.map((pipeline) => (
              <div key={pipeline.pipelineId} className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">
                  {pipeline.pipelineName}
                </h3>
                <div className="space-y-2">
                  {pipeline.stages
                    .filter((stage) => stage.deals.length > 0)
                    .map((stage) => (
                      <div
                        key={stage.id}
                        className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          id={`stage-${stage.id}`}
                          checked={visibleStages.has(stage.id)}
                          onCheckedChange={() => handleStageToggle(stage.id)}
                        />
                        <label
                          htmlFor={`stage-${stage.id}`}
                          className="flex-1 flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: `#${stage.color}` }}
                            />
                            <span className="font-medium">{stage.title}</span>
                          </div>
                          <Badge variant="secondary">{stage.dealsCount}</Badge>
                        </label>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
                      {selectedDeal.customField54}
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

                {selectedDeal.closingDate && (
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Data de Fechamento</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedDeal.closingDate).toLocaleDateString(
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
