"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Info } from "lucide-react";
import { fmtDataCurta, fmtDataPura } from "../lib";

const TRILHA_LABELS: Record<string, string> = {
  bastidores: "Bastidores",
  colab_cliente: "Colab/Cliente",
  humor_meme: "Humor/Meme",
  cta_padrao: "CTA padrão",
  tendencia: "Tendência",
  outro: "Outro",
};

function labelTrilha(t: string) {
  return TRILHA_LABELS[t] ?? t;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  seguida: "Seguida",
  nao_seguida: "Não seguida",
};

function BadgeStatus({ status }: { status: string }) {
  if (status === "seguida") {
    return (
      <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === "nao_seguida") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  return <Badge variant="secondary">{STATUS_LABELS[status] ?? status}</Badge>;
}

function BadgeNota({ nota }: { nota: number | null }) {
  if (nota == null) return <span className="text-muted-foreground">—</span>;
  const cor =
    nota >= 7
      ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
      : nota >= 4
        ? "border-amber-600/40 text-amber-700 dark:text-amber-400"
        : "border-red-600/40 text-red-700 dark:text-red-400";
  return (
    <Badge variant="outline" className={cor}>
      {nota.toFixed(1)}
    </Badge>
  );
}

interface AuditoriaMedia {
  thumbnail_url: string | null;
  media_url: string | null;
  permalink: string | null;
  media_type: string | null;
  timestamp: string | null;
}

interface AuditoriaRow {
  id: number;
  media_id: string;
  trilha: string;
  nota: number | null;
  resumo: string;
  pontos_fortes: string | null;
  pontos_fracos: string | null;
  criado_em: string;
  ig_media: AuditoriaMedia | AuditoriaMedia[] | null;
}

interface CalendarioRow {
  id: number;
  semana_inicio: string;
  dia_planejado: string;
  media_product_type: string;
  trilha: string;
  descricao_imagem: string | null;
  legenda: string | null;
  cta: string | null;
  roteiro: string | null;
  justificativa: string;
  status: string;
}

function DetalheItem({ titulo, texto, muted }: { titulo: string; texto: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className={`whitespace-pre-line text-sm ${muted ? "text-muted-foreground" : ""}`}>{texto}</p>
    </div>
  );
}

function mediaDaAuditoria(row: AuditoriaRow): AuditoriaMedia | null {
  if (!row.ig_media) return null;
  return Array.isArray(row.ig_media) ? (row.ig_media[0] ?? null) : row.ig_media;
}

export function Estrategia() {
  const [auditorias, setAuditorias] = useState<AuditoriaRow[]>([]);
  const [calendario, setCalendario] = useState<CalendarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<CalendarioRow | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const [auditoriasRes, calendarioRes] = await Promise.all([
        supabase
          .from("ig_auditorias")
          .select(
            "id, media_id, trilha, nota, resumo, pontos_fortes, pontos_fracos, criado_em, ig_media(thumbnail_url, media_url, permalink, media_type, timestamp)",
          )
          .order("criado_em", { ascending: false })
          .limit(30),
        supabase
          .from("ig_calendario_semanal")
          .select(
            "id, semana_inicio, dia_planejado, media_product_type, trilha, descricao_imagem, legenda, cta, roteiro, justificativa, status",
          )
          .order("semana_inicio", { ascending: false })
          .order("dia_planejado", { ascending: true })
          .limit(50),
      ]);
      if (cancel) return;
      if (auditoriasRes.error) {
        setErro(auditoriasRes.error.message);
        setLoading(false);
        return;
      }
      if (calendarioRes.error) {
        setErro(calendarioRes.error.message);
        setLoading(false);
        return;
      }
      setAuditorias((auditoriasRes.data as unknown as AuditoriaRow[]) ?? []);
      setCalendario((calendarioRes.data as CalendarioRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
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

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Ciclo semanal automático: o Auditor avalia o que maturou (7-90 dias) e o Estrategista propõe a
          semana seguinte com base na performance por trilha e nas auditorias recentes. Revisão humana antes
          de produzir continua obrigatória — isso aqui é sugestão, não publicação automática.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Calendário sugerido</CardTitle>
          <CardDescription>
            Proposta do Estrategista por semana — status muda pra "Seguida" quando o Auditor reconhece um
            post publicado como correspondente, ou "Não seguida" se a sugestão expirar sem casar com nada.
            Clique numa linha pra ver a sugestão completa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calendario.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sugestão gerada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Trilha</TableHead>
                    <TableHead>Prévia</TableHead>
                    <TableHead>CTA</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calendario.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => setSelecionado(item)}
                    >
                      <TableCell className="whitespace-nowrap">{fmtDataPura(item.dia_planejado)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.media_product_type}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{labelTrilha(item.trilha)}</TableCell>
                      <TableCell className="max-w-sm whitespace-normal align-top">
                        <p className="line-clamp-2 text-sm">
                          {item.roteiro ?? item.descricao_imagem ?? item.legenda ?? "—"}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.justificativa}</p>
                      </TableCell>
                      <TableCell className="max-w-[160px] whitespace-normal align-top">
                        <p className="line-clamp-2 text-sm">{item.cta ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <BadgeStatus status={item.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selecionado} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {selecionado && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  {fmtDataPura(selecionado.dia_planejado)}
                  <Badge variant="secondary">{selecionado.media_product_type}</Badge>
                  <Badge variant="secondary">{labelTrilha(selecionado.trilha)}</Badge>
                  <BadgeStatus status={selecionado.status} />
                </DialogTitle>
                <DialogDescription className="text-left">
                  Sugestão completa gerada pelo Estrategista pra essa data.
                </DialogDescription>
              </DialogHeader>

              {selecionado.descricao_imagem && (
                <DetalheItem titulo="Descrição da imagem" texto={selecionado.descricao_imagem} />
              )}
              {selecionado.legenda && <DetalheItem titulo="Legenda" texto={selecionado.legenda} />}
              {selecionado.cta && <DetalheItem titulo="CTA" texto={selecionado.cta} />}
              {selecionado.roteiro && <DetalheItem titulo="Roteiro" texto={selecionado.roteiro} />}
              <DetalheItem titulo="Justificativa" texto={selecionado.justificativa} muted />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Auditorias recentes</CardTitle>
          <CardDescription>
            Avaliação do Auditor por post/reel maturado — nota comparada com a média histórica da conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditorias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma auditoria gerada ainda.</p>
          ) : (
            <div className="space-y-4">
              {auditorias.map((row) => {
                const media = mediaDaAuditoria(row);
                const img = media?.thumbnail_url ?? media?.media_url;
                return (
                  <div key={row.id} className="flex gap-3 border-b pb-4 last:border-b-0 last:pb-0">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          Sem prévia
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {media?.timestamp ? fmtDataCurta(media.timestamp) : "—"}
                        </span>
                        <Badge variant="secondary">{labelTrilha(row.trilha)}</Badge>
                        <BadgeNota nota={row.nota} />
                        {media?.permalink && (
                          <a
                            href={media.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                          >
                            Ver no Instagram <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-sm">{row.resumo}</p>
                      {(row.pontos_fortes || row.pontos_fracos) && (
                        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          {row.pontos_fortes && (
                            <p>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">+</span>{" "}
                              {row.pontos_fortes}
                            </p>
                          )}
                          {row.pontos_fracos && (
                            <p>
                              <span className="font-medium text-red-700 dark:text-red-400">-</span>{" "}
                              {row.pontos_fracos}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
