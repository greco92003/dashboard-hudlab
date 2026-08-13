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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";
import { fmtBrl, fmtDataCurta } from "../lib";

// Números REAIS anexados pela edge function (metricasPorAdId), não a
// versão que o Claude reescreveu na descrição -- ver comentário na
// edge function meta-ghl-creative-insights sobre o motivo (achado ao
// testar: mesmo instruído a citar número real, o Claude erra a
// transcrição de alguns valores na prosa).
interface AnuncioRelacionado {
  ad_id: string;
  ad_name: string | null;
  investimento: number;
  custo_por_lead: number | null;
  custo_por_negociacao: number | null;
  roas: number | null;
  cpc_implicito: number | null;
  cpm_implicito: number | null;
}

interface PadraoRow {
  id: string;
  titulo: string;
  descricao: string;
  metrica_chave: string | null;
  forca_sinal: "forte" | "moderado" | "fraco";
  anuncios_relacionados: AnuncioRelacionado[];
  periodo_inicio: string;
  periodo_fim: string;
  gerado_em: string;
}

interface CreativeAnalysisJson {
  resumo?: string;
  estilo_visual?: string;
  tom_da_copy?: string;
  publico_alvo_sugerido?: string;
  tem_texto_no_criativo?: boolean;
  texto_principal?: string | null;
  mostra_preco?: boolean;
  menciona_pedido_minimo?: boolean;
  menciona_prazo_entrega?: boolean;
  produto_em_close_up?: boolean;
  modelo_vestindo_produto?: boolean;
}

interface CreativeAnalysisRow {
  ad_id: string;
  media_type: string | null;
  call_to_action_type: string | null;
  analysis: CreativeAnalysisJson | null;
}

interface FunnelRow {
  ad_id: string;
  ad_name: string | null;
  spend_total: number;
  leads_ghl: number;
  custo_por_lead: number | null;
  custo_por_negociacao: number | null;
  roas: number | null;
}

interface CriativoCombinado {
  ad_id: string;
  ad_name: string | null;
  media_type: string | null;
  call_to_action_type: string | null;
  analysis: CreativeAnalysisJson | null;
  spend_total: number;
  custo_por_lead: number | null;
  custo_por_negociacao: number | null;
  roas: number | null;
}

function ForcaSinalBadge({ forca }: { forca: string }) {
  if (forca === "forte") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
        Sinal forte
      </Badge>
    );
  }
  if (forca === "moderado") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
        Sinal moderado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Sinal fraco
    </Badge>
  );
}

function metricaRelacionado(a: AnuncioRelacionado): string {
  // Nem todo anúncio citado usa a mesma métrica de sucesso (ver
  // categoria_objetivo no prompt) -- mostra o que faz sentido pra cada um.
  if (a.custo_por_negociacao != null) return `${fmtBrl(a.custo_por_negociacao)}/negociação`;
  if (a.custo_por_lead != null) return `${fmtBrl(a.custo_por_lead)}/lead`;
  if (a.cpc_implicito != null) return `${fmtBrl(a.cpc_implicito)}/clique`;
  if (a.cpm_implicito != null) return `${fmtBrl(a.cpm_implicito)} CPM`;
  return "—";
}

export function Criativos() {
  const [padroes, setPadroes] = useState<PadraoRow[]>([]);
  const [criativos, setCriativos] = useState<CriativoCombinado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const hoje = new Date();
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 29);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const [padroesRes, analiseRes, funilRes] = await Promise.all([
        supabase
          .from("meta_ad_creative_insights")
          .select("*")
          .order("forca_sinal", { ascending: true }),
        supabase
          .from("meta_ad_creative_analysis")
          .select("ad_id, media_type, call_to_action_type, analysis")
          .not("analysis", "is", null),
        supabase.rpc("get_funnel_por_anuncio", { p_inicio: fmt(inicio), p_fim: fmt(hoje) }),
      ]);
      if (cancel) return;

      const erroEncontrado =
        padroesRes.error?.message ?? analiseRes.error?.message ?? funilRes.error?.message ?? null;
      if (erroEncontrado) {
        setErro(erroEncontrado);
        setLoading(false);
        return;
      }

      // "forte" > "moderado" > "fraco" na exibição -- ordena manualmente
      // (order alfabética do Supabase deixaria "fraco" antes de "forte").
      const ORDEM_FORCA: Record<string, number> = { forte: 0, moderado: 1, fraco: 2 };
      const padroesOrdenados = ((padroesRes.data as PadraoRow[]) ?? []).sort(
        (a, b) => (ORDEM_FORCA[a.forca_sinal] ?? 9) - (ORDEM_FORCA[b.forca_sinal] ?? 9),
      );
      setPadroes(padroesOrdenados);

      const funilPorAdId = new Map(
        ((funilRes.data as FunnelRow[]) ?? []).map((f) => [f.ad_id, f]),
      );
      const combinados = ((analiseRes.data as CreativeAnalysisRow[]) ?? [])
        .map((c) => {
          const f = funilPorAdId.get(c.ad_id);
          return {
            ad_id: c.ad_id,
            ad_name: f?.ad_name ?? null,
            media_type: c.media_type,
            call_to_action_type: c.call_to_action_type,
            analysis: c.analysis,
            spend_total: f?.spend_total ?? 0,
            custo_por_lead: f?.custo_por_lead ?? null,
            custo_por_negociacao: f?.custo_por_negociacao ?? null,
            roas: f?.roas ?? null,
          };
        })
        // Sem nome conhecido de anúncio = fora do funil dos últimos 30
        // dias (mesma régua do resto do módulo) -- não ajuda a comparar.
        .filter((c) => c.ad_name != null)
        .sort((a, b) => b.spend_total - a.spend_total);
      setCriativos(combinados);
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
        <Skeleton className="h-64" />
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

  const ultimaGeracao = padroes[0]?.gerado_em;
  const periodo = padroes[0];

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Cruza os atributos de criativo (formato, estilo visual, tom da copy,
          texto sobreposto, público sugerido — extraídos por visão
          computacional + transcrição de áudio) com a performance real de
          funil dos últimos 30 dias, pra achar padrões do tipo &quot;Seu Logo
          Aqui&quot; sistematicamente. Atualiza 1x/dia. Amostra ainda pequena —
          leve o &quot;sinal fraco/moderado&quot; a sério antes de mudar
          estratégia de criativo.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Padrões identificados</CardTitle>
          <CardDescription>
            {periodo
              ? `Período analisado: ${fmtDataCurta(periodo.periodo_inicio)} a ${fmtDataCurta(
                  periodo.periodo_fim,
                )}${ultimaGeracao ? ` · gerado em ${new Date(ultimaGeracao).toLocaleString("pt-BR")}` : ""}`
              : "Ainda sem padrões gerados."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {padroes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum padrão gerado ainda. O ciclo roda automaticamente todo
              dia às 06:35 (horário de Brasília).
            </p>
          ) : (
            <div className="space-y-5">
              {padroes.map((p) => (
                <div key={p.id} className="border-b pb-5 last:border-b-0 last:pb-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.titulo}</span>
                    <ForcaSinalBadge forca={p.forca_sinal} />
                  </div>
                  <p className="text-sm text-muted-foreground">{p.descricao}</p>
                  {p.anuncios_relacionados.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {p.anuncios_relacionados.map((a) => (
                        <span
                          key={a.ad_id}
                          className="text-xs rounded-md border px-2 py-1 bg-muted/40"
                          title={`Investimento: ${fmtBrl(a.investimento)}${a.roas != null ? ` · ROAS ${a.roas}x` : ""}`}
                        >
                          <span className="font-medium">{a.ad_name ?? a.ad_id}</span>
                          {": "}
                          {metricaRelacionado(a)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Todos os criativos ativos</CardTitle>
          <CardDescription>
            Atributos extraídos de cada anúncio ativo, lado a lado com a
            performance dos últimos 30 dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {criativos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum criativo analisado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Mídia</TableHead>
                    <TableHead>Estilo visual</TableHead>
                    <TableHead>Tom da copy</TableHead>
                    <TableHead>Público sugerido</TableHead>
                    <TableHead>Texto no criativo</TableHead>
                    <TableHead className="text-right">Invest.</TableHead>
                    <TableHead className="text-right">Custo/Lead</TableHead>
                    <TableHead className="text-right">Custo/Negoc.</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criativos.map((c) => (
                    <TableRow key={c.ad_id}>
                      <TableCell className="max-w-56">
                        <div className="truncate font-medium" title={c.ad_name ?? c.ad_id}>
                          {c.ad_name ?? c.ad_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {c.media_type === "video" ? "Vídeo" : "Imagem"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {c.analysis?.estilo_visual ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {c.analysis?.tom_da_copy ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {c.analysis?.publico_alvo_sugerido ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-48">
                        {c.analysis?.tem_texto_no_criativo && c.analysis?.texto_principal ? (
                          <div
                            className="truncate text-sm"
                            title={c.analysis.texto_principal}
                          >
                            &quot;{c.analysis.texto_principal}&quot;
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{fmtBrl(c.spend_total)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(c.custo_por_lead)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(c.custo_por_negociacao)}</TableCell>
                      <TableCell className="text-right">
                        {c.roas != null ? `${c.roas}x` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
