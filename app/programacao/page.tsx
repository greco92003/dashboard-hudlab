"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
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
  User,
  Palette,
  RefreshCw,
  DollarSign,
  Clock,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { AveragePairsCalculator } from "@/components/average-pairs-calculator";

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageTitle: string | null;
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
  const [sortBy, setSortBy] = useState<"value" | "title" | "date">("value");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 100 is default, can go down to show more cards
  const [activeCards, setActiveCards] = useState<Set<string>>(new Set()); // Track which cards are active (on/off)

  // Get sidebar state to hide header when collapsed
  const { state } = useSidebar();

  // Check if a deal is overdue
  const isDealOverdue = (deal: Deal): boolean => {
    // Finished stages are never overdue
    const finishedStages = [
      "Recebido Pedido",
      "Recebido Amostra",
      "Em trânsito (Link Rastreio)",
    ];

    if (deal.stageTitle && finishedStages.includes(deal.stageTitle)) {
      return false;
    }

    // If no shipping date, not overdue
    if (!deal.customField54) {
      return false;
    }

    // Parse shipping date
    const shippingDate = parseDate(deal.customField54);
    if (!shippingDate) {
      return false;
    }

    // Get current date in Brasília timezone
    const currentDate = getCurrentDateBrasilia();
    const daysUntilShipping = getDaysDifference(shippingDate, currentDate);

    // Overdue if days until shipping is negative
    return daysUntilShipping < 0;
  };

  // Reorganize groups to create "Em atraso" and "Finalizados" groups
  const getReorganizedGroups = (): Group[] => {
    if (!data) return [];

    const finishedStages = [
      "Recebido Pedido",
      "Recebido Amostra",
      "Em trânsito (Link Rastreio)",
    ];

    // Collect all finished deals, overdue deals, and remaining deals from all groups
    const finishedDeals: Deal[] = [];
    const overdueDeals: Deal[] = [];
    const remainingGroups: Group[] = [];

    data.groups.forEach((group) => {
      const groupFinishedDeals: Deal[] = [];
      const groupOverdueDeals: Deal[] = [];
      const groupRemainingDeals: Deal[] = [];

      group.deals.forEach((deal) => {
        if (deal.stageTitle && finishedStages.includes(deal.stageTitle)) {
          groupFinishedDeals.push(deal);
        } else if (isDealOverdue(deal)) {
          groupOverdueDeals.push(deal);
        } else {
          groupRemainingDeals.push(deal);
        }
      });

      finishedDeals.push(...groupFinishedDeals);
      overdueDeals.push(...groupOverdueDeals);

      // Only keep groups that have remaining deals
      if (groupRemainingDeals.length > 0) {
        remainingGroups.push({
          ...group,
          deals: groupRemainingDeals,
          dealsCount: groupRemainingDeals.length,
        });
      }
    });

    // Create the "Em atraso" group
    const emAtrasoGroup: Group = {
      id: "em-atraso",
      title: "Em atraso",
      dealsCount: overdueDeals.length,
      deals: overdueDeals,
    };

    // Create the "Finalizados" group
    const finalizadosGroup: Group = {
      id: "finalizados",
      title: "Finalizados",
      dealsCount: finishedDeals.length,
      deals: finishedDeals,
    };

    // Sort remaining groups - "Sem data de embarque" should be before "Finalizados"
    const sortedRemainingGroups = remainingGroups.sort((a, b) => {
      if (a.title === "Sem data de embarque") return 1;
      if (b.title === "Sem data de embarque") return -1;
      return 0;
    });

    // Build final groups array: "Em atraso" first, then remaining groups, then "Finalizados"
    const finalGroups: Group[] = [];

    if (overdueDeals.length > 0) {
      finalGroups.push(emAtrasoGroup);
    }

    finalGroups.push(...sortedRemainingGroups);

    if (finishedDeals.length > 0) {
      finalGroups.push(finalizadosGroup);
    }

    return finalGroups;
  };

  // Load active cards from Supabase
  const loadActiveCardsFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from("programacao_card_states")
        .select("deal_id, is_active");

      if (error) {
        console.error("Error loading active cards from Supabase:", error);
        return;
      }

      if (data) {
        const activeCardIds = new Set<string>(
          data.filter((item) => item.is_active).map((item) => item.deal_id)
        );
        setActiveCards(activeCardIds);
      }
    } catch (error) {
      console.error("Error loading active cards:", error);
    }
  };

  // Save active card state to Supabase
  const saveActiveCardToSupabase = async (
    dealId: string,
    isActive: boolean
  ) => {
    try {
      const { error } = await supabase.from("programacao_card_states").upsert(
        {
          deal_id: dealId,
          is_active: isActive,
        },
        {
          onConflict: "deal_id",
        }
      );

      if (error) {
        console.error("Error saving active card to Supabase:", error);
      }
    } catch (error) {
      console.error("Error saving active card:", error);
    }
  };

  useEffect(() => {
    fetchProgramacaoData();
    loadActiveCardsFromSupabase();
  }, []);

  // Load from localStorage after hydration
  useEffect(() => {
    setIsHydrated(true);

    // Load sortBy
    const savedSortBy = localStorage.getItem("programacao-sortBy");
    if (savedSortBy) {
      setSortBy(savedSortBy as "value" | "title" | "date");
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

    // Load isHeaderCollapsed
    const savedHeaderCollapsed = localStorage.getItem(
      "programacao-headerCollapsed"
    );
    if (savedHeaderCollapsed !== null) {
      setIsHeaderCollapsed(savedHeaderCollapsed === "true");
    }

    // Load zoomLevel
    const savedZoomLevel = localStorage.getItem("programacao-zoomLevel");
    if (savedZoomLevel) {
      setZoomLevel(Number(savedZoomLevel));
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

  // Save isHeaderCollapsed to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(
        "programacao-headerCollapsed",
        isHeaderCollapsed.toString()
      );
    }
  }, [isHeaderCollapsed, isHydrated]);

  // Save zoomLevel to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("programacao-zoomLevel", zoomLevel.toString());
    }
  }, [zoomLevel, isHydrated]);

  // Initialize visible groups and active cards when data is loaded
  useEffect(() => {
    if (data && visibleGroups.size === 0) {
      const allGroupIds = new Set<string>();
      const reorganizedGroups = getReorganizedGroups();
      reorganizedGroups.forEach((group) => {
        if (group.deals.length > 0) {
          allGroupIds.add(group.id);
        }
      });
      setVisibleGroups(allGroupIds);
    }

    // Initialize new cards as active in Supabase if they don't exist
    if (data) {
      const initializeNewCards = async () => {
        try {
          // Get all deal IDs from current data
          const allDealIds = new Set<string>();
          data.groups.forEach((group) => {
            group.deals.forEach((deal) => {
              allDealIds.add(deal.id);
            });
          });

          // Get existing card states from Supabase
          const { data: existingStates, error } = await supabase
            .from("programacao_card_states")
            .select("deal_id");

          if (error) {
            console.error("Error fetching existing card states:", error);
            return;
          }

          const existingDealIds = new Set(
            existingStates?.map((state) => state.deal_id) || []
          );

          // Find new deals that don't have a state in Supabase
          const newDealIds = Array.from(allDealIds).filter(
            (dealId) => !existingDealIds.has(dealId)
          );

          // Insert new deals as active
          if (newDealIds.length > 0) {
            const newStates = newDealIds.map((dealId) => ({
              deal_id: dealId,
              is_active: true,
            }));

            const { error: insertError } = await supabase
              .from("programacao_card_states")
              .insert(newStates);

            if (insertError) {
              console.error("Error inserting new card states:", insertError);
            } else {
              // Reload active cards after inserting new ones
              loadActiveCardsFromSupabase();
            }
          }
        } catch (error) {
          console.error("Error initializing new cards:", error);
        }
      };

      initializeNewCards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Calculate total pairs for a group
  const calculateTotalPairs = (deals: Deal[]): number => {
    return deals.reduce((sum, deal) => {
      const pairs = parseInt(deal.quantidadePares || "0");
      return sum + pairs;
    }, 0);
  };

  // Sort deals within each group
  const sortDeals = (deals: Deal[], groupId?: string) => {
    return [...deals].sort((a, b) => {
      let comparison = 0;

      // For "Em atraso" group, always sort by shipping date (most overdue first)
      // but still respect the sort direction from the select
      if (groupId === "em-atraso") {
        const dateA = parseDate(a.customField54 || "");
        const dateB = parseDate(b.customField54 || "");

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        // Sort by date ascending (oldest/most overdue first) when sortDirection is "asc"
        // Sort by date descending (least overdue first) when sortDirection is "desc"
        comparison = dateA.getTime() - dateB.getTime();

        // Apply sort direction
        return sortDirection === "asc" ? comparison : -comparison;
      }

      // For other groups, use the selected sort option
      switch (sortBy) {
        case "value":
          comparison = b.value - a.value;
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
    const reorganizedGroups = getReorganizedGroups();
    reorganizedGroups.forEach((group) => {
      if (group.deals.length > 0) {
        allGroupIds.add(group.id);
      }
    });
    setVisibleGroups(allGroupIds);
  };

  const handleDeselectAllGroups = () => {
    setVisibleGroups(new Set());
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 10, 100)); // Max 100%
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 10, 50)); // Min 50%
  };

  // Calculate card width based on zoom level
  const getCardWidth = () => {
    // At 100% zoom: 320px (w-80)
    // At 50% zoom: 160px
    const baseWidth = 320;
    return (baseWidth * zoomLevel) / 100;
  };

  // Toggle card active state
  const handleCardToggle = (dealId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click event
    setActiveCards((prev) => {
      const newSet = new Set(prev);
      const isActive = !newSet.has(dealId);

      if (newSet.has(dealId)) {
        newSet.delete(dealId);
      } else {
        newSet.add(dealId);
      }

      // Save to Supabase
      saveActiveCardToSupabase(dealId, isActive);

      return newSet;
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 min-w-0">
      {/* Collapsible Header Section */}
      {!isHeaderCollapsed && (
        <>
          {/* Page Title */}
          <div className="flex items-center gap-3 flex-shrink-0">
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

              {/* Average Pairs Calculator */}
              <AveragePairsCalculator
                deals={data?.groups.flatMap((group) => group.deals) || []}
                activeCards={activeCards}
              />
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
        </>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex-1 overflow-hidden min-h-0 min-w-0">
          <Skeleton className="h-full w-full" />
        </div>
      ) : data && data.groups.length > 0 ? (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0 min-w-0">
          {/* Summary Header with Collapse Toggle and Zoom Controls */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="h-8 w-8"
                title={
                  isHeaderCollapsed
                    ? "Expandir cabeçalho"
                    : "Recolher cabeçalho"
                }
              >
                {isHeaderCollapsed ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronUp className="h-5 w-5" />
                )}
              </Button>
              <h2 className="text-xl font-bold">Data de Embarque</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 50}
                  className="h-7 w-7"
                  title="Diminuir zoom (mostrar mais cards)"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-2 min-w-[3rem] text-center">
                  {zoomLevel}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 100}
                  className="h-7 w-7"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <Badge variant="outline">
                {data.summary.totalDeals}{" "}
                {data.summary.totalDeals === 1 ? "deal" : "deals"}
              </Badge>
            </div>
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
                {getReorganizedGroups()
                  .filter(
                    (group) =>
                      group.deals.length > 0 && visibleGroups.has(group.id)
                  )
                  .map((group) => (
                    <div
                      key={group.id}
                      className="flex-shrink-0 h-full transition-all duration-200"
                      style={{
                        width: `${getCardWidth()}px`,
                        minWidth: `${getCardWidth()}px`,
                      }}
                    >
                      {/* Group Card */}
                      <Card className="h-full flex flex-col">
                        <CardHeader className="pb-3 flex-shrink-0">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold">
                              {group.id === "finalizados" ||
                              group.id === "em-atraso"
                                ? group.title
                                : formatDate(group.title)}
                            </CardTitle>
                            <Badge variant="secondary" className="ml-2">
                              {group.dealsCount}
                            </Badge>
                          </div>
                          {/* Total de pares do grupo */}
                          <div className="text-sm text-muted-foreground mt-2">
                            Total: {calculateTotalPairs(group.deals)} pares
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 flex-1 overflow-y-auto">
                          {group.deals.length > 0 ? (
                            sortDeals(group.deals, group.id).map((deal) => {
                              const isActive = activeCards.has(deal.id);
                              return (
                                <Card
                                  key={deal.id}
                                  className={`p-3 hover:shadow-md transition-all cursor-pointer border relative ${
                                    isActive
                                      ? getCardBackgroundClass(deal)
                                      : "opacity-40 grayscale bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                                  }`}
                                  onClick={() => handleDealClick(deal)}
                                >
                                  {/* Toggle Button */}
                                  <button
                                    onClick={(e) =>
                                      handleCardToggle(deal.id, e)
                                    }
                                    className={`absolute top-2 right-2 p-1 rounded-full transition-all hover:scale-110 ${
                                      isActive
                                        ? "bg-green-500 text-white hover:bg-green-600"
                                        : "bg-gray-400 text-white hover:bg-gray-500"
                                    }`}
                                    title={
                                      isActive
                                        ? "Desativar card"
                                        : "Ativar card"
                                    }
                                  >
                                    <Power className="h-3 w-3" />
                                  </button>

                                  <div className="space-y-2 pr-8">
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

                                    {/* Deal Details - Only Quantidade de Pares and Vendedor */}
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
                                    </div>
                                  </div>
                                </Card>
                              );
                            })
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

              {/* Details Grid - Only Quantidade de Pares, Vendedor and Designer */}
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
