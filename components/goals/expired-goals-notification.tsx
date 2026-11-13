"use client";

import { useState, useEffect, useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGoalsAutoArchive } from "@/hooks/useGoalsAutoArchive";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertTriangle, Archive, X } from "lucide-react";

interface ExpiredGoal {
  id: string;
  title: string;
  end_date: string;
  target_type: "sellers" | "designers";
}

export function ExpiredGoalsNotification() {
  const [expiredGoals, setExpiredGoals] = useState<ExpiredGoal[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const { isOwnerOrAdmin } = usePermissions();
  const { checkExpiredGoalsOnly, manualArchiveExpired } = useGoalsAutoArchive();

  const checkForExpiredGoals = useCallback(async () => {
    try {
      const result = await checkExpiredGoalsOnly();
      if (result.success && result.expiredGoals.length > 0) {
        setExpiredGoals(result.expiredGoals);
        setIsVisible(true);
      }
    } catch (error) {
      console.error("Error checking for expired goals:", error);
    }
  }, [checkExpiredGoalsOnly]);

  useEffect(() => {
    // Only check once when component mounts
    const checkOnMount = async () => {
      try {
        const result = await checkExpiredGoalsOnly();
        if (result.success && result.expiredGoals.length > 0) {
          setExpiredGoals(result.expiredGoals);
          setIsVisible(true);
        }
      } catch (error) {
        console.error("Error checking for expired goals:", error);
      }
    };

    checkOnMount();
  }, [checkExpiredGoalsOnly]);

  const handleArchiveExpired = async () => {
    if (!isOwnerOrAdmin) return;

    try {
      setIsArchiving(true);
      const result = await manualArchiveExpired();

      if (result.success) {
        setIsVisible(false);
        setExpiredGoals([]);

        // Show success message (you could use a toast here)
        console.log(
          `Successfully archived ${result.archivedCount} expired goals`
        );
      }
    } catch (error) {
      console.error("Error archiving expired goals:", error);
      alert(
        "Erro ao arquivar metas expiradas: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible || expiredGoals.length === 0) {
    return null;
  }

  return (
    <Alert className=" tone-pink hud-tone-card mb-4">
      <AlertTriangle className="h-4 w-4 tone-pink hud-tone-text" />
      <div className="flex items-start justify-between w-full">
        <div className="flex-1">
          <AlertTitle className="tone-pink hud-tone-text">
            Metas Expiradas Encontradas
          </AlertTitle>
          <AlertDescription className="tone-pink hud-tone-text mt-2">
            {expiredGoals.length === 1 ? (
              <>
                A meta <strong>&ldquo;{expiredGoals[0].title}&rdquo;</strong>{" "}
                expirou em{" "}
                {new Date(expiredGoals[0].end_date).toLocaleDateString("pt-BR")}
                .
              </>
            ) : (
              <>
                {expiredGoals.length} metas expiraram e precisam ser arquivadas:
                <div className="mt-2 space-y-1">
                  {expiredGoals.slice(0, 3).map((goal) => (
                    <div key={goal.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {goal.target_type === "sellers"
                          ? "Vendedores"
                          : "Designers"}
                      </Badge>
                      <span className="text-sm">
                        {goal.title} - Expirou em{" "}
                        {new Date(goal.end_date).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  ))}
                  {expiredGoals.length > 3 && (
                    <div className="text-sm tone-pink hud-tone-text">
                      ... e mais {expiredGoals.length - 3} metas
                    </div>
                  )}
                </div>
              </>
            )}
          </AlertDescription>

          {isOwnerOrAdmin && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleArchiveExpired}
                disabled={isArchiving}
                className="hud-btn-accent"
              >
                <Archive className="h-4 w-4 mr-1" />
                {isArchiving ? "Arquivando..." : "Arquivar Todas"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                className="border-[color:var(--tone-pink)] tone-pink hud-tone-text"
              >
                Dispensar
              </Button>
            </div>
          )}

          {!isOwnerOrAdmin && (
            <div className="mt-3">
              <p className="text-sm tone-pink hud-tone-text">
                Entre em contato com um administrador para arquivar essas metas.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                className="mt-2 border-[color:var(--tone-pink)] tone-pink hud-tone-text"
              >
                Dispensar
              </Button>
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          className="tone-pink hud-tone-text ml-2"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}
