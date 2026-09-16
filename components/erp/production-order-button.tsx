"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Factory, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductionOrderPreview, ProductionOrderRecord } from "@/lib/erp/tiny-production-order";
import { cn } from "@/lib/utils";

type Props = {
  orderId: number;
  size?: "sm" | "default";
  className?: string;
};

async function readJson<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Falha na comunicação com o Tiny.");
  return body as T;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatQuantity(value: number | null) {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function ProductionOrderButton({ orderId, size = "sm", className }: Props) {
  const base = `/api/erp/tiny/orders/${orderId}/ordem-producao`;
  const [record, setRecord] = useState<ProductionOrderRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ProductionOrderPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${base}?registro=1`, { cache: "no-store" })
      .then((response) => readJson<{ record: ProductionOrderRecord | null }>(response))
      .then((body) => active && setRecord(body.record))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [base]);

  const load = useCallback(async () => {
    setLoading(true);
    setPreview(null);
    try {
      const body = await readJson<ProductionOrderPreview>(await fetch(base, { cache: "no-store" }));
      setPreview(body);
      setRecord(body.record);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o pedido.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [base]);

  const openDialog = () => {
    setOpen(true);
    setConfirmAgain(false);
    setSaveFailed(false);
    void load();
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const body = await readJson<ProductionOrderPreview & { saved: boolean }>(await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(record) }),
      }));
      setPreview((current) => current ? { ...current, record: body.record } : body);
      setRecord(body.record);
      setSaveFailed(!body.saved);
      setConfirmAgain(false);
      if (body.record?.ok) toast.success("Ordem de produção gerada e conferida.");
      else toast.error("Ordem de produção gerada com divergência de quantidade.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a ordem de produção.");
    } finally {
      setGenerating(false);
    }
  };

  const hasStock = preview?.items.some((item) => (item.available ?? 0) > 0) ?? false;
  const showResult = Boolean(preview?.record);
  const buttonLabel = record ? `OP gerada em ${formatDate(record.generatedAt)}` : "Gerar ordem de produção";
  const canGenerate = Boolean(preview) && !generating && (!record || confirmAgain);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        onClick={openDialog}
        title={buttonLabel}
        aria-label={buttonLabel}
        className={cn(
          record && !record.ok
            ? "border-red-600/60 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-500/10"
            : "border-amber-600/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10",
          className,
        )}
      >
        {record ? (record.ok ? <CheckCircle2 /> : <TriangleAlert />) : <Factory />}
        <span className="hidden lg:inline">{buttonLabel}</span>
      </Button>

      <Dialog open={open} onOpenChange={(value) => !generating && setOpen(value)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ordem de produção{preview ? ` · pedido ${preview.orderNumber}` : ""}</DialogTitle>
            <DialogDescription>
              {preview ? `${preview.customer}. ` : ""}A quantidade a produzir precisa ser igual à quantidade vendida.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" /> Consultando pedido e estoque no Tiny…
            </div>
          )}

          {preview && showResult && preview.record && (
            <ResultPanel record={preview.record} orderNumber={preview.orderNumber} tinyUrl={preview.tinyUrl} />
          )}
          {saveFailed && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              A OP foi gerada no Tiny, mas o registro no dashboard falhou. Não gere de novo: confira no Tiny.
            </p>
          )}

          {preview && !showResult && (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-20 text-right">Vendido</TableHead>
                      <TableHead className="w-24 text-right">Estoque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.items.map((item, index) => (
                      <TableRow key={`${item.sku}-${index}`} className={(item.available ?? 0) > 0 ? "bg-amber-500/10" : undefined}>
                        <TableCell className="whitespace-normal text-xs">{item.description}</TableCell>
                        <TableCell className="text-right font-medium">{formatQuantity(item.quantity)}</TableCell>
                        <TableCell className="text-right">{formatQuantity(item.available)}</TableCell>
                      </TableRow>
                    ))}
                    {preview.items.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Pedido sem itens para produzir.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {hasStock && (
                <p className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  Há produto com estoque disponível. O Tiny pode gerar a OP com menos pares que o vendido. A conferência depois da geração vai mostrar.
                </p>
              )}
            </>
          )}

          {preview && record && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-3">
              <Checkbox id={`op-again-${orderId}`} checked={confirmAgain} onCheckedChange={(value) => setConfirmAgain(value === true)} />
              <Label htmlFor={`op-again-${orderId}`} className="text-xs font-normal">
                Já existe OP gerada para este pedido. Quero gerar outra mesmo assim (vai duplicar no Tiny).
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={generating} onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="button" disabled={!canGenerate || preview?.items.length === 0} onClick={() => void generate()}>
              {generating ? <Loader2 className="animate-spin" /> : <Factory />}
              {generating ? "Gerando…" : record ? "Gerar novamente" : "Gerar ordem de produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultPanel({ record, orderNumber, tinyUrl }: { record: ProductionOrderRecord; orderNumber: string; tinyUrl: string }) {
  if (record.ok) {
    return (
      <div className="flex gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">OP gerada e conferida: quantidade a produzir igual à vendida.</p>
          <p className="text-xs opacity-80">{formatDate(record.generatedAt)}{record.generatedBy ? ` · ${record.generatedBy}` : ""}</p>
        </div>
      </div>
    );
  }

  const divergent = record.check.lines.filter((line) => !line.ok);
  return (
    <div className="space-y-3 rounded-lg border border-red-600/50 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
      <div className="flex gap-2">
        <TriangleAlert className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Quantidade a produzir diferente da vendida.</p>
          <p className="text-xs opacity-80">
            Corrija a OP no Tiny (filtre pelo pedido {orderNumber}). {formatDate(record.generatedAt)}{record.generatedBy ? ` · ${record.generatedBy}` : ""}
          </p>
        </div>
      </div>
      {divergent.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-red-600/30 bg-background text-foreground">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-20 text-right">Vendido</TableHead>
                <TableHead className="w-20 text-right">Gerado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divergent.map((line, index) => (
                <TableRow key={`${line.sku}-${index}`}>
                  <TableCell className="whitespace-normal text-xs">
                    {line.description || line.sku}
                    {line.message && <span className="block text-muted-foreground">{line.message}</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatQuantity(line.sold)}</TableCell>
                  <TableCell className="text-right font-medium text-red-700 dark:text-red-300">{formatQuantity(line.generated)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-xs">O Tiny não devolveu os itens gerados, então não deu para conferir. Confira a OP no Tiny.</p>
      )}
      {record.tinyMessage && <p className="text-xs">Tiny: {record.tinyMessage}</p>}
      <Button asChild size="sm" variant="destructive">
        <a href={tinyUrl} target="_blank" rel="noreferrer"><ExternalLink /> Corrigir no Tiny</a>
      </Button>
    </div>
  );
}
