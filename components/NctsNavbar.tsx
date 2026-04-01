"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Map,
  Target,
  CheckSquare,
  ListTodo,
  Medal,
  Star,
  User,
} from "lucide-react";

const NCT_LINKS = [
  { href: "/user-progress", label: "Meu Progresso", icon: User, exact: true },
  { href: "/ncts", label: "Dashboard", icon: Map, exact: true },
  { href: "/ncts/narrativas", label: "Narrativas", icon: Target, exact: false },
  {
    href: "/ncts/compromissos",
    label: "Compromissos",
    icon: CheckSquare,
    exact: false,
  },
  { href: "/ncts/tarefas", label: "Tarefas", icon: ListTodo, exact: false },
  { href: "/ncts/ranking", label: "Ranking", icon: Medal, exact: false },
  { href: "/ncts/conquistas", label: "Conquistas", icon: Star, exact: false },
];

export function NctsNavbar() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border bg-background px-3">
      {/* Botão de toggle da sidebar */}
      <SidebarTrigger className="shrink-0" />

      <Separator orientation="vertical" className="mx-2 h-5" />

      {/* Links de navegação */}
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
        {NCT_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")}
              />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
