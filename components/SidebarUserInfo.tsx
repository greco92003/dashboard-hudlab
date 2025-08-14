"use client";

import React, { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarAvatar } from "@/components/SidebarAvatar";
import { useAuth } from "@/contexts/OptimizedAuthContext";

interface SidebarUserInfoProps {
  className?: string;
}

/**
 * Stable user info component for sidebar
 *
 * Features:
 * - Immediate display of cached data
 * - Graceful loading states
 * - Prevents skeleton flashing
 * - Optimized re-rendering
 */
export function SidebarUserInfo({ className = "" }: SidebarUserInfoProps) {
  const { user, profile, loading } = useAuth();

  // Memoize user display data to prevent unnecessary re-renders
  const userDisplayData = useMemo(() => {
    const fallback =
      profile?.first_name?.[0]?.toUpperCase() ||
      user?.email?.[0]?.toUpperCase() ||
      "U";

    const displayName =
      profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name || user?.email?.split("@")[0] || "Usuário";

    const email = user?.email || "";

    return {
      fallback,
      displayName,
      email,
      avatarUrl: profile?.avatar_url,
      updatedAt: profile?.updated_at || profile?.created_at,
      userId: user?.id,
    };
  }, [user, profile]);

  // Show minimal loading only on initial load when no user data exists
  const shouldShowSkeleton = loading && !user && !profile;

  return (
    <div className={`flex items-center gap-2 px-2 h-8 rounded-md ${className}`}>
      <SidebarAvatar
        src={userDisplayData.avatarUrl}
        fallback={userDisplayData.fallback}
        alt="Avatar do usuário"
        size="md"
        updatedAt={userDisplayData.updatedAt}
        userId={userDisplayData.userId}
        showLoadingState={false}
      />
      <div className="flex flex-col min-w-0 flex-1">
        {shouldShowSkeleton ? (
          <>
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-3 w-24" />
          </>
        ) : (
          <>
            <span className="text-sm font-medium truncate select-none">
              {userDisplayData.displayName}
            </span>
            <span className="text-xs text-muted-foreground truncate select-none">
              {userDisplayData.email}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
