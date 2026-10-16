"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AnnexItem } from "@/lib/ghl/ai-seller/annex-shape";
import type { AnnexPage } from "@/lib/ghl/ai-seller/annex";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "./format";

type Payload = AnnexPage & { podeAprovar: boolean; proximaRevisao: string };

const ESTADO: Record<AnnexItem["estado"], { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  ajustado: { label: "Ajustado", cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  mantido: { label: "Mantido", cls: "text-muted-foreground" },
  removido: { label: "Removido", cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" },
};

const ORIGEM: Record<string, string> = {
  semanal: "revisão de segunda",
  urgente: "feedback urgente",
  manual: "gerada pelo dono",
  inicial: "regras da casa antigas",
};

const STATUS: Record<string, string> = {
  publicado: "publicado",
  substituido: "substituído",
  descartado: "descartado",
  rascunho: "para aprovar",
};

function ItemCard({
  item,
  editando,
  texto,
  onTexto,
}: {
  item: AnnexItem;
  editando: boolean;
  texto: string;
  onTexto: (v: string) => void;
}) {
  const e = ESTADO[item.estado];
  const removido = item.estado === "removido";
  return (
    <li
      className={cn(
        "space-y-2 rounded-xl border p-3",
        item.estado === "novo" && "border-emerald-500/40",
        item.estado === "ajustado" && "border-amber-500/40",
        removido && "border-dashed",
      )}
    >
      <Badge variant="outline" className={cn("text-[11px] font-bold uppercase tracking-wide", e.cls)}>
        {e.label}
      </Badge>
      {editando && !removido ? (
        <Textarea value={texto} onChange={(ev) => onTexto(ev.target.value)} rows={3} aria-label="Texto do item" />
      ) : (
        <p className={cn("text-sm leading-relaxed", removido ? "text-muted-foreground line-through" : "font-medium")}>{item.texto}</p>
      )}
      {item.estado === "ajustado" && item.antes && <p className="text-xs text-muted-foreground">Antes: {item.antes}</p>}
      {item.motivo && <p className="text-xs text-muted-foreground">{item.motivo}</p>}
      {item.exemplo && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
          <p className="text-xs font-semibold">
            Como teria sido
            {item.exemplo.nome && (
              <>
                {" · "}
                <a className="underline" href={`/cami?tab=conversas&conversa=${encodeURIComponent(item.exemplo.opportunityId)}`}>
                  {item.exemplo.nome}
                </a>
              </>
            )}
          </p>
          <p className="max-w-[85%] rounded-xl rounded-bl-sm bg-zinc-100 px-2.5 py-1.5 text-xs dark:bg-zinc-800">
            Cliente: {item.exemplo.cliente}
          </p>
          {item.exemplo.antes.map((m, i) => (
            <p
              key={`a${i}`}
              className="ml-auto max-w-[85%] rounded-xl rounded-br-sm border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs text-muted-foreground line-through"
            >
              {m}
            </p>
          ))}
          {item.exemplo.depois.map((m, i) => (
            <p
              key={`d${i}`}
              className="ml-auto max-w-[85%] rounded-xl rounded-br-sm border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs"
            >
              {m}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

export function CamiAnnex() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"gerar" | "aprovar" | "descartar" | null>(null);
  const [editando, setEditando] = useState(false);
  const [textos, setTextos] = useState<string[]>([]);
  const [historico, setHistorico] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cami/anexo", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao carregar o anexo");
      setData(json);
      setTextos((json.rascunho?.itens ?? []).map((i: AnnexItem) => i.texto));
      setEditando(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (kind: "gerar" | "aprovar" | "descartar") => {
    if (!data) return;
    setBusy(kind);
    try {
      const url =
        kind === "gerar" ? "/api/cami/anexo/gerar" : `/api/cami/anexo/${data.rascunho?.id}/${kind}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "aprovar" && editando ? JSON.stringify({ textos }) : "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível concluir");
      toast.success(
        kind === "gerar"
          ? "Revisão pronta para aprovar"
          : kind === "aprovar"
            ? "Anexo publicado: vale a partir da próxima resposta da Cami"
            : "Revisão descartada",
      );
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <Skeleton className="h-96 w-full" />;
  if (!data) return <p className="py-8 text-center text-muted-foreground">Não foi possível carregar o anexo.</p>;

  const { rascunho, vigente, fila, podeAprovar } = data;
  const stats = rascunho
    ? rascunho.itens.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.estado]: (acc[i.estado] ?? 0) + 1 }), {})
    : {};
  const vigentes = vigente ? vigente.itens.filter((i) => i.estado !== "removido") : [];

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Aprendizados aprovados que complementam o jeito de atender da Cami. Toda segunda, os feedbacks da semana viram uma
        revisão do anexo inteiro, que o dono aprova.
      </p>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="text-sm">
            <p className="font-semibold">
              {fila.total} {fila.total === 1 ? "feedback na fila" : "feedbacks na fila"}
              {fila.porAutor.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  ({fila.porAutor.map((a) => `${a.autor} ${a.n}`).join(", ")})
                </span>
              )}
            </p>
            <p className="text-muted-foreground">Próxima revisão: segunda, {data.proximaRevisao}, às 8h30.</p>
          </div>
          {podeAprovar && (
            <Button variant="outline" onClick={() => act("gerar")} disabled={busy != null || fila.total === 0}>
              {busy === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy === "gerar" ? "Revisando… até 1 min" : "Gerar revisão agora"}
            </Button>
          )}
        </CardContent>
      </Card>

      {rascunho && (
        <Card className="border-emerald-500/40">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Revisão para aprovar</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ORIGEM[rascunho.origem] ?? rascunho.origem} · {fmtDateTime(rascunho.createdAt)} · {rascunho.feedbackIds.length}{" "}
              {rascunho.feedbackIds.length === 1 ? "feedback" : "feedbacks"}
            </p>
            {rascunho.resumo && <p className="text-sm">{rascunho.resumo}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(["novo", "ajustado", "mantido", "removido"] as const)
                .filter((k) => stats[k])
                .map((k) => (
                  <Badge key={k} variant="outline" className={ESTADO[k].cls}>
                    {stats[k]} {ESTADO[k].label.toLowerCase()}
                    {stats[k] > 1 ? "s" : ""}
                  </Badge>
                ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {rascunho.itens.map((item, i) => (
                <ItemCard
                  key={i}
                  item={item}
                  editando={editando}
                  texto={textos[i] ?? item.texto}
                  onTexto={(v) => setTextos((t) => t.map((x, j) => (j === i ? v : x)))}
                />
              ))}
            </ul>

            {rascunho.paraOManual.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-200">Para o manual (política comercial, não entra no anexo)</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {rascunho.paraOManual.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Preço, frete e prazos mudam no manual: peça ao Claude.</p>
              </div>
            )}

            {podeAprovar ? (
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" onClick={() => act("aprovar")} disabled={busy != null}>
                  {busy === "aprovar" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Aprovar e publicar
                </Button>
                <Button variant="outline" onClick={() => setEditando((v) => !v)} disabled={busy != null}>
                  {editando ? "Parar de ajustar" : "Ajustar texto"}
                </Button>
                <Button variant="outline" onClick={() => act("descartar")} disabled={busy != null}>
                  {busy === "descartar" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Descartar
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando a aprovação do dono.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Anexo em vigor</CardTitle>
          {vigente?.publishedAt && (
            <p className="text-sm text-muted-foreground">
              Desde {fmtDateTime(vigente.publishedAt)} · {vigentes.length} {vigentes.length === 1 ? "item" : "itens"}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {vigentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem itens: a Cami segue só o jeito de atender.</p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {vigentes.map((i, k) => (
                <li key={k}>{i.texto}</li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {data.historico.length > 0 && (
        <Card>
          <button
            type="button"
            onClick={() => setHistorico((v) => !v)}
            aria-expanded={historico}
            className="flex w-full items-center justify-between px-6 py-4 text-sm font-semibold"
          >
            Histórico de versões
            <ChevronDown className={cn("h-4 w-4 transition-transform", historico && "rotate-180")} />
          </button>
          {historico && (
            <CardContent>
              <ul className="space-y-1 text-sm">
                {data.historico.map((h) => (
                  <li key={h.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                    <span>
                      {fmtDateTime(h.decidedAt ?? h.createdAt)} · {ORIGEM[h.origem] ?? h.origem}
                    </span>
                    <span className="text-muted-foreground">
                      {STATUS[h.status] ?? h.status} · {h.itens} {h.itens === 1 ? "item" : "itens"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
