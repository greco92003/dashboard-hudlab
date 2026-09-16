"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, ReceiptText, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TinyOrderSummary } from "@/lib/erp/tiny-order-documents";
import { OrderDocumentButtons } from "@/components/erp/order-document-buttons";
import { ProductionLabelsButton } from "@/components/erp/production-labels-button";

type OrdersResponse = { orders: TinyOrderSummary[]; page: number; pageSize: number; total: number };

export default function PedidosErpPage() {
  const [{ page, q }, setQuery] = useQueryStates(
    { page: parseAsInteger.withDefault(1), q: parseAsString.withDefault("") },
    { history: "push" },
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/erp/tiny/orders?${new URLSearchParams({ page: String(page), q })}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao carregar pedidos.");
        if (active) setData(body as OrdersResponse);
      })
      .catch((error) => active && toast.error(error instanceof Error ? error.message : "Falha ao carregar pedidos."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, q]);

  useEffect(() => setSearchDraft(q), [q]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void setQuery({ q: searchDraft.trim() || null, page: null });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <ReceiptText className="h-4 w-4" /> ERP · Pedidos do Tiny
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gere o talão de produção, o romaneio de despacho e as etiquetas de cada pedido.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cadastro-erp"><ArrowLeft /> Voltar ao cadastro</Link>
        </Button>
      </div>

      <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Nome do cliente ou número do pedido"
          aria-label="Buscar pedidos"
          className="sm:max-w-md"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}><Search /> Buscar</Button>
          {q && (
            <Button type="button" variant="ghost" onClick={() => void setQuery({ q: null, page: null })}><X /> Limpar</Button>
          )}
        </div>
      </form>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" /> Carregando pedidos…</div>
          ) : (
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 pl-6">Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                    <TableHead className="pr-6"><span className="sr-only">Documentos</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-6">{order.number}</TableCell>
                      <TableCell className="max-w-md truncate">{order.customer}</TableCell>
                      <TableCell>{order.status}</TableCell>
                      <TableCell className="whitespace-nowrap pr-6"><OrderDocumentButtons baseHref={`/api/erp/tiny/orders/${order.id}`}><ProductionLabelsButton href={`/api/erp/tiny/orders/${order.id}/etiquetas`} /></OrderDocumentButtons></TableCell>
                    </TableRow>
                  ))}
                  {data && data.orders.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{q ? `Nenhum pedido encontrado para “${q}”.` : "Nenhum pedido encontrado."}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{data.total} pedido(s) · página {page} de {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => void setQuery({ page: page - 1 })}><ChevronLeft /> Anterior</Button>
            <Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => void setQuery({ page: page + 1 })}>Próxima <ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
