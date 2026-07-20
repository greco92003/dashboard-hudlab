"use client";

import React, { useMemo } from "react";
import {
  ChevronsUpDown,
  Download,
  LogOut,
  Settings,
  Smartphone,
} from "lucide-react";

import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { SidebarAvatar } from "@/components/SidebarAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * User button for the sidebar footer (shadcn sidebar-07 style).
 *
 * Shows avatar + name + email as a single clickable button that opens
 * a floating menu with: Configurações, Instalar App (when available) and Sair.
 */
export function NavUser() {
  const { isMobile } = useSidebar();
  const { user, profile, loading, signOut } = useAuth();
  const { canInstall, isIOS, promptInstall } = usePWAInstall();

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

    return {
      fallback,
      displayName,
      email: user?.email || "",
      avatarUrl: profile?.avatar_url,
      updatedAt: profile?.updated_at || profile?.created_at,
      userId: user?.id,
    };
  }, [user, profile]);

  // Show minimal loading only on initial load when no user data exists
  const shouldShowSkeleton = loading && !user && !profile;

  const userInfo = shouldShowSkeleton ? (
    <div className="grid flex-1 gap-1">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  ) : (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">
        {userDisplayData.displayName}
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {userDisplayData.email}
      </span>
    </div>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <SidebarAvatar
                src={userDisplayData.avatarUrl}
                fallback={userDisplayData.fallback}
                alt="Avatar do usuário"
                size="md"
                updatedAt={userDisplayData.updatedAt}
                userId={userDisplayData.userId}
                showLoadingState={false}
              />
              {userInfo}
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <SidebarAvatar
                  src={userDisplayData.avatarUrl}
                  fallback={userDisplayData.fallback}
                  alt="Avatar do usuário"
                  size="md"
                  updatedAt={userDisplayData.updatedAt}
                  userId={userDisplayData.userId}
                  showLoadingState={false}
                />
                {userInfo}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/profile-settings">
                  <Settings />
                  Configurações
                </a>
              </DropdownMenuItem>
              {canInstall && (
                <DropdownMenuItem onClick={promptInstall}>
                  {isIOS ? <Smartphone /> : <Download />}
                  Instalar App
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
