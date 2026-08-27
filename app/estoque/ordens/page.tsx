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
import type { OrdemCompra } from "@/lib/estoque/ordem-compra";
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

function CardOrdem({
  ordem,
  onMudou,
}: {
  ordem: OrdemCompra;
  onMudou: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const pedidos = ordem.itens.reduce((t, i) => t + i.quantidade, 0);
  const encerrada =
    ordem.situacao === OC_SITUACAO.cancelado ||
    ordem.situacao === OC_SITUACAO.atendido;
  // Ordem encerrada não traz mais nada, mesmo com item sem nota vinculada.
  // Tem de bater com `paresACaminho`, que também as ignora.
  const faltando = encerrada
    ? 0
    : ordem.itens.reduce(
        (t, i) => t + Math.max(0, i.quantidade - i.recebido),
        0,
      );

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
        <h2 className="font-semibold">
          OC {ordem.numeroPedido ?? ordem.id}
        </h2>
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
          <Badge variant={faltando > 0 ? "secondary" : "outline"}>
            {faltando > 0
              ? `${faltando} a caminho`
              : (SITUACAO_ROTULO[ordem.situacao ?? ""] ?? "Sem saldo")}
          </Badge>
          {!encerrada && (
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
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Pedido</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="border-l px-3 py-2 text-right font-medium">
                A caminho
              </th>
            </tr>
          </thead>
          <tbody>
            {ordem.itens.map((item) => {
              const falta = encerrada
                ? 0
                : Math.max(0, item.quantidade - item.recebido);
              return (
                <tr key={item.produtoId} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    {item.cor && item.numeracao
                      ? `${item.cor} ${item.numeracao}`
                      : item.descricao}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {item.quantidade}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {item.recebido || "—"}
                  </td>
                  <td className="border-l px-3 py-1.5 text-right tabular-nums">
                    {falta || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{pedidos}</td>
              <td />
              <td className="border-l px-3 py-2 text-right tabular-nums">
                {faltando}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function OrdensPage() {
  const [ordens, setOrdens] = useState<OrdemCompra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const resposta = await fetch("/api/estoque/ordens");
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha na leitura.");
      setOrdens(corpo.ordens as OrdemCompra[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na leitura.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abertas = (ordens ?? []).filter(
    (o) =>
      o.situacao !== OC_SITUACAO.cancelado &&
      o.itens.some((i) => i.quantidade > i.recebido),
  );
  const encerradas = (ordens ?? []).filter((o) => !abertas.includes(o));

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
        As ordens ficam no Tiny. O recebimento vem da nota fiscal vinculada à
        ordem — não se lança aqui.
      </p>

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!ordens && !erro && <Skeleton className="h-64" />}

      {ordens && ordens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma ordem de compra no Tiny para este fornecedor.
        </p>
      )}

      {abertas.map((ordem) => (
        <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
      ))}

      {encerradas.length > 0 && (
        <>
          <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Encerradas
          </h2>
          {encerradas.map((ordem) => (
            <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
          ))}
        </>
      )}
    </div>
  );
}
