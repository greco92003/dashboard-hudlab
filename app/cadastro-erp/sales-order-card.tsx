"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ReceiptText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ErpContactDraft } from "@/lib/erp/contact-rules";
import { FREE_SAMPLE_NATURE, natureName, TINY_NATURE_OPTIONS } from "@/lib/erp/order-rules";
import { buildVariationSku } from "@/lib/erp/product-rules";
import type { ErpDealProductPreview } from "@/lib/erp/types";

type Mapping = { title: string; baseSku: string; variationSkus?: Record<string, string> };
type Item = { sku: string; description: string; quantity: number; unitPrice: number };
type PaymentForm = "Pix" | "Cartão de Crédito" | "";

type Props = {
  preview: ErpDealProductPreview;
  mappings: Record<number, Mapping>;
  tinyContactId: number;
  contact: ErpContactDraft;
};

async function postOrder(body: unknown) {
  const response = await fetch("/api/erp/tiny/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Falha ao criar pedido.");
  return data as { id: number; number: string; existing: boolean };
}

function today() { return new Date().toISOString().slice(0, 10); }

export function SalesOrderCard({ preview, mappings, tinyContactId, contact }: Props) {
  const initialItems = useMemo<Item[]>(() => preview.models.flatMap((model) => {
    const mapping = mappings[model.modelNumber];
    return model.grades.map((grade) => ({
      sku: mapping.variationSkus?.[grade.size] || buildVariationSku(mapping.baseSku, grade.size),
      description: `${mapping.title} - ${grade.size}`.slice(0, 120),
      quantity: grade.quantity,
      unitPrice: preview.order.unitPrice ?? 0,
    }));
  }), [preview, mappings]);
  const initialContributor = contact.contributor !== "0" ? contact.contributor : contact.personType === "F" ? "9" : "0";
  const [items, setItems] = useState(initialItems);
  const [contributor, setContributor] = useState(initialContributor);
  const [nature, setNature] = useState(natureName(contact.state));
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [freight, setFreight] = useState(preview.order.customerFreight ?? 0);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(preview.order.paymentKind === "pix" ? "Pix" : preview.order.paymentKind === "credit_card" ? "Cartão de Crédito" : "");
  const [paymentMedium, setPaymentMedium] = useState("Banco");
  const [bankAccount, setBankAccount] = useState(preview.order.paymentKind === "credit_card" ? "Sicredi - PJ" : "Sicredi");
  const [category, setCategory] = useState("Venda de Slides");
  const [dueDate, setDueDate] = useState(preview.order.dueDate ?? "");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ id: number; number: string; existing: boolean } | null>(null);

  const itemPairs = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const expectedPairs = preview.order.expectedPairs;
  const pairsMatch = expectedPairs !== null && Math.abs(itemPairs - expectedPairs) < 0.001;
  const isFreeSample = nature === FREE_SAMPLE_NATURE;
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) + freight;
  const problems = [
    contributor === "0" ? "Confirme se o cliente é contribuinte." : "",
    !nature.trim() ? "Informe a natureza da operação." : "",
    !expectedDeliveryDate ? "Informe a data prevista de entrega." : "",
    !isFreeSample && expectedPairs === null ? "Quantidade de pares não encontrada no GHL." : !isFreeSample && !pairsMatch ? `A grade soma ${itemPairs}, mas o GHL informa ${expectedPairs}.` : "",
    !isFreeSample && !paymentForm.trim() ? "Forma de recebimento não encontrada." : "",
    !isFreeSample && paymentForm && !dueDate ? paymentForm === "Pix" ? "Informe manualmente o vencimento do Pix." : "Informe o vencimento do cartão." : "",
    items.some((item) => !item.sku.trim() || !item.description.trim() || item.quantity <= 0 || item.unitPrice < 0 || (!isFreeSample && item.unitPrice <= 0)) ? isFreeSample ? "Revise os itens; a quantidade deve ser positiva e o valor não pode ser negativo." : "Revise os itens e confirme que todos possuem preço unitário." : "",
  ].filter(Boolean);
  const warnings = isFreeSample && !pairsMatch
    ? [expectedPairs === null ? "A quantidade do GHL não foi encontrada. Para amostra grátis, isso não impede a criação." : `A grade soma ${itemPairs}, mas o GHL informa ${expectedPairs}. Em amostra grátis, a divergência é permitida porque o envio pode conter apenas um pé.`]
    : [];

  const updateItem = (index: number, patch: Partial<Item>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updatePaymentForm = (value: PaymentForm) => {
    setPaymentForm(value);
    setPaymentMedium("Banco");
    setBankAccount(value === "Cartão de Crédito" ? "Sicredi - PJ" : "Sicredi");
    if (value === "Pix") setDueDate("");
  };
  const submit = async () => {
    if (problems.length || saving || (!isFreeSample && expectedPairs === null)) return;
    setSaving(true);
    setConfirmOpen(false);
    try {
      const created = await postOrder({ dealId: preview.deal.id, tinyContactId, contributor, expectedPairs, orderDate, expectedDeliveryDate, natureName: nature, freight, paymentForm: isFreeSample ? "" : paymentForm, paymentMedium: isFreeSample ? "" : paymentMedium, bankAccount: isFreeSample ? "" : bankAccount, category: isFreeSample ? "" : category, dueDate: isFreeSample ? "" : dueDate, notes, items });
      setResult(created);
      toast.success(created.existing ? `Pedido já existente no Tiny (ID ${created.id}).` : `Pedido ${created.number || created.id} criado no Tiny.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar pedido no Tiny.", { duration: 8000 });
    } finally { setSaving(false); }
  };

  return <>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-base"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">5</span>Pedido de venda</CardTitle><CardDescription className="mt-1">Revise itens, natureza, frete e recebimento antes do envio real.</CardDescription></div>
          <Badge variant={problems.length ? "secondary" : "default"}>{problems.length ? <TriangleAlert /> : <CheckCircle2 />}{problems.length ? `${problems.length} pendência(s)` : "Pronto para criar"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Contribuinte"><Select value={contributor} onValueChange={setContributor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Confirmar situação</SelectItem><SelectItem value="1">1 - Contribuinte ICMS</SelectItem><SelectItem value="2">2 - Contribuinte isento</SelectItem><SelectItem value="9">9 - Não contribuinte</SelectItem></SelectContent></Select></Field>
          <Field label="UF do cliente"><Input value={contact.state} readOnly /></Field>
          <Field label="Natureza da operação" className="md:col-span-2"><Select value={nature} onValueChange={(value) => setNature(value as (typeof TINY_NATURE_OPTIONS)[number])}><SelectTrigger><SelectValue placeholder="Selecione uma natureza cadastrada" /></SelectTrigger><SelectContent>{TINY_NATURE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Data do pedido"><Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></Field>
          <Field label="Data prevista de entrega"><Input type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} /></Field>
          <Field label="Frete pago pelo cliente"><Input type="number" min="0" step="0.01" value={freight} onChange={(event) => setFreight(Number(event.target.value))} /></Field>
          <Field label="Quantidade no GHL"><Input value={expectedPairs ?? "Não encontrada"} readOnly /></Field>
          <Field label="Soma da grade"><Input value={itemPairs} readOnly className={pairsMatch ? "border-emerald-500" : isFreeSample ? "border-amber-500" : "border-destructive"} /></Field>
        </div>

        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-3">SKU</th><th className="p-3">Descrição</th><th className="w-28 p-3">Qtd.</th><th className="w-36 p-3">Preço un.</th><th className="w-32 p-3 text-right">Subtotal</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.sku}-${index}`} className="border-t"><td className="p-2"><Input value={item.sku} onChange={(event) => updateItem(index, { sku: event.target.value })} /></td><td className="p-2"><Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></td><td className="p-2"><Input type="number" min="0" step="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} /></td><td className="p-2"><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} /></td><td className="p-3 text-right">{(item.quantity * item.unitPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td></tr>)}</tbody></table></div>

        {!isFreeSample ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Forma de recebimento">
            <Select value={paymentForm} onValueChange={(value) => updatePaymentForm(value as PaymentForm)}>
              <SelectTrigger><SelectValue placeholder="Selecione a forma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {paymentForm && <>
            <Field label="Meio"><Input value={paymentMedium} onChange={(event) => setPaymentMedium(event.target.value)} /></Field>
            <Field label="Conta bancária"><Input value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} /></Field>
            <Field label="Categoria"><Input value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
            <Field label={paymentForm === "Pix" ? "Vencimento do Pix" : "Vencimento do cartão"}><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
          </>}
          <Field label="Observações" className="md:col-span-2 lg:col-span-3"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        </div> : <div className="grid gap-4 md:grid-cols-4"><div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm md:col-span-4">Amostra grátis: forma de recebimento e parcela não serão enviadas ao Tiny.</div><Field label="Observações" className="md:col-span-4"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>}
        {!isFreeSample && <p className="text-xs text-muted-foreground">Na API pública do Tiny, a conta bancária é enviada em “meio de pagamento”. Como o pedido não possui um campo próprio de categoria financeira, a categoria é registrada na observação da parcela.</p>}
        {warnings.length > 0 && <ul className="list-inside list-disc rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {problems.length > 0 && <ul className="list-inside list-disc rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        <div className="flex flex-col justify-between gap-3 rounded-lg bg-muted/30 p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">Total: {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{result && <p className="text-xs text-emerald-600">Pedido {result.number || result.id} confirmado no Tiny.</p>}</div><Button disabled={problems.length > 0 || saving || Boolean(result)} onClick={() => setConfirmOpen(true)}>{saving ? <Loader2 className="animate-spin" /> : <ReceiptText />}{saving ? "Criando…" : "Criar pedido de venda"}</Button></div>
      </CardContent>
    </Card>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar pedido real no Tiny?</AlertDialogTitle><AlertDialogDescription>Será criado um pedido para {contact.name}, com {itemPairs} {isFreeSample ? "unidade(s) de amostra" : "pares"} e total de {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. O identificador do deal impedirá duplicação em uma nova tentativa.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar e revisar</AlertDialogCancel><AlertDialogAction onClick={() => void submit()}>Confirmar criação</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>; }
