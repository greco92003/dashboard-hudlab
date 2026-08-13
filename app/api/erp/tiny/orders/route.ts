import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/security/route-guards";
import { createTinySalesOrder } from "@/lib/erp/tiny-order-v2";
import { extractGhlOrderSource, FREE_SAMPLE_NATURE, TINY_NATURE_OPTIONS } from "@/lib/erp/order-rules";
import { fetchCustomFieldDefs, fetchOpportunityById } from "@/lib/ghl/api";

const schema = z.object({
  dealId: z.string().min(1),
  tinyContactId: z.number().int().positive(),
  contributor: z.enum(["1", "2", "9"]),
  expectedPairs: z.number().positive().nullable(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  natureName: z.enum(TINY_NATURE_OPTIONS),
  freight: z.number().min(0),
  paymentForm: z.enum(["", "Pix", "Cartão de Crédito"]),
  paymentMedium: z.string().trim().max(100),
  bankAccount: z.string().trim().max(100),
  category: z.string().trim().max(50),
  dueDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  notes: z.string().max(500),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(50),
    description: z.string().trim().min(1).max(120),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
  })).min(1).max(100),
}).superRefine((data, context) => {
  if (data.natureName === FREE_SAMPLE_NATURE) return;
  if (data.expectedPairs === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedPairs"], message: "Quantidade obrigatória." });
  if (!data.paymentForm) context.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentForm"], message: "Forma obrigatória." });
  if (!data.paymentMedium) context.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentMedium"], message: "Meio obrigatório." });
  if (!data.bankAccount) context.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccount"], message: "Conta obrigatória." });
  if (!data.dueDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["dueDate"], message: "Vencimento obrigatório." });
  if (data.items.some((item) => item.unitPrice <= 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Preço obrigatório." });
});

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos obrigatórios do pedido." }, { status: 400 });
  }
  try {
    const [opportunity, definitions] = await Promise.all([
      fetchOpportunityById(parsed.data.dealId),
      fetchCustomFieldDefs("opportunity"),
    ]);
    const source = extractGhlOrderSource(opportunity, definitions);
    const isFreeSample = parsed.data.natureName === FREE_SAMPLE_NATURE;
    if (!isFreeSample && source.expectedPairs === null) {
      return NextResponse.json({ error: "A quantidade de pares não está preenchida no GHL." }, { status: 409 });
    }
    const totalPairs = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0);
    if (!isFreeSample && source.expectedPairs !== null && parsed.data.expectedPairs !== null && (Math.abs(totalPairs - source.expectedPairs) > 0.001 || Math.abs(parsed.data.expectedPairs - source.expectedPairs) > 0.001)) {
      return NextResponse.json({ error: `A soma dos itens (${totalPairs}) não confere com a quantidade atual do GHL (${source.expectedPairs}).` }, { status: 409 });
    }
    return NextResponse.json(await createTinySalesOrder(parsed.data));
  } catch (error) {
    console.error("ERP Tiny sales order creation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar pedido no Tiny." }, { status: 502 });
  }
}
