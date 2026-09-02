"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useHydrationFix } from "@/hooks/useHydrationFix";

interface ConditionalSidebarProps {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}

const fullHeightBoardRoutes = ["/programacao", "/expedicao"];

// Keep the same responsive content inset and rhythm used by /dashboard.
const standardContentClassName =
  "flex flex-col gap-4 p-4 pt-6 md:gap-6 md:p-6 md:pt-8";
const fullHeightContentClassName = `${standardContentClassName} min-h-0 flex-1 overflow-hidden`;
const unpaddedFullHeightContentClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden";

export function ConditionalSidebar({
  children,
  defaultSidebarOpen = true,
}: ConditionalSidebarProps) {
  const pathname = usePathname();
  const { isHydrated, hasHydrationError, isRecovering } = useHydrationFix();

  // State to control sidebar open/close - only for non-collapsible pages
  const [forcedOpen, setForcedOpen] = useState(true);
  const [isClientReady, setIsClientReady] = useState(false);

  // Full-height Kanban pages can collapse the sidebar to maximize board space.
  const isBoardPage = fullHeightBoardRoutes.includes(pathname);
  const isNctsPage = pathname.startsWith("/ncts");
  const isCollapsiblePage = isBoardPage || isNctsPage;

  // Board pages keep full height while using the same inset as /dashboard.
  // NCT pages continue to handle their own padding via layout.tsx.
  const isFullHeightPage = isBoardPage || isNctsPage;
  const contentClassName = isNctsPage
    ? unpaddedFullHeightContentClassName
    : isBoardPage
      ? fullHeightContentClassName
      : standardContentClassName;

  // Mark client as ready after hydration
  useEffect(() => {
    setIsClientReady(true);
  }, []);

  // Force sidebar to open when navigating away from collapsible pages
  useEffect(() => {
    if (isClientReady && !isCollapsiblePage) {
      setForcedOpen(true);
    }
  }, [isCollapsiblePage, isClientReady]);

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
    "/resultados/2026/marco",
    "/producao",
  ];

  // Routes that should have the sidebar (valid app routes)
  const validRoutesWithSidebar = [
    "/",
    "/dashboard",
    "/deals",
    "/programacao",
    "/expedicao",
    "/producao",
    "/estoque",
    "/sellers",
    "/sellers_v2",
    "/designers",
    "/representantes",
    "/direct-costs",
    "/taxes",
    "/fixed-costs",
    "/variable-costs",
    "/financial-dashboard",
    "/profile-settings",
    "/goals",
    "/states",
    "/meta-marketing",
    "/instagram-organico",
    "/partners",
    "/partners/home",
    "/partners/dashboard",
    "/partners/products",
    "/partners/orders",
    "/partners/coupons",
    "/user-progress",
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
          // Force sidebar open for all pages except collapsible pages (only after client is ready)
          open={isClientReady && !isCollapsiblePage ? forcedOpen : undefined}
          onOpenChange={
            isClientReady && !isCollapsiblePage ? setForcedOpen : undefined
          }
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
            <div className={contentClassName}>{children}</div>
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
      // Force sidebar open for all pages except collapsible pages (only after client is ready)
      open={isClientReady && !isCollapsiblePage ? forcedOpen : undefined}
      onOpenChange={
        isClientReady && !isCollapsiblePage ? setForcedOpen : undefined
      }
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
        <div className={contentClassName}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
