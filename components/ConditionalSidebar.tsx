"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useHydrationFix } from "@/hooks/useHydrationFix";
import { AIAnalystWrapper } from "@/components/ai-analyst/AIAnalystWrapper";

interface ConditionalSidebarProps {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}

export function ConditionalSidebar({
  children,
  defaultSidebarOpen = true,
}: ConditionalSidebarProps) {
  const pathname = usePathname();
  const { isHydrated, hasHydrationError, isRecovering } = useHydrationFix();

  // Check if current page needs full height layout (no padding)
  const isFullHeightPage = pathname === "/programacao";

  // Routes that should not have the sidebar
  const routesWithoutSidebar = [
    "/home",
    "/login",
    "/signup",
    "/pending-approval",
    "/forgot-password",
    "/reset-password",
    "/not-found",
    "/auth/auth-code-error",
    "/privacy-policy",
    "/terms-of-service",
  ];

  // Routes that should have the sidebar (valid app routes)
  const validRoutesWithSidebar = [
    "/",
    "/dashboard",
    "/deals",
    "/pairs-sold",
    "/programacao",
    "/sellers",
    "/designers",
    "/direct-costs",
    "/taxes",
    "/fixed-costs",
    "/variable-costs",
    "/profile-settings",
    "/goals",
    "/states",
    "/meta-marketing",
    "/partners",
    "/partners/home",
    "/partners/dashboard",
    "/partners/products",
    "/partners/orders",
    "/partners/coupons",
  ];

  // Routes that should have the sidebar closed by default
  const routesWithClosedSidebar: string[] = [];

  // Check if current route should not have sidebar
  const isRouteWithoutSidebar = routesWithoutSidebar.includes(pathname);

  // Check if current route is a valid app route
  const isValidAppRoute = validRoutesWithSidebar.includes(pathname);

  // Check if it's an API route (should not have sidebar)
  const isApiRoute = pathname.startsWith("/api/");

  // Check if it's an auth route (should not have sidebar)
  const isAuthRoute = pathname.startsWith("/auth/");

  // More inclusive logic: if it's not explicitly excluded and not API/auth, assume it should have sidebar
  // This prevents issues with dynamic routes or new routes not being added to the list
  const shouldHaveSidebar =
    !isRouteWithoutSidebar && !isApiRoute && !isAuthRoute;

  // Only consider it 404 if it's not a valid route AND not a potential app route
  const isProbably404 = !shouldHaveSidebar && !isValidAppRoute;

  const shouldShowSidebar = shouldHaveSidebar;
  const shouldStartClosed = routesWithClosedSidebar.includes(pathname);

  // Show recovery message if there are hydration issues
  if (hasHydrationError && isRecovering) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">
            Corrigindo problemas de cache...
          </h2>
          <p className="text-muted-foreground">
            A página será recarregada automaticamente em alguns segundos.
          </p>
        </div>
      </div>
    );
  }

  // Durante SSR e hidratação inicial, sempre renderiza a estrutura básica
  // para evitar mismatch entre servidor e cliente
  if (!isHydrated) {
    // Se a rota não deve ter sidebar, renderiza apenas o children
    if (isRouteWithoutSidebar || isProbably404) {
      return <div suppressHydrationWarning>{children}</div>;
    }

    // Para rotas com sidebar, renderiza a estrutura completa com suppressHydrationWarning
    // para evitar erros de hidratação durante o carregamento inicial
    return (
      <div suppressHydrationWarning>
        <SidebarProvider
          defaultOpen={defaultSidebarOpen}
          style={
            {
              "--header-height": "4rem", // 64px = h-16
            } as React.CSSProperties
          }
        >
          <div suppressHydrationWarning>
            <AppSidebar />
          </div>
          <SidebarInset
            className={isFullHeightPage ? "flex flex-col min-w-0" : "min-w-0"}
            suppressHydrationWarning
          >
            <SiteHeader />
            <div
              className={
                isFullHeightPage
                  ? "flex flex-col flex-1 p-4 md:p-6 overflow-hidden"
                  : "p-4 pt-6 md:p-6 md:pt-8"
              }
            >
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    );
  }

  // Após hidratação, renderiza baseado na lógica real
  if (!shouldShowSidebar) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider
      defaultOpen={shouldStartClosed ? false : defaultSidebarOpen}
      style={
        {
          "--header-height": "4rem", // 64px = h-16
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset
        className={isFullHeightPage ? "flex flex-col min-w-0" : "min-w-0"}
        suppressHydrationWarning
      >
        <SiteHeader />
        <div
          className={
            isFullHeightPage
              ? "flex flex-col flex-1 p-4 md:p-6 overflow-hidden"
              : "p-4 pt-6 md:p-6 md:pt-8"
          }
        >
          {children}
        </div>
      </SidebarInset>
      {/* AI Analyst - Botão flutuante e sidebar de chat */}
      <AIAnalystWrapper />
    </SidebarProvider>
  );
}
