"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { GoalForm } from "./goal-form";
import { GoalCardWithProgress } from "./goal-card-with-progress";
import { usePermissions } from "@/hooks/usePermissions";
// import { useGoalsAutoArchive } from "@/hooks/useGoalsAutoArchive";
import { Plus, Edit, Trash2, Target, Archive } from "lucide-react";

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

interface GoalsListProps {
  targetType: "sellers" | "designers";
  hideHeader?: boolean; // Nova prop para ocultar o header
}

export function GoalsList({ targetType, hideHeader = false }: GoalsListProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isOwnerOrAdmin } = usePermissions();

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);

      const status = showArchived ? "archived" : "active";
      const response = await fetch(
        `/api/goals?targetType=${targetType}&status=${status}`
      );
      const result = await response.json();

      if (response.ok) {
        // Ensure rewards field is properly formatted (Supabase JSONB already parsed)
        const goalsWithParsedRewards = (result.data || []).map((goal: any) => {
          let rewards = [];
          try {
            if (Array.isArray(goal.rewards)) {
              rewards = goal.rewards;
            } else if (typeof goal.rewards === "string") {
              rewards = JSON.parse(goal.rewards);
            }
          } catch (error) {
            console.error("Error parsing rewards for goal:", goal.id, error);
            rewards = [];
          }

          return {
            ...goal,
            rewards,
          };
        });
        setGoals(goalsWithParsedRewards);
      } else {
        console.error("Error fetching goals:", result.error);
      }
    } catch (error) {
      console.error("Error fetching goals:", error);
    } finally {
      setLoading(false);
    }
  }, [targetType, showArchived]);

  // Auto-archive expired goals (temporariamente desabilitado)
  // useGoalsAutoArchive({
  //   autoArchive: false,
  //   checkInterval: 30 * 60 * 1000,
  //   onGoalsArchived: (archivedGoals) => {
  //     console.log(`Auto-archived ${archivedGoals.length} expired goals`);
  //     if (!showArchived) {
  //       fetchGoals();
  //     }
  //   },
  // });

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleCreateGoal = async (goalData: any) => {
    try {
      setIsSubmitting(true);
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(goalData),
      });

      const result = await response.json();

      if (response.ok) {
        setIsCreateDialogOpen(false);
        fetchGoals();
      } else {
        alert("Erro ao criar meta: " + result.error);
      }
    } catch (error) {
      console.error("Error creating goal:", error);
      alert("Erro ao criar meta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGoal = async (goalData: any) => {
    try {
      setIsSubmitting(true);
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(goalData),
      });

      const result = await response.json();

      if (response.ok) {
        setIsEditDialogOpen(false);
        setEditingGoal(null);
        fetchGoals();
      } else {
        alert("Erro ao atualizar meta: " + result.error);
      }
    } catch (error) {
      console.error("Error updating goal:", error);
      alert("Erro ao atualizar meta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const response = await fetch(`/api/goals?id=${goalId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        fetchGoals();
      } else {
        alert("Erro ao deletar meta: " + result.error);
      }
    } catch (error) {
      console.error("Error deleting goal:", error);
      alert("Erro ao deletar meta");
    }
  };

  const handleArchiveGoal = async (goalId: string) => {
    try {
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: goalId,
          status: "archived",
        }),
      });

      const result = await response.json();

      if (response.ok) {
        fetchGoals();
      } else {
        alert("Erro ao arquivar meta: " + result.error);
      }
    } catch (error) {
      console.error("Error archiving goal:", error);
      alert("Erro ao arquivar meta");
    }
  };

  const startEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setIsEditDialogOpen(true);
  };

  const getGoalTypeLabel = (goalType: string) => {
    return goalType === "total_sales" ? "Total Vendido" : "Pares Vendidos";
  };

  const isExpired = (endDate: string) => {
    return new Date(endDate) < new Date();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>

        {/* Goal cards skeleton */}
        <div className="grid gap-4">
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
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <h3 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
              <Target className="h-5 w-5" />
              Metas{" "}
              {targetType === "sellers" ? "de Vendedores" : "de Designers"}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="w-fit"
            >
              {showArchived ? "Ver Ativas" : "Ver Arquivadas"}
            </Button>
          </div>

          {isOwnerOrAdmin && !showArchived && (
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Meta
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-2xl max-h-[95vh] flex flex-col"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    // O formulário já tem seu próprio handler
                  }
                }}
              >
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>
                    Criar Nova Meta{" "}
                    {targetType === "sellers"
                      ? "de Vendedores"
                      : "de Designers"}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto pr-2">
                  <GoalForm
                    targetType={targetType}
                    onSubmit={handleCreateGoal}
                    onCancel={() => setIsCreateDialogOpen(false)}
                    isLoading={isSubmitting}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* Botões de controle quando o header está oculto */}
      {hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="w-fit"
          >
            {showArchived ? "Ver Ativas" : "Ver Arquivadas"}
          </Button>

          {isOwnerOrAdmin && !showArchived && (
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Meta
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-2xl max-h-[95vh] flex flex-col"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    // O formulário já tem seu próprio handler
                  }
                }}
              >
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>
                    Criar Nova Meta{" "}
                    {targetType === "sellers"
                      ? "de Vendedores"
                      : "de Designers"}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto pr-2">
                  <GoalForm
                    targetType={targetType}
                    onSubmit={handleCreateGoal}
                    onCancel={() => setIsCreateDialogOpen(false)}
                    isLoading={isSubmitting}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {goals.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              Nenhuma meta {showArchived ? "arquivada" : "ativa"} encontrada
            </h3>
            <p className="text-muted-foreground mb-4">
              {showArchived
                ? "Não há metas arquivadas para exibir."
                : isOwnerOrAdmin
                ? "Crie sua primeira meta para começar a acompanhar o desempenho."
                : "Aguarde a criação de metas pelos administradores."}
            </p>
            {!showArchived && isOwnerOrAdmin && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crie Uma Meta!
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {goals.map((goal) => (
            <GoalCardWithProgress
              key={goal.id}
              goal={goal}
              isOwnerOrAdmin={isOwnerOrAdmin}
              onEdit={startEdit}
              onArchive={handleArchiveGoal}
              onDelete={handleDeleteGoal}
              onGoalArchived={fetchGoals}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[95vh] flex flex-col"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              // O formulário já tem seu próprio handler
            }
          }}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Editar Meta</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            {editingGoal && (
              <GoalForm
                goal={editingGoal}
                targetType={targetType}
                onSubmit={handleEditGoal}
                onCancel={() => {
                  setIsEditDialogOpen(false);
                  setEditingGoal(null);
                }}
                isLoading={isSubmitting}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
