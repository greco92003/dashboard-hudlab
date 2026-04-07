"use client";

import { useState, useEffect, useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Wrench,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Star,
  Ban,
  RotateCcw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Money input helpers (same pattern as fixed-costs)
const formatCurrencyDisplay = (value: number): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const handleMoneyInputChange = (
  newInput: string,
  setValue: (v: string) => void,
) => {
  const digitsOnly = newInput.replace(/\D/g, "");
  if (digitsOnly === "") {
    setValue("");
    return;
  }
  const cents = parseInt(digitsOnly);
  setValue(
    (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
};

const parseCurrencyValue = (formatted: string): number => {
  const clean = formatted.replace(/[^\d,\.]/g, "");
  return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
};

// Types
interface ToolCost {
  id: string;
  tool_name: string;
  icon_url?: string | null;
  color: string;
  monthly_cost: number;
  usage_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
}

interface ToolCostHistory {
  id: string;
  tool_id: string;
  month: number;
  year: number;
  cost: number;
  created_at: string;
  tools_costs?: {
    tool_name: string;
    color: string;
    icon_url?: string | null;
  };
}

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Color picker presets
const COLOR_PRESETS = [
  "#10a37f",
  "#6366f1",
  "#3ecf8e",
  "#64748b",
  "#356ae6",
  "#ff6e40",
  "#6d00cc",
  "#e74c3c",
  "#4285f4",
  "#34a853",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#0ea5e9",
  "#ef4444",
];

// Tool icon component
function ToolIcon({ tool }: { tool: ToolCost }) {
  const [imgError, setImgError] = useState(false);
  if (tool.icon_url && !imgError) {
    return (
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border"
        style={{
          borderColor: tool.color + "40",
          backgroundColor: tool.color + "15",
        }}
      >
        <img
          src={tool.icon_url}
          alt={tool.tool_name}
          className="w-5 h-5 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
      style={{ backgroundColor: tool.color }}
    >
      {tool.tool_name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ToolsCostPage() {
  const { isOwner, isAdmin, loading: permissionsLoading } = usePermissions();
  const router = useRouter();

  const [tools, setTools] = useState<ToolCost[]>([]);
  const [history, setHistory] = useState<ToolCostHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonths, setHistoryMonths] = useState("6");

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolCost | null>(null);
  const [deletingTool, setDeletingTool] = useState<ToolCost | null>(null);
  const [cancellingTool, setCancellingTool] = useState<ToolCost | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    tool_name: "",
    icon_url: "",
    color: "#6366f1",
    monthly_cost: "",
    usage_score: 1,
    // Price change fields (used only when editing)
    effective_month: new Date().getMonth() + 1,
    effective_year: new Date().getFullYear(),
    change_type: "recurring" as "recurring" | "one_time",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // History edit state
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryCost, setEditingHistoryCost] = useState("");

  const fetchTools = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tools-cost");
      if (!res.ok) throw new Error("Failed to fetch tools");
      const json = await res.json();
      setTools(json.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar ferramentas");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch(
        `/api/tools-cost/history?monthsBack=${historyMonths}`,
      );
      if (!res.ok) throw new Error("Failed to fetch history");
      const json = await res.json();
      setHistory(json.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar histórico");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMonths]);

  useEffect(() => {
    if (!permissionsLoading && !isOwner && !isAdmin) {
      router.push("/dashboard");
    }
  }, [permissionsLoading, isOwner, isAdmin, router]);

  useEffect(() => {
    if (!permissionsLoading && (isOwner || isAdmin)) {
      fetchTools();
      fetchHistory();
    }
  }, [permissionsLoading, isOwner, isAdmin, fetchTools, fetchHistory]);

  const openCreateDialog = () => {
    setEditingTool(null);
    setFormData({
      tool_name: "",
      icon_url: "",
      color: "#6366f1",
      monthly_cost: "",
      usage_score: 1,
      effective_month: new Date().getMonth() + 1,
      effective_year: new Date().getFullYear(),
      change_type: "recurring",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (tool: ToolCost) => {
    setEditingTool(tool);
    setFormData({
      tool_name: tool.tool_name,
      icon_url: tool.icon_url || "",
      color: tool.color,
      monthly_cost: formatCurrencyDisplay(tool.monthly_cost),
      usage_score: tool.usage_score ?? 1,
      effective_month: new Date().getMonth() + 1,
      effective_year: new Date().getFullYear(),
      change_type: "recurring",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.tool_name.trim()) {
      toast.error("Nome da ferramenta é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const cost = parseCurrencyValue(formData.monthly_cost);
      const baseBody = {
        tool_name: formData.tool_name.trim(),
        icon_url: formData.icon_url.trim() || null,
        color: formData.color,
        monthly_cost: cost,
        usage_score: formData.usage_score,
      };
      const editBody = editingTool
        ? {
            id: editingTool.id,
            ...baseBody,
            effective_month: formData.effective_month,
            effective_year: formData.effective_year,
            change_type: formData.change_type,
          }
        : baseBody;

      const res = await fetch("/api/tools-cost", {
        method: editingTool ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBody),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success(
        editingTool ? "Ferramenta atualizada!" : "Ferramenta criada!",
      );
      setIsDialogOpen(false);
      await fetchTools();
      await fetchHistory();
    } catch {
      toast.error("Erro ao salvar ferramenta");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTool) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tools-cost?id=${deletingTool.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Ferramenta excluída!");
      setIsDeleteDialogOpen(false);
      setDeletingTool(null);
      await fetchTools();
      await fetchHistory();
    } catch {
      toast.error("Erro ao excluir ferramenta");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (tool: ToolCost, is_active: boolean) => {
    setTogglingActive(true);
    try {
      const res = await fetch("/api/tools-cost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tool.id, is_active }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      toast.success(
        is_active ? "Ferramenta reativada!" : "Ferramenta cancelada!",
      );
      setIsCancelDialogOpen(false);
      setCancellingTool(null);
      await fetchTools();
    } catch {
      toast.error("Erro ao atualizar ferramenta");
    } finally {
      setTogglingActive(false);
    }
  };

  // Upsert a history cell — works for existing records (PUT) and new ones (POST)
  const handleSaveHistoryCost = async (
    toolId: string,
    month: number,
    year: number,
    existingId?: string,
  ) => {
    try {
      const cost = parseCurrencyValue(editingHistoryCost);
      let res: Response;
      if (existingId) {
        res = await fetch("/api/tools-cost/history", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existingId, cost }),
        });
      } else {
        res = await fetch("/api/tools-cost/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_id: toolId, month, year, cost }),
        });
      }
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Custo atualizado!");
      setEditingHistoryId(null);
      await fetchHistory();
    } catch {
      toast.error("Erro ao atualizar custo");
    }
  };

  // Active vs cancelled split
  const activeTools = tools.filter((t) => t.is_active !== false);
  const cancelledTools = tools.filter((t) => t.is_active === false);

  // Compute summary stats (active tools only)
  const totalMonthlyCost = activeTools.reduce(
    (sum, t) => sum + t.monthly_cost,
    0,
  );
  const mostExpensiveTool = activeTools.reduce(
    (max, t) => (t.monthly_cost > (max?.monthly_cost || 0) ? t : max),
    activeTools[0] || null,
  );

  // Previous month comparison from history
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
  const prevYear = thisMonth === 1 ? thisYear - 1 : thisYear;

  const prevMonthHistory = history.filter(
    (h) => h.month === prevMonth && h.year === prevYear,
  );
  const prevMonthTotal = prevMonthHistory.reduce((sum, h) => sum + h.cost, 0);
  const monthDiff =
    prevMonthTotal > 0
      ? ((totalMonthlyCost - prevMonthTotal) / prevMonthTotal) * 100
      : null;

  // Prepare chart data for stacked bar
  const chartMonths: {
    [key: string]: { label: string } & Record<string, number | string>;
  } = {};
  history.forEach((h) => {
    const key = `${h.year}-${String(h.month).padStart(2, "0")}`;
    if (!chartMonths[key]) {
      chartMonths[key] = { label: `${MONTH_NAMES[h.month - 1]}/${h.year}` };
    }
    const toolName = h.tools_costs?.tool_name || "Unknown";
    chartMonths[key][toolName] =
      ((chartMonths[key][toolName] as number) || 0) + h.cost;
  });
  const barChartData = Object.values(chartMonths).sort((a, b) =>
    String(a.label).localeCompare(String(b.label)),
  );

  // Pie chart data - active tools only
  const pieData = activeTools
    .filter((t) => t.monthly_cost > 0)
    .map((t) => ({ name: t.tool_name, value: t.monthly_cost, color: t.color }));

  if (permissionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isOwner && !isAdmin) return null;

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Custos de Ferramentas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie os custos mensais das ferramentas utilizadas
            </p>
          </div>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Ferramenta
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Mensal
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(totalMonthlyCost)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mais Cara
              </CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-32" />
              ) : mostExpensiveTool ? (
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: mostExpensiveTool.color }}
                  />
                  <div>
                    <div className="font-semibold text-sm leading-tight">
                      {mostExpensiveTool.tool_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(mostExpensiveTool.monthly_cost)}/mês
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ferramentas
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-8" />
              ) : (
                <div className="text-2xl font-bold">{activeTools.length}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                vs Mês Anterior
              </CardTitle>
              {monthDiff !== null ? (
                monthDiff >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )
              ) : (
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : monthDiff !== null ? (
                <div
                  className={`text-2xl font-bold ${monthDiff >= 0 ? "text-red-500" : "text-green-500"}`}
                >
                  {monthDiff >= 0 ? "+" : ""}
                  {monthDiff.toFixed(1)}%
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  Sem dados anteriores
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="tools">
          <TabsList>
            <TabsTrigger value="tools">Ferramentas</TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="cancelled" className="relative">
              Canceladas
              {cancelledTools.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold w-4 h-4">
                  {cancelledTools.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : activeTools.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma ferramenta ativa. Clique em &quot;Nova Ferramenta&quot;
                para começar.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeTools.map((tool) => (
                  <Card
                    key={tool.id}
                    className="group hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <ToolIcon tool={tool} />
                          <div>
                            <div className="font-medium">{tool.tool_name}</div>
                            <div className="flex items-center gap-0.5 mt-0.5 mb-0.5">
                              {[1, 2, 3].map((s) => (
                                <Star
                                  key={s}
                                  className="h-3 w-3"
                                  style={{
                                    fill:
                                      s <= (tool.usage_score ?? 1)
                                        ? tool.color
                                        : "transparent",
                                    color:
                                      s <= (tool.usage_score ?? 1)
                                        ? tool.color
                                        : "currentColor",
                                    opacity:
                                      s <= (tool.usage_score ?? 1) ? 1 : 0.25,
                                  }}
                                />
                              ))}
                            </div>
                            <div
                              className="text-lg font-bold"
                              style={{ color: tool.color }}
                            >
                              {formatCurrency(tool.monthly_cost)}
                              <span className="text-xs text-muted-foreground font-normal">
                                /mês
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditDialog(tool)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-orange-500 hover:text-orange-600"
                            title="Cancelar ferramenta"
                            onClick={() => {
                              setCancellingTool(tool);
                              setIsCancelDialogOpen(true);
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeletingTool(tool);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div
                        className="mt-3 h-1 rounded-full opacity-30"
                        style={{ backgroundColor: tool.color }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="space-y-6">
            <div className="flex items-center gap-2">
              <Label>Período:</Label>
              <Select value={historyMonths} onValueChange={setHistoryMonths}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Stacked Bar Chart */}
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Evolução de Custos por Ferramenta</CardTitle>
                  <CardDescription>
                    Custos mensais empilhados por ferramenta
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : barChartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      Sem dados de histórico para exibir
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={barChartData}
                        margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="opacity-30"
                        />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
                          }
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name,
                          ]}
                        />
                        <Legend />
                        {activeTools.map((tool) => (
                          <Bar
                            key={tool.id}
                            dataKey={tool.tool_name}
                            stackId="stack"
                            fill={tool.color}
                            radius={[0, 0, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribuição Atual</CardTitle>
                  <CardDescription>
                    Percentual por ferramenta (mês atual)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : pieData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      Nenhum custo configurado
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => [
                              formatCurrency(value),
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-2">
                        {pieData.map((entry) => {
                          const pct =
                            totalMonthlyCost > 0
                              ? (
                                  (entry.value / totalMonthlyCost) *
                                  100
                                ).toFixed(1)
                              : "0";
                          return (
                            <div
                              key={entry.name}
                              className="flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="truncate max-w-[120px]">
                                  {entry.name}
                                </span>
                              </div>
                              <span className="text-muted-foreground">
                                {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Período:</Label>
                <Select value={historyMonths} onValueChange={setHistoryMonths}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Últimos 3 meses</SelectItem>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {historyLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">
                          Ferramenta
                        </th>
                        {/* Dynamic month headers */}
                        {Array.from({ length: parseInt(historyMonths) }).map(
                          (_, i) => {
                            const d = new Date(
                              thisYear,
                              thisMonth - 1 - (parseInt(historyMonths) - 1 - i),
                              1,
                            );
                            return (
                              <th
                                key={i}
                                className="text-center px-3 py-3 font-medium whitespace-nowrap"
                              >
                                {MONTH_NAMES[d.getMonth()]}/{d.getFullYear()}
                              </th>
                            );
                          },
                        )}
                        <th className="text-right px-4 py-3 font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tools.map((tool, tIdx) => {
                        const toolHistory = history.filter(
                          (h) => h.tool_id === tool.id,
                        );
                        // Row total: explicit records + recurring fallback for months without a record
                        const nMonths = parseInt(historyMonths);
                        const rowTotal = Array.from({ length: nMonths }).reduce(
                          (sum: number, _, i) => {
                            const d = new Date(
                              thisYear,
                              thisMonth - 1 - (nMonths - 1 - i),
                              1,
                            );
                            const m = d.getMonth() + 1;
                            const y = d.getFullYear();
                            const entry = toolHistory.find(
                              (h) => h.month === m && h.year === y,
                            );
                            return (
                              sum + (entry ? entry.cost : tool.monthly_cost)
                            );
                          },
                          0,
                        );
                        return (
                          <tr
                            key={tool.id}
                            className={`border-b ${tIdx % 2 === 0 ? "" : "bg-muted/20"}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: tool.color }}
                                />
                                {tool.tool_name}
                              </div>
                            </td>
                            {Array.from({ length: nMonths }).map((_, i) => {
                              const d = new Date(
                                thisYear,
                                thisMonth - 1 - (nMonths - 1 - i),
                                1,
                              );
                              const m = d.getMonth() + 1;
                              const y = d.getFullYear();
                              const entry = toolHistory.find(
                                (h) => h.month === m && h.year === y,
                              );
                              const isEditing =
                                editingHistoryId === `${tool.id}-${m}-${y}`;
                              // For months without explicit record, fall back to the tool's recurring cost
                              const displayCost = entry
                                ? entry.cost
                                : tool.monthly_cost;
                              const isRecurringFallback = !entry;
                              return (
                                <td key={i} className="px-3 py-3 text-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1 justify-center">
                                      <Input
                                        className="h-7 w-24 text-xs text-center"
                                        value={editingHistoryCost}
                                        onChange={(e) =>
                                          handleMoneyInputChange(
                                            e.target.value,
                                            setEditingHistoryCost,
                                          )
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            handleSaveHistoryCost(
                                              tool.id,
                                              m,
                                              y,
                                              entry?.id,
                                            );
                                          if (e.key === "Escape")
                                            setEditingHistoryId(null);
                                        }}
                                        autoFocus
                                      />
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6"
                                        onClick={() =>
                                          handleSaveHistoryCost(
                                            tool.id,
                                            m,
                                            y,
                                            entry?.id,
                                          )
                                        }
                                      >
                                        ✓
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      className={`text-xs transition-colors cursor-pointer hover:underline hover:text-primary ${
                                        isRecurringFallback
                                          ? "text-muted-foreground italic"
                                          : ""
                                      }`}
                                      onClick={() => {
                                        setEditingHistoryId(
                                          `${tool.id}-${m}-${y}`,
                                        );
                                        setEditingHistoryCost(
                                          formatCurrencyDisplay(displayCost),
                                        );
                                      }}
                                      title={
                                        isRecurringFallback
                                          ? "Valor recorrente (clique para substituir)"
                                          : "Clique para editar"
                                      }
                                    >
                                      {formatCurrency(displayCost)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(rowTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/50 font-medium">
                        <td className="px-4 py-3">Total</td>
                        {Array.from({ length: parseInt(historyMonths) }).map(
                          (_, i) => {
                            const d = new Date(
                              thisYear,
                              thisMonth - 1 - (parseInt(historyMonths) - 1 - i),
                              1,
                            );
                            const m = d.getMonth() + 1;
                            const y = d.getFullYear();
                            // Sum explicit records + recurring fallback for tools without a record this month
                            const monthTotal = tools.reduce((sum, tool) => {
                              const entry = history.find(
                                (h) =>
                                  h.tool_id === tool.id &&
                                  h.month === m &&
                                  h.year === y,
                              );
                              return (
                                sum + (entry ? entry.cost : tool.monthly_cost)
                              );
                            }, 0);
                            return (
                              <td key={i} className="px-3 py-3 text-center">
                                {formatCurrency(monthTotal)}
                              </td>
                            );
                          },
                        )}
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(
                            Array.from({
                              length: parseInt(historyMonths),
                            }).reduce((grandTotal: number, _, i) => {
                              const d = new Date(
                                thisYear,
                                thisMonth -
                                  1 -
                                  (parseInt(historyMonths) - 1 - i),
                                1,
                              );
                              const m = d.getMonth() + 1;
                              const y = d.getFullYear();
                              return (
                                grandTotal +
                                tools.reduce((sum, tool) => {
                                  const entry = history.find(
                                    (h) =>
                                      h.tool_id === tool.id &&
                                      h.month === m &&
                                      h.year === y,
                                  );
                                  return (
                                    sum +
                                    (entry ? entry.cost : tool.monthly_cost)
                                  );
                                }, 0)
                              );
                            }, 0),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Cancelled Tab */}
          <TabsContent value="cancelled" className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : cancelledTools.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma ferramenta cancelada.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cancelledTools.map((tool) => (
                  <Card
                    key={tool.id}
                    className="group opacity-60 hover:opacity-100 transition-opacity border-dashed"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <ToolIcon tool={tool} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium line-through text-muted-foreground">
                                {tool.tool_name}
                              </span>
                              <Ban className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Cancelada · {formatCurrency(tool.monthly_cost)}
                              /mês
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700"
                            title="Reativar ferramenta"
                            onClick={() => handleToggleActive(tool, true)}
                            disabled={togglingActive}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Excluir permanentemente"
                            onClick={() => {
                              setDeletingTool(tool);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div
                        className="mt-3 h-1 rounded-full opacity-20"
                        style={{ backgroundColor: tool.color }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTool ? "Editar Ferramenta" : "Nova Ferramenta"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tool_name">Nome da Ferramenta *</Label>
              <Input
                id="tool_name"
                placeholder="Ex: ChatGPT"
                value={formData.tool_name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, tool_name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="icon_url">URL do Ícone (opcional)</Label>
              <Input
                id="icon_url"
                placeholder="https://cdn.simpleicons.org/..."
                value={formData.icon_url}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, icon_url: e.target.value }))
                }
              />
              {formData.icon_url && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <img
                    src={formData.icon_url}
                    alt="preview"
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  Pré-visualização do ícone
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="monthly_cost">Custo Mensal (R$)</Label>
              <Input
                id="monthly_cost"
                placeholder="0,00"
                value={formData.monthly_cost}
                onChange={(e) =>
                  handleMoneyInputChange(e.target.value, (v) =>
                    setFormData((f) => ({ ...f, monthly_cost: v })),
                  )
                }
              />
            </div>

            {/* Price change settings — only shown when editing */}
            {editingTool && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Vigência da alteração de preço
                </p>

                {/* Month / Year selectors */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Mês</Label>
                    <Select
                      value={String(formData.effective_month)}
                      onValueChange={(v) =>
                        setFormData((f) => ({
                          ...f,
                          effective_month: parseInt(v),
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((name, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Ano</Label>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      min={2020}
                      max={2099}
                      value={formData.effective_year}
                      onChange={(e) =>
                        setFormData((f) => ({
                          ...f,
                          effective_year:
                            parseInt(e.target.value) ||
                            new Date().getFullYear(),
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Recurring vs One-time */}
                <div className="flex gap-2">
                  {(["recurring", "one_time"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setFormData((f) => ({ ...f, change_type: type }))
                      }
                      className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs transition-all ${
                        formData.change_type === type
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span className="text-base">
                        {type === "recurring" ? "🔄" : "📅"}
                      </span>
                      <span>
                        {type === "recurring"
                          ? "Recorrente"
                          : "Apenas este mês"}
                      </span>
                      <span className="font-normal opacity-70 leading-tight text-center">
                        {type === "recurring"
                          ? "Atualiza o valor base de todos os meses futuros"
                          : "Exceção só neste mês, base não muda"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Nível de Uso</Label>
              <div className="flex items-center gap-3">
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setFormData((f) => ({ ...f, usage_score: s }))
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all"
                    style={{
                      borderColor:
                        formData.usage_score === s
                          ? formData.color
                          : "transparent",
                      backgroundColor:
                        formData.usage_score === s
                          ? formData.color + "18"
                          : "transparent",
                    }}
                  >
                    {[1, 2, 3].map((star) => (
                      <Star
                        key={star}
                        className="h-4 w-4"
                        style={{
                          fill: star <= s ? formData.color : "transparent",
                          color: star <= s ? formData.color : "currentColor",
                          opacity: star <= s ? 1 : 0.2,
                        }}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground ml-0.5">
                      {s === 1 ? "Pouco" : s === 2 ? "Médio" : "Muito"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cor da Ferramenta</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, color: e.target.value }))
                  }
                  className="w-9 h-9 rounded-lg border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground font-mono">
                  {formData.color}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${formData.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormData((f) => ({ ...f, color: c }))}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Salvando..."
                : editingTool
                  ? "Salvar Alterações"
                  : "Criar Ferramenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Ferramenta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong>{deletingTool?.tool_name}</strong>? Todo o histórico de
              custos desta ferramenta também será excluído. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation */}
      <AlertDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Ferramenta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar{" "}
              <strong>{cancellingTool?.tool_name}</strong>? Ela será removida da
              lista de ferramentas ativas, mas todo o histórico e os dados dos
              gráficos serão preservados. Você pode reativá-la a qualquer
              momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                cancellingTool && handleToggleActive(cancellingTool, false)
              }
              disabled={togglingActive}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {togglingActive ? "Cancelando..." : "Cancelar Ferramenta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
