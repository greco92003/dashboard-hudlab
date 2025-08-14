"use client";

import { useEffect, useCallback } from "react";
import { usePermissions } from "./usePermissions";

interface ExpiredGoal {
  id: string;
  title: string;
  end_date: string;
  target_type: "sellers" | "designers";
}

interface UseGoalsAutoArchiveOptions {
  onGoalsArchived?: (archivedGoals: ExpiredGoal[]) => void;
  checkInterval?: number; // in milliseconds, default 5 minutes
  autoArchive?: boolean; // if true, automatically archives expired goals
}

export function useGoalsAutoArchive(options: UseGoalsAutoArchiveOptions = {}) {
  const {
    onGoalsArchived,
    checkInterval = 5 * 60 * 1000, // 5 minutes
    autoArchive = false,
  } = options;

  const { isOwnerOrAdmin } = usePermissions();

  const checkExpiredGoals = useCallback(async () => {
    try {
      // Check for expired goals
      const response = await fetch("/api/goals/archive-expired");
      const result = await response.json();

      if (response.ok && result.expiredGoals?.length > 0) {
        console.log(
          `Found ${result.count} expired goals:`,
          result.expiredGoals
        );

        // If auto-archive is enabled and user has permissions, archive them
        if (autoArchive && isOwnerOrAdmin) {
          const archiveResponse = await fetch("/api/goals/archive-expired", {
            method: "POST",
          });
          const archiveResult = await archiveResponse.json();

          if (archiveResponse.ok) {
            console.log(
              `Auto-archived ${archiveResult.archivedCount} expired goals`
            );

            // Notify callback if provided
            if (onGoalsArchived && archiveResult.archivedGoals) {
              onGoalsArchived(archiveResult.archivedGoals);
            }
          } else {
            console.error(
              "Failed to auto-archive expired goals:",
              archiveResult.error
            );
          }
        } else {
          // Just notify about expired goals without archiving
          if (onGoalsArchived) {
            onGoalsArchived(result.expiredGoals);
          }
        }
      }
    } catch (error) {
      console.error("Error checking expired goals:", error);
    }
  }, [autoArchive, isOwnerOrAdmin]); // Removed onGoalsArchived from dependencies

  const manualArchiveExpired = useCallback(async () => {
    if (!isOwnerOrAdmin) {
      throw new Error("Insufficient permissions to archive goals");
    }

    try {
      const response = await fetch("/api/goals/archive-expired", {
        method: "POST",
      });
      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          archivedCount: result.archivedCount,
          archivedGoals: result.archivedGoals,
          message: result.message,
        };
      } else {
        throw new Error(result.error || "Failed to archive expired goals");
      }
    } catch (error) {
      console.error("Error manually archiving expired goals:", error);
      throw error;
    }
  }, [isOwnerOrAdmin]);

  const checkExpiredGoalsOnly = useCallback(async () => {
    try {
      const response = await fetch("/api/goals/archive-expired");
      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          expiredGoals: result.expiredGoals,
          count: result.count,
        };
      } else {
        throw new Error(result.error || "Failed to check expired goals");
      }
    } catch (error) {
      console.error("Error checking expired goals:", error);
      throw error;
    }
  }, []);

  useEffect(() => {
    // Only run if autoArchive is enabled
    if (!autoArchive) {
      return;
    }

    // Initial check
    checkExpiredGoals();

    // Set up interval for periodic checks
    const interval = setInterval(checkExpiredGoals, checkInterval);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [checkExpiredGoals, checkInterval, autoArchive]); // Removed onGoalsArchived from dependencies

  return {
    checkExpiredGoals,
    manualArchiveExpired,
    checkExpiredGoalsOnly,
    canArchive: isOwnerOrAdmin,
  };
}
