"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/**
 * Skeleton loading component for the sidebar
 *
 * This component prevents hydration issues by showing a consistent
 * loading state while user roles are being fetched, avoiding the
 * flash of incorrect content that occurs when all menu items are
 * shown before role-based filtering is applied.
 */
export function SidebarSkeleton() {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-start justify-start p-4 gap-3">
        <Logo className="h-14 w-max mb-6" />
        <ThemeToggle />
        <Button
          onClick={() =>
            window.open(
              "https://drive.google.com/drive/folders/11aZgYke5pbAagggBhA0ayWTK0z38V-CK?usp=sharing",
              "_blank"
            )
          }
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 cursor-pointer w-full"
        >
          <ExternalLink className="h-3 w-3" />
          <span className="text-xs">Banco de Imagens</span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        {/* Skeleton for menu groups */}
        {[1, 2, 3].map((groupIndex) => (
          <SidebarGroup key={groupIndex}>
            <SidebarGroupLabel>
              <Skeleton className="h-4 w-24" />
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[1, 2, 3].map((itemIndex) => (
                  <SidebarMenuItem key={itemIndex}>
                    <SidebarMenuButton disabled>
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-20" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* Skeleton for user info */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>

            {/* Skeleton for settings and logout buttons */}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-20" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-12" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
