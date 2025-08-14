"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  Target,
  TrendingUp,
  Users,
  Trophy,
  AlertTriangle,
  Edit,
  Archive,
  Trash2,
  ChevronDown,
  ChevronUp,
  Gift,
  Star,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Reward {
  id: string;
  description: string;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  created_date: string;
  start_date: string;
  end_date: string;
  general_goal_value: number | null;
  individual_goal_value: number | null;
  goal_type: "total_sales" | "pairs_sold";
  target_type: "sellers" | "designers";
  status: "active" | "archived";
  created_by_name: string | null;
  created_at: string;
  rewards: Reward[];
}

interface ProgressData {
  goal: Goal;
  generalProgress: {
    current: number;
    target: number | null;
    progress: number;
  };
  individualProgress: Record<string, { current: number; progress: number }>;
  shouldArchive?: boolean;
}

interface GoalCardWithProgressProps {
  goal: Goal;
  isOwnerOrAdmin: boolean;
  onEdit: (goal: Goal) => void;
  onArchive: (goalId: string) => void;
  onDelete: (goalId: string) => void;
  onGoalArchived?: () => void;
  mockData?: ProgressData;
}

export function GoalCardWithProgress({
  goal,
  isOwnerOrAdmin,
  onEdit,
  onArchive,
  onDelete,
  onGoalArchived,
  mockData,
}: GoalCardWithProgressProps) {
  const [progressData, setProgressData] = useState<ProgressData | null>(
    mockData || null
  );
  const [loading, setLoading] = useState(!mockData);
  const [error, setError] = useState<string | null>(null);
  // Show individual progress by default when there's no general goal
  const [showIndividualProgress, setShowIndividualProgress] = useState(
    !goal.general_goal_value
  );

  const isExpired = (endDate: string) => {
    const today = new Date().toISOString().split("T")[0];
    return endDate < today;
  };

  const getGoalTypeLabel = (goalType: string) => {
    return goalType === "total_sales" ? "Vendas" : "Pares Vendidos";
  };

  const formatValue = (value: number, type?: string) => {
    if (type === "pairs_sold" || goal.goal_type === "pairs_sold") {
      return `${value.toLocaleString()} pares`;
    }
    return formatCurrency(value);
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100) return <Trophy className="h-3 w-3 text-yellow-500" />;
    if (progress >= 90) return <TrendingUp className="h-3 w-3 text-blue-500" />;
    if (progress < 50)
      return <AlertTriangle className="h-3 w-3 text-orange-500" />;
    return null;
  };

  const fetchProgress = useCallback(async () => {
    if (mockData) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/goals/progress?goalId=${goal.id}`);
      const result = await response.json();

      if (response.ok) {
        setProgressData(result.data);

        // If goal was auto-archived, notify parent
        if (result.data.shouldArchive && onGoalArchived) {
          onGoalArchived();
        }
      } else {
        setError(result.error || "Erro ao carregar progresso da meta");
      }
    } catch (error) {
      console.error("Error fetching goal progress:", error);
      setError("Erro ao carregar progresso da meta");
    } finally {
      setLoading(false);
    }
  }, [goal.id, mockData, onGoalArchived]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bars skeleton */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>

          {/* Action buttons skeleton */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{goal.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 text-sm">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!progressData) return null;

  const { generalProgress, individualProgress } = progressData;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg leading-tight">
              {goal.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {goal.description}
            </p>
            <div className="text-xs text-muted-foreground">
              Criada por {goal.created_by_name || "Usuário desconhecido"} •{" "}
              {new Date(goal.start_date).toLocaleDateString("pt-BR")} até{" "}
              {new Date(goal.end_date).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <Badge variant={goal.status === "active" ? "default" : "secondary"}>
              {goal.status === "active" ? "Ativa" : "Arquivada"}
            </Badge>
            <Badge variant="outline">{getGoalTypeLabel(goal.goal_type)}</Badge>
            {generalProgress.progress >= 100 && goal.status === "active" && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              >
                Meta Batida! 🏆
              </Badge>
            )}
            {generalProgress.progress >= 90 &&
              generalProgress.progress < 100 &&
              goal.status === "active" && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  Quase lá! 🎯
                </Badge>
              )}
            {isExpired(goal.end_date) && goal.status === "active" && (
              <Badge variant="destructive">Expirada</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* General Progress */}
        {goal.general_goal_value && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium">Meta Geral</span>
                {generalProgress.progress >= 90 && (
                  <Trophy className="h-4 w-4 text-yellow-500" />
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {formatValue(generalProgress.current)} /{" "}
                {formatValue(generalProgress.target!)}
              </span>
            </div>
            <Progress value={generalProgress.progress} className="h-3" />
            <div className="flex flex-col sm:flex-row justify-between gap-1 text-sm">
              <span className="font-medium text-green-600">
                {generalProgress.progress.toFixed(1)}% concluído
              </span>
              <span className="text-muted-foreground">
                {generalProgress.progress >= 100 ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    Meta atingida! 🎉
                  </span>
                ) : (
                  `Faltam ${formatValue(
                    generalProgress.target! - generalProgress.current
                  )}`
                )}
              </span>
            </div>
          </div>
        )}

        {/* Rewards Section - Show when goal is achieved */}
        {((goal.general_goal_value && generalProgress.progress >= 100) ||
          (goal.individual_goal_value &&
            Object.values(individualProgress).some(
              (p) => p.progress >= 100
            ))) &&
          goal.rewards &&
          goal.rewards.length > 0 && (
            <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-3">
                <Gift className="h-5 w-5 text-yellow-600" />
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  🎉 Premiações Liberadas!
                </h4>
              </div>
              <div className="space-y-2">
                {goal.rewards.map((reward, index) => (
                  <div
                    key={reward.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                    <span className="text-yellow-700 dark:text-yellow-300">
                      {reward.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Individual Progress */}
        {goal.individual_goal_value &&
          Object.keys(individualProgress).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Progresso Individual</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    ({Object.keys(individualProgress).length} pessoas)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setShowIndividualProgress(!showIndividualProgress)
                  }
                  className="h-8 px-2"
                >
                  {showIndividualProgress ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {showIndividualProgress && (
                <div className="space-y-3 mt-3">
                  {Object.entries(individualProgress)
                    .sort(([, a], [, b]) => b.progress - a.progress)
                    .slice(0, 3) // Show only top 3 to keep card compact
                    .map(([name, data]) => (
                      <div
                        key={name}
                        className="space-y-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate">
                              {name}
                            </span>
                            {getProgressIcon(data.progress)}
                            {data.progress >= 100 && (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"
                              >
                                Meta batida!
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatValue(data.current)} /{" "}
                            {formatValue(goal.individual_goal_value!)}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(data.progress, 100)}
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs">
                          <span
                            className={`font-medium ${
                              data.progress >= 100
                                ? "text-green-600"
                                : data.progress >= 90
                                ? "text-blue-600"
                                : "text-gray-600"
                            }`}
                          >
                            {data.progress.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  {Object.keys(individualProgress).length > 3 && (
                    <div className="text-xs text-muted-foreground text-center">
                      +{Object.keys(individualProgress).length - 3} pessoas
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          {isOwnerOrAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(goal)}
                className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
              >
                <Edit className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Editar</span>
              </Button>
              {goal.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onArchive(goal.id)}
                  className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                >
                  <Archive className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">
                    Arquivar
                  </span>
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">
                      Excluir
                    </span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir esta meta? Esta ação não
                      pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(goal.id)}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
