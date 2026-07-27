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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, Clapperboard, Images, CircleDot } from "lucide-react";
import { fmtNum, fmtPctFraction, periodoParaDatas, type Periodo } from "../lib";

// Esta aba precisa de início/fim concretos pra comparar com o período
// anterior -- "todos" (sem limite) não se aplica aqui.
const PERIODOS_COMPARAVEIS: { value: Periodo; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

interface TipoResumo {
  qtd: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  total_interactions: number;
  engagement_rate: number | null;
}

interface Resumo {
  atual: Record<string, TipoResumo>;
  anterior: Record<string, TipoResumo>;
}

const TIPOS: { key: string; label: string; icon: typeof Clapperboard }[] = [
  { key: "REELS", label: "Reels", icon: Clapperboard },
  { key: "FEED", label: "Posts & Carrosséis", icon: Images },
  { key: "STORY", label: "Stories", icon: CircleDot },
];

function calcVariacao(atual: number, anterior: number | undefined): number | undefined {
  if (!anterior) return undefined;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

function VarBadge({ pct }: { pct: number | undefined }) {
  if (pct == null) return null;
  const subiu = pct > 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        subiu ? "text-emerald-600" : "text-red-600"
      }`}
    >
      <Icone className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function MetricRow({
  label,
  atual,
  anterior,
}: {
  label: string;
  atual: number;
  anterior: number | undefined;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{fmtNum(atual)}</span>
        <VarBadge pct={calcVariacao(atual, anterior)} />
      </span>
    </div>
  );
}

export function VisaoGeral() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const { inicio, fim } = periodoParaDatas(periodo);
      const { data, error } = await supabase.rpc("get_instagram_resumo_periodo", {
        p_inicio: inicio,
        p_fim: fim,
      });
      if (cancel) return;
      if (error) {
        setErro(error.message);
        setLoading(false);
        return;
      }
      setResumo(data as Resumo);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [periodo]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_COMPARAVEIS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {erro && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Erro ao carregar: {erro}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : resumo ? (
        <div className="grid gap-4 md:grid-cols-3">
          {TIPOS.map(({ key, label, icon: Icon }) => {
            const atual = resumo.atual[key];
            const anterior = resumo.anterior[key];
            if (!atual || atual.qtd === 0) {
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4" />
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Nenhum item publicado no período.
                  </CardContent>
                </Card>
              );
            }
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4" />
                    {label}
                  </CardTitle>
                  <CardDescription>
                    {atual.qtd} {atual.qtd === 1 ? "item publicado" : "itens publicados"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <MetricRow label="Views" atual={atual.views} anterior={anterior?.views} />
                  <MetricRow label="Alcance" atual={atual.reach} anterior={anterior?.reach} />
                  <MetricRow label="Curtidas" atual={atual.likes} anterior={anterior?.likes} />
                  <MetricRow label="Comentários" atual={atual.comments} anterior={anterior?.comments} />
                  <MetricRow label="Salvos" atual={atual.saved} anterior={anterior?.saved} />
                  <MetricRow
                    label="Compartilhamentos"
                    atual={atual.shares}
                    anterior={anterior?.shares}
                  />
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-muted-foreground">Taxa de engajamento</span>
                    <span className="font-medium">{fmtPctFraction(atual.engagement_rate)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
