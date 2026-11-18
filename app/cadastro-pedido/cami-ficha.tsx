"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FichaRascunho } from "@/lib/ghl/ficha-pedido/regras";
import { cn } from "@/lib/utils";

type Estado = {
  status: "gerando" | "pronto" | "erro";
  rascunho: FichaRascunho | null;
  erro: string | null;
  geradoEm: string | null;
  atualizadoEm: string;
};

const ROTULO_ORIGEM: Record<string, string> = {
  paymentForm: "Forma de pagamento",
  unitPrice: "Preço do par",
  freightCondition: "Frete",
  orderType: "Tipo do pedido",
};

const horario = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/**
 * A Cami lê a conversa do fechamento e monta a ficha do pedido. O rascunho é
 * gerado quando o pedido entra na etapa; aqui ele é aplicado no formulário
 * (sozinho, quando a ficha ainda está sem grade) e o vendedor confere e salva.
 */
export function PainelCami({
  opportunityId,
  podeAplicarSozinho,
  onAplicar,
  onDesfazer,
}: {
  opportunityId: string;
  podeAplicarSozinho: boolean;
  onAplicar: (rascunho: FichaRascunho) => Promise<{ preenchidos: string[]; ignorados: string[] }>;
  onDesfazer: (() => void) | null;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [aplicado, setAplicado] = useState<{ preenchidos: string[]; ignorados: string[] } | null>(null);
  const [verOrigens, setVerOrigens] = useState(false);
  const autoFeito = useRef(false);
  const podeAplicarSozinhoRef = useRef(podeAplicarSozinho);
  podeAplicarSozinhoRef.current = podeAplicarSozinho;
  const onAplicarRef = useRef(onAplicar);
  onAplicarRef.current = onAplicar;

  const aplicar = useCallback(async (rascunho: FichaRascunho) => {
    const resultado = await onAplicarRef.current(rascunho);
    setAplicado(resultado);
  }, []);

  const receber = useCallback(
    (novo: Estado | null) => {
      setEstado(novo);
      if (novo?.status === "pronto" && novo.rascunho && !autoFeito.current && podeAplicarSozinhoRef.current) {
        autoFeito.current = true;
        void aplicar(novo.rascunho);
      }
    },
    [aplicar],
  );

  // Lê o rascunho ao abrir; enquanto a Cami estiver gerando, confere a cada 4 s (até 2 min).
  useEffect(() => {
    let ativo = true;
    let tentativas = 0;
    const ler = async () => {
      try {
        const res = await fetch(`/api/cadastro-pedido/${opportunityId}/rascunho`, { cache: "no-store" });
        const json = (await res.json()) as { rascunho?: Estado | null };
        if (!ativo) return;
        receber(json.rascunho ?? null);
        if (json.rascunho?.status === "gerando" && tentativas++ < 30) window.setTimeout(() => void ler(), 4000);
      } catch {
        if (ativo) setEstado(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void ler();
    return () => {
      ativo = false;
    };
  }, [opportunityId, receber]);

  const gerar = async (refazer: boolean) => {
    setPedindo(true);
    try {
      const res = await fetch(`/api/cadastro-pedido/${opportunityId}/rascunho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refazer }),
      });
      const json = (await res.json()) as { rascunho?: Estado | null; error?: string };
      const novo = json.rascunho ?? null;
      setEstado(novo);
      if (novo?.status === "pronto" && novo.rascunho) await aplicar(novo.rascunho);
    } finally {
      setPedindo(false);
    }
  };

  const rascunho = estado?.status === "pronto" ? estado.rascunho : null;
  const gerando = pedindo || estado?.status === "gerando";

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {carregando
                ? "Procurando o rascunho da Cami…"
                : gerando
                  ? "A Cami está lendo a conversa…"
                  : aplicado
                    ? `A Cami preencheu ${aplicado.preenchidos.length} item(ns) a partir da conversa`
                    : rascunho
                      ? "A Cami montou um rascunho desta ficha"
                      : estado?.status === "erro"
                        ? "A Cami não conseguiu montar o rascunho"
                        : "A Cami pode preencher esta ficha pela conversa"}
            </p>
            <p className="text-xs text-muted-foreground">
              {gerando
                ? "Leva de 15 a 40 segundos."
                : rascunho
                  ? `Gerado em ${horario(estado?.geradoEm ?? null)}. Confira tudo antes de salvar; embarque e transportadora ficam com você.`
                  : estado?.status === "erro"
                    ? (estado.erro ?? "Tente de novo.")
                    : "Grade, solado, arte, preço, frete, pagamento e comprovante."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {gerando && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {!gerando && rascunho && !aplicado && (
            <Button type="button" size="sm" onClick={() => void aplicar(rascunho)}>
              <Sparkles className="h-4 w-4" />
              Preencher com a Cami
            </Button>
          )}
          {!gerando && !rascunho && !carregando && (
            <Button type="button" size="sm" onClick={() => void gerar(false)}>
              <Sparkles className="h-4 w-4" />
              {estado?.status === "erro" ? "Tentar de novo" : "Preencher com a Cami"}
            </Button>
          )}
          {!gerando && aplicado && onDesfazer && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onDesfazer();
                setAplicado(null);
              }}
            >
              <Undo2 className="h-4 w-4" />
              Desfazer
            </Button>
          )}
          {!gerando && rascunho && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void gerar(true)} title="Ler a conversa de novo">
              <RotateCcw className="h-4 w-4" />
              Refazer
            </Button>
          )}
        </div>
      </div>

      {rascunho && (rascunho.avisos.length > 0 || (aplicado?.ignorados.length ?? 0) > 0) && (
        <ul className="mt-3 space-y-1 rounded-md bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          {[...rascunho.avisos, ...(aplicado?.ignorados ?? [])].map((aviso) => (
            <li key={aviso} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{aviso}</span>
            </li>
          ))}
        </ul>
      )}

      {rascunho && (rascunho.observacaoImportante || rascunho.observacoes.length > 0) && (
        <div className="mt-3 space-y-1 text-xs">
          {rascunho.observacaoImportante && (
            <p>
              <span className="text-muted-foreground">Observação importante no GHL: </span>
              <b>{rascunho.observacaoImportante}</b>
            </p>
          )}
          {rascunho.observacoes.length > 0 && (
            <p>
              <span className="text-muted-foreground">Da conversa: </span>
              {rascunho.observacoes.join(" · ")}
            </p>
          )}
        </div>
      )}

      {rascunho && (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setVerOrigens((v) => !v)}
          >
            {verOrigens ? "Esconder de onde veio" : "Ver de onde veio cada dado"}
          </button>
          <ul className={cn("mt-2 space-y-1 text-xs text-muted-foreground", !verOrigens && "hidden")}>
            {rascunho.modelos.map((m) => (
              <li key={m.modelNumber}>
                <b className="text-foreground">Modelo {m.modelNumber}</b>
                {m.descricao ? ` (${m.descricao})` : ""}: {m.origemGrade || "sem origem"}
                {m.soleColor ? ` · solado ${m.soleColor}` : m.soleNote ? ` · ${m.soleNote}` : ""}
                {m.tipoPersonalizacao ? ` · ${m.tipoPersonalizacao}` : ""}
              </li>
            ))}
            {Object.entries(rascunho.origens).map(([campo, origem]) => (
              <li key={campo}>
                <b className="text-foreground">{ROTULO_ORIGEM[campo] ?? campo}</b>: {origem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
