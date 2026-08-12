"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";
import { fmtDataCurta } from "../lib";

interface InsightRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  veredito: string;
  justificativa: string;
  periodo_inicio: string;
  periodo_fim: string;
  gerado_em: string;
}

const VEREDITO_ORDEM: Record<string, number> = {
  PAUSAR: 0,
  REVISAR: 1,
  ESCALAR: 2,
  MANTER: 3,
  PAUSADO: 4,
};

function VereditoBadge({ veredito }: { veredito: string }) {
  if (veredito === "ESCALAR") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
        ESCALAR
      </Badge>
    );
  }
  if (veredito === "PAUSAR") {
    return (
      <Badge className="bg-red-600 hover:bg-red-600 text-white">PAUSAR</Badge>
    );
  }
  if (veredito === "REVISAR") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
        REVISAR
      </Badge>
    );
  }
  if (veredito === "PAUSADO") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        PAUSADO
      </Badge>
    );
  }
  return <Badge variant="secondary">MANTER</Badge>;
}

export function Insights() {
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const { data, error } = await supabase
        .from("meta_ghl_ad_insights")
        .select("*")
        .order("gerado_em", { ascending: false });
      if (cancel) return;
      if (error) {
        setErro(error.message);
        setLoading(false);
        return;
      }
      const ordenadas = ((data as InsightRow[]) ?? []).sort(
        (a, b) => (VEREDITO_ORDEM[a.veredito] ?? 9) - (VEREDITO_ORDEM[b.veredito] ?? 9)
      );
      setRows(ordenadas);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          Erro ao carregar: {erro}
        </CardContent>
      </Card>
    );
  }

  const ultimaGeracao = rows[0]?.gerado_em;
  const periodo = rows[0];

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Recomendação diária automática gerada por IA (Claude), analisando os
          últimos 30 dias de cada anúncio com investimento relevante —
          priorizando custo por etapa do funil (lead, orçamento, par orçado,
          negociação) sobre ROAS/vendas, que ainda amadurece no ciclo de venda
          de ~35 dias. Anúncios já pausados no Meta aparecem como PAUSADO
          (sem ação necessária); anúncios de tráfego pro perfil (BIO) são
          avaliados por alcance, não por lead direto. É sugestão pra revisão
          humana, não ação automática.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recomendações por anúncio</CardTitle>
          <CardDescription>
            {periodo
              ? `Período analisado: ${fmtDataCurta(periodo.periodo_inicio)} a ${fmtDataCurta(
                  periodo.periodo_fim
                )}${ultimaGeracao ? ` · gerado em ${new Date(ultimaGeracao).toLocaleString("pt-BR")}` : ""}`
              : "Ainda sem recomendações geradas."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma recomendação gerada ainda. O ciclo roda automaticamente
              todo dia às 06:25 (horário de Brasília).
            </p>
          ) : (
            <div className="space-y-4">
              {rows.map((r) => (
                <div key={r.ad_id} className="flex gap-3 border-b pb-4 last:border-b-0 last:pb-0">
                  <div className="pt-0.5">
                    <VereditoBadge veredito={r.veredito} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{r.ad_name ?? r.ad_id}</span>
                      {r.campaign_name && (
                        <span className="text-xs text-muted-foreground">{r.campaign_name}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{r.justificativa}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
