"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { fmtPctFraction } from "../lib";

const AMOSTRA_MINIMA = 5;

interface AtributoRow {
  id: string;
  media_product_type: string;
  timestamp: string;
  dia_semana: number;
  periodo_dia: "madrugada" | "manha" | "tarde" | "noite";
  mes: string;
  legenda_bucket: "sem_legenda" | "curta" | "media" | "longa";
  tem_hashtag: boolean;
  tem_mencao: boolean;
  tem_cta_amostra: boolean;
  views: number | null;
  engagement_rate: number | null;
}

interface Grupo {
  chave: string;
  label: string;
  n: number;
  engagementMedio: number | null;
}

function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v != null);
  if (validos.length === 0) return null;
  return validos.reduce((s, v) => s + v, 0) / validos.length;
}

function agrupar<T extends string | number>(
  rows: AtributoRow[],
  chaveFn: (r: AtributoRow) => T,
  labelFn: (chave: T) => string,
): Grupo[] {
  const mapa = new Map<T, AtributoRow[]>();
  for (const r of rows) {
    const chave = chaveFn(r);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(r);
  }
  return Array.from(mapa.entries()).map(([chave, grupo]) => ({
    chave: String(chave),
    label: labelFn(chave),
    n: grupo.length,
    engagementMedio: media(grupo.map((r) => r.engagement_rate)),
  }));
}

function VarBadge({ pct }: { pct: number | undefined }) {
  if (pct == null || !isFinite(pct)) return null;
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

function BarraGrupo({ grupo, baseline, max }: { grupo: Grupo; baseline: number | null; max: number }) {
  const valor = grupo.engagementMedio;
  const largura = valor != null && max > 0 ? Math.max((valor / max) * 100, 2) : 0;
  const delta =
    valor != null && baseline ? Math.round(((valor - baseline) / baseline) * 1000) / 10 : undefined;
  const amostraPequena = grupo.n < AMOSTRA_MINIMA;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{grupo.label}</span>
        <span className="flex items-center gap-2">
          <span className={amostraPequena ? "text-muted-foreground" : ""}>
            {valor != null ? fmtPctFraction(valor) : "—"}
          </span>
          {!amostraPequena && <VarBadge pct={delta} />}
          <span className="text-xs text-muted-foreground">
            {amostraPequena ? `amostra pequena (n=${grupo.n})` : `n=${grupo.n}`}
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${amostraPequena ? "bg-muted-foreground/40" : "bg-primary"}`}
          style={{ width: `${largura}%` }}
        />
      </div>
    </div>
  );
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ORDEM_PERIODO_DIA = ["madrugada", "manha", "tarde", "noite"] as const;
const LABEL_PERIODO_DIA: Record<string, string> = {
  madrugada: "Madrugada (0h-5h)",
  manha: "Manhã (6h-11h)",
  tarde: "Tarde (12h-17h)",
  noite: "Noite (18h-23h)",
};
const ORDEM_LEGENDA = ["sem_legenda", "curta", "media", "longa"] as const;
const LABEL_LEGENDA: Record<string, string> = {
  sem_legenda: "Sem legenda",
  curta: "Curta (até 100 caracteres)",
  media: "Média (101-300)",
  longa: "Longa (mais de 300)",
};

export function Insights() {
  const [rows, setRows] = useState<AtributoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const { data, error } = await supabase
        .from("v_ig_atributos")
        .select(
          "id, media_product_type, timestamp, dia_semana, periodo_dia, mes, legenda_bucket, tem_hashtag, tem_mencao, tem_cta_amostra, views, engagement_rate",
        );
      if (cancel) return;
      if (error) {
        setErro(error.message);
        setLoading(false);
        return;
      }
      setRows((data as AtributoRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const analise = useMemo(() => {
    if (rows.length === 0) return null;
    const baseline = media(rows.map((r) => r.engagement_rate));

    const porDiaSemana = agrupar(
      rows,
      (r) => r.dia_semana,
      (d) => DIAS_SEMANA[d],
    ).sort((a, b) => Number(a.chave) - Number(b.chave));

    const porPeriodoDia = ORDEM_PERIODO_DIA.map((p) => {
      const grupo = rows.filter((r) => r.periodo_dia === p);
      return {
        chave: p,
        label: LABEL_PERIODO_DIA[p],
        n: grupo.length,
        engagementMedio: media(grupo.map((r) => r.engagement_rate)),
      };
    });

    const porLegenda = ORDEM_LEGENDA.map((l) => {
      const grupo = rows.filter((r) => r.legenda_bucket === l);
      return {
        chave: l,
        label: LABEL_LEGENDA[l],
        n: grupo.length,
        engagementMedio: media(grupo.map((r) => r.engagement_rate)),
      };
    });

    const binario = (
      chave: "tem_cta_amostra" | "tem_mencao" | "tem_hashtag",
      labelCom: string,
      labelSem: string,
    ): Grupo[] => {
      const com = rows.filter((r) => r[chave]);
      const sem = rows.filter((r) => !r[chave]);
      return [
        { chave: "com", label: labelCom, n: com.length, engagementMedio: media(com.map((r) => r.engagement_rate)) },
        { chave: "sem", label: labelSem, n: sem.length, engagementMedio: media(sem.map((r) => r.engagement_rate)) },
      ];
    };

    const porMes = agrupar(
      rows,
      (r) => r.mes,
      (m) => String(m),
    ).sort((a, b) => a.chave.localeCompare(b.chave));

    return {
      baseline,
      porDiaSemana,
      porPeriodoDia,
      porLegenda,
      porCta: binario("tem_cta_amostra", 'Com CTA "Amostra Digital"', "Sem esse CTA"),
      porMencao: binario("tem_mencao", "Com @menção", "Sem @menção"),
      porHashtag: binario("tem_hashtag", "Com hashtag", "Sem hashtag"),
      porMes,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">Erro ao carregar: {erro}</CardContent>
      </Card>
    );
  }

  if (!analise) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Nenhum dado disponível ainda.</CardContent>
      </Card>
    );
  }

  const maxDe = (grupos: Grupo[]) =>
    Math.max(...grupos.map((g) => g.engagementMedio ?? 0), analise.baseline ?? 0, 0.0001);

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Análise sobre os {rows.length} itens da conta inteira (sem filtro de período), comparando a taxa de
          engajamento média de cada grupo contra a média geral da conta ({fmtPctFraction(analise.baseline)}).
          Grupos com poucos itens (n menor que {AMOSTRA_MINIMA}) aparecem marcados como amostra pequena — não
          tire conclusão forte deles. A estratégia de conteúdo mudou bastante ao longo do tempo (ver "Evolução
          por mês" no fim), então esses recortes misturam eras diferentes.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por dia da semana</CardTitle>
            <CardDescription>Taxa de engajamento média de quem foi publicado em cada dia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analise.porDiaSemana.map((g) => (
              <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porDiaSemana)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por período do dia</CardTitle>
            <CardDescription>Horário de publicação, fuso America/Sao_Paulo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analise.porPeriodoDia.map((g) => (
              <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porPeriodoDia)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por tamanho de legenda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analise.porLegenda.map((g) => (
              <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porLegenda)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atributos da legenda</CardTitle>
            <CardDescription>Com vs. sem, mesma métrica</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {analise.porCta.map((g) => (
                <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porCta)} />
              ))}
            </div>
            <div className="space-y-3 border-t pt-3">
              {analise.porMencao.map((g) => (
                <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porMencao)} />
              ))}
            </div>
            <div className="space-y-3 border-t pt-3">
              {analise.porHashtag.map((g) => (
                <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porHashtag)} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução por mês</CardTitle>
          <CardDescription>
            Taxa de engajamento média por mês de publicação — use pra enxergar se um padrão acima é sinal
            real ou só reflexo de uma fase antiga da conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-2">
            {analise.porMes.map((g) => (
              <BarraGrupo key={g.chave} grupo={g} baseline={analise.baseline} max={maxDe(analise.porMes)} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
