"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Target, TrendingUp, Users, Trophy, AlertTriangle } from "lucide-react";

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
}

interface GoalProgressData {
  goal: Goal;
  generalProgress: {
    current: number;
    target: number | null;
    progress: number;
  };
  individualProgress: Record<string, { current: number; progress: number }>;
  shouldArchive: boolean;
}

interface GoalProgressProps {
  goalId: string;
  onGoalArchived?: () => void;
  mockData?: {
    goal: Goal;
    generalProgress: {
      current: number;
      target: number | null;
      progress: number;
    };
    individualProgress: Record<string, { current: number; progress: number }>;
  };
}

export function GoalProgress({
  goalId,
  onGoalArchived,
  mockData,
}: GoalProgressProps) {
  const [progressData, setProgressData] = useState<GoalProgressData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/goals/progress?goalId=${goalId}`);
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
  }, [goalId, onGoalArchived]);

  useEffect(() => {
    if (mockData) {
      setProgressData({
        goal: mockData.goal,
        generalProgress: mockData.generalProgress,
        individualProgress: mockData.individualProgress,
        shouldArchive: false,
      });
      setLoading(false);
    } else {
      fetchProgress();
    }
  }, [fetchProgress, mockData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-2 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !progressData) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-red-500">{error || "Erro ao carregar dados"}</p>
        </CardContent>
      </Card>
    );
  }

  const { goal, generalProgress, individualProgress } = progressData;

  const formatValue = (value: number) => {
    if (goal.goal_type === "total_sales") {
      return formatCurrency(value, "BRL");
    } else {
      return `${value.toLocaleString()} pares`;
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-500";
    if (progress >= 90) return "bg-blue-500";
    if (progress >= 75) return "bg-yellow-500";
    if (progress >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100) return <Trophy className="h-4 w-4 text-green-600" />;
    if (progress >= 90) return <TrendingUp className="h-4 w-4 text-blue-600" />;
    return <AlertTriangle className="h-4 w-4 text-orange-600" />;
  };

  const isExpired = new Date(goal.end_date) < new Date();
  const daysRemaining = Math.ceil(
    (new Date(goal.end_date).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {goal.title}
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant={goal.status === "active" ? "default" : "secondary"}>
              {goal.status === "active" ? "Ativa" : "Arquivada"}
            </Badge>
            {generalProgress.progress >= 100 && goal.status === "active" && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800"
              >
                Meta Batida! 🏆
              </Badge>
            )}
            {generalProgress.progress >= 90 &&
              generalProgress.progress < 100 &&
              goal.status === "active" && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-800"
                >
                  Quase lá! 🎯
                </Badge>
              )}
            {isExpired && goal.status === "active" && (
              <Badge variant="destructive">Expirada</Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{goal.description}</p>
        <div className="text-xs text-muted-foreground">
          {isExpired ? (
            <span className="text-red-500">
              Expirou em {new Date(goal.end_date).toLocaleDateString("pt-BR")}
            </span>
          ) : (
            <span>
              {daysRemaining > 0
                ? `${daysRemaining} dias restantes`
                : "Último dia"}{" "}
              • Termina em {new Date(goal.end_date).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* General Progress */}
        {goal.general_goal_value && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
            <Progress value={generalProgress.progress} className="h-4" />
            <div className="flex justify-between text-sm">
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

        {/* Individual Progress */}
        {goal.individual_goal_value &&
          Object.keys(individualProgress).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="font-medium">
                  Meta por{" "}
                  {goal.target_type === "sellers" ? "Vendedor" : "Designer"}
                </span>
              </div>

              <div className="space-y-4">
                {Object.entries(individualProgress)
                  .sort(([, a], [, b]) => b.progress - a.progress)
                  .map(([name, data]) => (
                    <div
                      key={name}
                      className="space-y-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{name}</span>
                          {getProgressIcon(data.progress)}
                          {data.progress >= 100 && (
                            <Badge
                              variant="secondary"
                              className="bg-green-100 text-green-800 text-xs"
                            >
                              Meta batida!
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
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
                        {data.progress >= 100 ? (
                          <span className="text-green-600 font-medium flex items-center gap-1">
                            <Trophy className="h-3 w-3" />+
                            {formatValue(
                              data.current - goal.individual_goal_value!
                            )}{" "}
                            acima da meta!
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Faltam{" "}
                            {formatValue(
                              goal.individual_goal_value! - data.current
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

        {/* No progress data */}
        {!goal.general_goal_value && !goal.individual_goal_value && (
          <div className="text-center text-muted-foreground py-4">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma meta configurada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
