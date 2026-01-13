"use client";

import React, { useState, useEffect } from "react";
import {
  DollarSign,
  HandCoins,
  LayoutDashboard,
  LockKeyhole,
  Palette,
  Percent,
  Rocket,
  Settings,
  ShoppingBag,
  Shuffle,
  LogOut,
  Package,
  ShoppingCart,
  Home,
  Target,
  TrendingUp,
  Clock,
  Users,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMeta } from "@fortawesome/free-brands-svg-icons";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePermissions } from "@/hooks/usePermissions";

import { SidebarUserInfo } from "@/components/SidebarUserInfo";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { PWAInstallButton } from "@/components/PWAInstallButton";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

// FontAwesome Meta icon wrapper component
const MetaIcon = ({ className }: { className?: string }) => (
  <FontAwesomeIcon icon={faMeta} className={className} />
);

// Type for menu items
type MenuItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

// Menu items organized by groups
const menuGroups: MenuGroup[] = [
  {
    label: "Dados de Negócios",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Negócios",
        url: "/deals",
        icon: DollarSign,
      },
      {
        title: "Pares Vendidos",
        url: "/pairs-sold",
        icon: ShoppingBag,
      },
      {
        title: "Programação",
        url: "/programacao",
        icon: Clock,
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        title: "Meta Marketing",
        url: "/meta-marketing",
        icon: MetaIcon,
      },
    ],
  },
  {
    label: "Follow-Up",
    items: [
      {
        title: "Vendedores",
        url: "/sellers",
        icon: Rocket,
      },
      {
        title: "Designers",
        url: "/designers",
        icon: Palette,
      },
      {
        title: "Representantes",
        url: "/representantes",
        icon: Users,
      },
    ],
  },
  {
    label: "Custos",
    items: [
      {
        title: "Custos Fixos",
        url: "/fixed-costs",
        icon: LockKeyhole,
      },
      {
        title: "Custos Variáveis",
        url: "/variable-costs",
        icon: Shuffle,
      },
      {
        title: "Custos Diretos",
        url: "/direct-costs",
        icon: HandCoins,
      },
      {
        title: "Impostos",
        url: "/taxes",
        icon: Percent,
      },
    ],
  },
  {
    label: "Parceiros",
    items: [
      {
        title: "Início",
        url: "/partners/home",
        icon: Home,
      },
      {
        title: "Dashboard",
        url: "/partners/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Produtos",
        url: "/partners/products",
        icon: Package,
      },
      {
        title: "Vendas",
        url: "/partners/orders",
        icon: ShoppingCart,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const {
    isPartnersMedia,
    isUser,
    isOwner,
    isAdmin,
    loading: permissionsLoading,
  } = usePermissions();

  // Show skeleton while permissions are loading to prevent hydration flash
  // This prevents the issue where all menu items are shown initially
  // before role-based filtering is applied, causing a visual flash
  if (permissionsLoading) {
    return <SidebarSkeleton />;
  }

  const handleLogout = async () => {
    await signOut();
  };

  // Filter menu groups based on user role
  const getFilteredMenuGroups = (): MenuGroup[] => {
    if (isPartnersMedia) {
      // Partners-media users can only see the "Parceiros" group
      return menuGroups.filter((group) => group.label === "Parceiros");
    }

    let filteredGroups: MenuGroup[] = menuGroups;

    // Users with role "user" cannot see the "Parceiros" group
    if (isUser) {
      filteredGroups = filteredGroups.filter(
        (group) => group.label !== "Parceiros"
      );
    }

    // Only owners and admins can see the "Custos" group
    if (!isOwner && !isAdmin) {
      filteredGroups = filteredGroups.filter(
        (group) => group.label !== "Custos"
      );
    }

    // Filter "Representantes" from "Follow-Up" group for non-admin/owner users
    if (!isOwner && !isAdmin) {
      filteredGroups = filteredGroups.map((group) => {
        if (group.label === "Follow-Up") {
          return {
            ...group,
            items: group.items.filter((item) => item.url !== "/representantes"),
          };
        }
        return group;
      });
    }

    return filteredGroups;
  };

  const filteredMenuGroups = getFilteredMenuGroups();

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-start justify-start p-4 gap-3">
        <Logo className="h-14 w-max mb-6" />
        <ThemeToggle />
        {/* Banco de Imagens - visível apenas para admin, owner e user */}
        {(isOwner || isAdmin || isUser) && (
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
        )}
      </SidebarHeader>
      <SidebarContent>
        {filteredMenuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={
                          isActive
                            ? "active:bg-transparent hover:bg-transparent"
                            : "active:bg-transparent"
                        } // Added active:bg-transparent for all links
                      >
                        <a
                          href={item.url}
                          onClick={(e) => {
                            if (isActive) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                        >
                          <item.icon
                            className={isActive ? "text-primary" : ""}
                          />
                          <span className={isActive ? "text-primary" : ""}>
                            {item.title}
                          </span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* User info as a menu item */}
          <SidebarMenuItem>
            <SidebarUserInfo />
          </SidebarMenuItem>

          {/* Settings button */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/profile-settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* PWA Install button */}
          <SidebarMenuItem>
            <PWAInstallButton />
          </SidebarMenuItem>

          {/* Logout button */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
