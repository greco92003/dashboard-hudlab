"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertCircle, ArrowLeft, FileText, Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import type { ConsolidadoCompra, OrdemCompra } from "@/lib/estoque/ordem-compra";
import { OC_SITUACAO } from "@/lib/estoque/ordem-compra";
import { NovaOrdemDialog } from "@/components/estoque/nova-ordem-dialog";

const data = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const SITUACAO_ROTULO: Record<string, string> = {
  [OC_SITUACAO.emAberto]: "Em aberto",
  [OC_SITUACAO.atendido]: "Atendida",
  [OC_SITUACAO.cancelado]: "Cancelada",
  [OC_SITUACAO.emAndamento]: "Em andamento",
};

/**
 * O que falta chegar, por numeração.
 *
 * Consolidado e não por ordem de propósito: ao receber uma nota o Tiny
 * desmembra a ordem — reduz a original e cria uma filha com o que entrou —,
 * então "quanto esta OC já recebeu" não é uma pergunta que os dados respondam.
 * O total é exato; o rateio entre ordens seria chute.
 */
function TabelaConsolidada({ linhas }: { linhas: ConsolidadoCompra[] }) {
  const ordenadas = [...linhas].sort(
    (a, b) =>
      a.cor.localeCompare(b.cor) || a.numeracao.localeCompare(b.numeracao),
  );
  const total = (campo: "pedido" | "recebido" | "faltando") =>
    ordenadas.reduce((soma, l) => soma + l[campo], 0);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Situação por numeração</h2>
        <Badge variant={total("faltando") > 0 ? "secondary" : "outline"}>
          {total("faltando")} a caminho
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Numeração</th>
              <th className="px-3 py-2 text-right font-medium">Pedido</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="border-l px-3 py-2 text-right font-medium">
                A caminho
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((linha) => (
              <tr key={linha.produtoId} className="border-b last:border-0">
                <td className="px-3 py-1.5">
                  {linha.cor} {linha.numeracao}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {linha.pedido}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {linha.recebido || "—"}
                </td>
                <td className="border-l px-3 py-1.5 text-right tabular-nums">
                  {linha.faltando ? (
                    <span className="font-medium">{linha.faltando}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {total("pedido")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {total("recebido")}
              </td>
              <td className="border-l px-3 py-2 text-right tabular-nums">
                {total("faltando")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Uma ordem como ela está no Tiny — o que foi pedido, e nada além disso. */
function CardOrdem({
  ordem,
  onMudou,
}: {
  ordem: OrdemCompra;
  onMudou: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const pedidos = ordem.itens.reduce((t, i) => t + i.quantidade, 0);
  const cancelada = ordem.situacao === OC_SITUACAO.cancelado;

  const cancelar = async () => {
    if (!confirm(`Cancelar a ordem ${ordem.numeroPedido ?? ordem.id}?`)) return;
    setOcupado(true);
    try {
      const resposta = await fetch(`/api/estoque/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelar: true }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha ao cancelar.");
      toast.success("Ordem cancelada no Tiny.");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
        <h2 className="font-semibold">OC {ordem.numeroPedido ?? ordem.id}</h2>
        <span className="text-sm text-muted-foreground">
          emitida {data(ordem.data)} · prevista {data(ordem.dataPrevista)}
        </span>
        {ordem.notaFiscal && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            NF {ordem.notaFiscal.numero}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">
            {SITUACAO_ROTULO[ordem.situacao ?? ""] ?? "—"}
          </Badge>
          <span className="text-sm tabular-nums text-muted-foreground">
            {pedidos} pares
          </span>
          {!cancelada && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelar}
              disabled={ocupado}
            >
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {ordem.itens.map((item) => (
              <tr key={item.produtoId} className="border-b last:border-0">
                <td className="px-3 py-1.5">
                  {item.cor && item.numeracao
                    ? `${item.cor} ${item.numeracao}`
                    : item.descricao}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.quantidade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OrdensPage() {
  const [dados, setDados] = useState<{
    ordens: OrdemCompra[];
    consolidado: ConsolidadoCompra[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const resposta = await fetch("/api/estoque/ordens");
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha na leitura.");
      setDados({ ordens: corpo.ordens, consolidado: corpo.consolidado });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na leitura.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const vivas = (dados?.ordens ?? []).filter(
    (o) => o.situacao !== OC_SITUACAO.cancelado,
  );
  const canceladas = (dados?.ordens ?? []).filter(
    (o) => o.situacao === OC_SITUACAO.cancelado,
  );

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Truck className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Ordens de Compra</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/estoque">
              <ArrowLeft className="h-4 w-4" />
              Estoque
            </Link>
          </Button>
          <NovaOrdemDialog onCriada={carregar}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nova ordem
            </Button>
          </NovaOrdemDialog>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        As ordens ficam no Tiny, e o recebimento vem das notas de entrada do
        fornecedor. Ao receber, o Tiny divide a ordem em duas — por isso o que
        falta é mostrado por numeração, somando todas as ordens, e não uma a
        uma.
      </p>

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!dados && !erro && <Skeleton className="h-64" />}

      {dados && dados.consolidado.length > 0 && (
        <TabelaConsolidada linhas={dados.consolidado} />
      )}

      {dados && dados.ordens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma ordem de compra no Tiny para este fornecedor.
        </p>
      )}

      {vivas.length > 0 && (
        <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ordens no Tiny
        </h2>
      )}
      {vivas.map((ordem) => (
        <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
      ))}

      {canceladas.length > 0 && (
        <>
          <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Canceladas
          </h2>
          {canceladas.map((ordem) => (
            <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
          ))}
        </>
      )}
    </div>
  );
}
