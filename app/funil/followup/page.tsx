"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  RefreshCw,
  Phone,
  Mail,
  PhoneCall,
  ArchiveRestore,
  Clock,
  Archive,
  Users,
  ListChecks,
} from "lucide-react";

interface FollowUpLead {
  subscriber_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  quantidade_pares: number | null;
  stage_slug: string;
  stage_name: string;
  stage_order: number;
  occurred_at: string;
}

interface FollowUpData {
  listaA: FollowUpLead[];
  listaB: FollowUpLead[];
  listaC: FollowUpLead[];
  archived: FollowUpLead[];
}

function LeadCard({
  lead,
  onArchive,
  onUnarchive,
  isArchived,
}: {
  lead: FollowUpLead;
  onArchive?: () => void;
  onUnarchive?: () => void;
  isArchived?: boolean;
}) {
  const name = lead.nome ?? `ID: ${lead.subscriber_id}`;
  const hasPhone = !!lead.telefone;
  const hasEmail = !!lead.email;
  const daysInList = Math.floor(
    (Date.now() - new Date(lead.occurred_at).getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysLabel =
    daysInList === 0
      ? "hoje"
      : daysInList === 1
        ? "1 dia"
        : `${daysInList} dias`;
  const daysBadgeClass =
    daysInList >= 8
      ? "text-xs shrink-0 border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30"
      : daysInList >= 4
        ? "text-xs shrink-0 border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30"
        : "text-xs shrink-0";

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{name}</span>
          {lead.quantidade_pares !== null && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {lead.quantidade_pares} pares
            </Badge>
          )}
          <Badge variant="outline" className="text-xs shrink-0">
            {lead.stage_name}
          </Badge>
          <Badge
            variant="outline"
            className={daysBadgeClass}
            title="Dias na lista desde o primeiro contato"
          >
            <Clock className="h-3 w-3 mr-1" />
            {daysLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {lead.telefone && (
            <a
              href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
            >
              <Phone className="h-3 w-3" />
              {lead.telefone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <Mail className="h-3 w-3" />
              {lead.email}
            </a>
          )}
          {!hasPhone && !hasEmail && (
            <span className="text-xs text-muted-foreground">Sem contato</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isArchived && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={onArchive}
            title="Marcar como contactado e arquivar"
          >
            <PhoneCall className="h-3 w-3" />
            Contactado
          </Button>
        )}
        {isArchived && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={onUnarchive}
            title="Desarquivar lead"
          >
            <ArchiveRestore className="h-3 w-3" />
            Desarquivar
          </Button>
        )}
      </div>
    </div>
  );
}

export default function FollowUpPage() {
  const [data, setData] = useState<FollowUpData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manychat/followup");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const json: FollowUpData = await res.json();
      setData(json);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleArchive = async (lead: FollowUpLead, listaOrigem: string) => {
    await fetch("/api/manychat/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriber_id: lead.subscriber_id,
        lista_origem: listaOrigem,
      }),
    });
    loadData();
  };

  const handleUnarchive = async (lead: FollowUpLead) => {
    await fetch("/api/manychat/archive", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_id: lead.subscriber_id }),
    });
    loadData();
  };

  const listConfig = [
    {
      key: "listaA",
      label: "Lista A",
      description:
        "Alta prioridade — Leads com 36 pares ou mais que ainda não solicitaram mockup oficial",
      color: "#1A00FF",
      leads: data?.listaA ?? [],
    },
    {
      key: "listaB",
      label: "Lista B",
      description:
        "Média prioridade — Leads com menos de 36 pares que ainda não solicitaram mockup oficial",
      color: "#FF9900",
      leads: data?.listaB ?? [],
    },
    {
      key: "listaC",
      label: "Lista C",
      description:
        "Reengajamento — Leads que só viram modelos e preços e não avançaram",
      color: "#FF1A00",
      leads: data?.listaC ?? [],
    },
    {
      key: "arquivados",
      label: "Arquivados",
      description:
        "Leads já contactados. Clique em Desarquivar para devolvê-los à lista original.",
      color: "#6b7280",
      leads: data?.archived ?? [],
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
            <Link href="/funil">
              <ArrowLeft className="h-4 w-4" />
              Funil
            </Link>
          </Button>
          <div className="w-px h-6 bg-border" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ListChecks className="h-6 w-6 text-primary" />
              Lista de Follow-Up
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Gerencie os leads que precisam de acompanhamento
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={loadData}
          disabled={loading}
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="listaA">
        <TabsList>
          {listConfig.map((list) => (
            <TabsTrigger key={list.key} value={list.key} className="gap-1.5">
              {list.label}
              {!loading && (
                <Badge
                  className="text-xs font-bold h-4 px-1 min-w-4"
                  style={{ backgroundColor: list.color, color: "#fff" }}
                >
                  {list.leads.length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {listConfig.map((list) => (
          <TabsContent key={list.key} value={list.key} className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              {list.description}
            </p>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : list.leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {list.key === "arquivados" ? (
                  <Archive className="h-10 w-10 mx-auto mb-2 opacity-30" />
                ) : (
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                )}
                <p className="text-sm">
                  {list.key === "arquivados"
                    ? "Nenhum lead arquivado"
                    : "Nenhum lead nesta lista"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {list.leads.map((lead) => (
                  <LeadCard
                    key={lead.subscriber_id}
                    lead={lead}
                    isArchived={list.key === "arquivados"}
                    onArchive={
                      list.key !== "arquivados"
                        ? () =>
                            handleArchive(
                              lead,
                              list.key.replace("lista", "").toUpperCase(),
                            )
                        : undefined
                    }
                    onUnarchive={
                      list.key === "arquivados"
                        ? () => handleUnarchive(lead)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
