"use client";

import { useState, useEffect } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { NotificationManager } from "@/components/NotificationManager";
import { usePermissions } from "@/hooks/usePermissions";

export function SiteHeader() {
  const { isOwnerOrAdmin, loading: permissionsLoading } = usePermissions();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 transition-[width,height] ease-linear duration-200 border-b border-sidebar-border">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 md:hidden" />

        <div className="flex items-center gap-2 ml-auto">
          {/* Notification Manager - apenas para admins/owners */}
          {isHydrated && !permissionsLoading && isOwnerOrAdmin && (
            <NotificationManager />
          )}

          {/* Notification Center - para todos os usuários */}
          {isHydrated && <NotificationCenter />}
        </div>
      </div>
    </header>
  );
}
