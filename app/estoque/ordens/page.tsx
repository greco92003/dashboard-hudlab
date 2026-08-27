"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertCircle, ArrowLeft, Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import type { OrdemCompra } from "@/lib/estoque/ordem-compra";
import { NovaOrdemDialog } from "@/components/estoque/nova-ordem-dialog";

const data = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function CardOrdem({
  ordem,
  onMudou,
}: {
  ordem: OrdemCompra;
  onMudou: () => void;
}) {
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const pedidos = ordem.itens.reduce((t, i) => t + i.paresPedidos, 0);
  const recebidos = ordem.itens.reduce((t, i) => t + i.paresRecebidos, 0);
  const faltando = pedidos - recebidos;

  const alterados = useMemo(
    () =>
      ordem.itens.flatMap((item) => {
        const bruto = rascunho[item.id];
        if (bruto === undefined || bruto === "") return [];
        const valor = Number(bruto);
        if (!Number.isInteger(valor) || valor < 0) return [];
        if (valor === item.paresRecebidos) return [];
        return [{ itemId: item.id, paresRecebidos: valor }];
      }),
    [ordem.itens, rascunho],
  );

  const salvar = async () => {
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/estoque/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recebimentos: alterados }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha ao salvar.");
      toast.success("Recebimento registrado.");
      setRascunho({});
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async () => {
    if (!confirm(`Cancelar a ordem ${ordem.numero ?? "sem número"}?`)) return;
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/estoque/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelar: true }),
      });
      if (!resposta.ok) throw new Error("Falha ao cancelar.");
      toast.success("Ordem cancelada.");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
        <h2 className="font-semibold">
          {ordem.numero ? `OC ${ordem.numero}` : "OC sem número"}
        </h2>
        <span className="text-sm text-muted-foreground">
          {ordem.fornecedor}
        </span>
        <span className="text-sm text-muted-foreground">
          emitida {data(ordem.emitidaEm)} · prevista{" "}
          {data(ordem.previstaPara)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {faltando > 0 ? (
            <Badge variant="secondary">{faltando} pares a caminho</Badge>
          ) : (
            <Badge variant="outline">Recebida</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelar}
            disabled={salvando}
          >
            Cancelar
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Pedido</th>
              <th className="px-3 py-2 text-right font-medium">Falta</th>
              <th className="border-l px-3 py-2 text-right font-medium">
                Recebido
              </th>
            </tr>
          </thead>
          <tbody>
            {ordem.itens.map((item) => {
              const falta = item.paresPedidos - item.paresRecebidos;
              return (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    {item.cor} {item.numeracao}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {item.paresPedidos}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {falta || "—"}
                  </td>
                  <td className="border-l px-3 py-1.5 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={item.paresPedidos}
                      className="ml-auto h-8 w-24 text-right tabular-nums"
                      value={rascunho[item.id] ?? String(item.paresRecebidos)}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {alterados.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRascunho({})}
            disabled={salvando}
          >
            Descartar
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            Salvar {alterados.length}{" "}
            {alterados.length === 1 ? "alteração" : "alterações"}
          </Button>
        </div>
      )}
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

  const emAberto = (ordens ?? []).filter((o) =>
    o.itens.some((i) => i.paresPedidos > i.paresRecebidos),
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

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!ordens && !erro && <Skeleton className="h-64" />}

      {ordens && ordens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma ordem de compra aberta. A sugestão de compra fica na tela de{" "}
          <Link href="/estoque" className="underline">
            estoque
          </Link>
          .
        </p>
      )}

      {emAberto.map((ordem) => (
        <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
      ))}

      {ordens && ordens.length > emAberto.length && (
        <>
          <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recebidas
          </h2>
          {ordens
            .filter((o) => !emAberto.includes(o))
            .map((ordem) => (
              <CardOrdem key={ordem.id} ordem={ordem} onMudou={carregar} />
            ))}
        </>
      )}
    </div>
  );
}
