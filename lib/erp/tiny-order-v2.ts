import { getTinyV2Token } from "@/lib/tiny/auth";
import { normalizeCountryName, type ErpContactDraft } from "./contact-rules";
import { FREE_SAMPLE_NATURE } from "./order-rules";
import { getTinyContactById } from "./tiny-contact-v2";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";

type TinyOrderRecord = {
  id?: string | number;
  numero?: string | number;
  status?: string;
};

type TinyReturn = {
  status?: string;
  codigo_erro?: string | number;
  erros?: Array<{ erro?: string }>;
  registros?: Array<{ registro?: TinyOrderRecord }> | { registro?: TinyOrderRecord };
  pedidos?: Array<{ pedido?: { id?: string | number; numero?: string | number; numero_ecommerce?: string } }>;
};

async function post(path: string, params: Record<string, string>): Promise<TinyReturn> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ token: getTinyV2Token(), formato: "JSON", ...params }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tiny API v2 respondeu HTTP ${response.status}.`);
  const data = JSON.parse(text) as { retorno?: TinyReturn };
  if (!data.retorno) throw new Error("Resposta sem o campo retorno do Tiny.");
  return data.retorno;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function firstOrderRecord(registros: TinyReturn["registros"]): TinyOrderRecord | undefined {
  if (Array.isArray(registros)) return registros[0]?.registro;
  return registros?.registro;
}

async function findOrderByEcommerceNumber(ecommerceNumber: string) {
  const result = await post("/pedidos.pesquisa.php", { numeroEcommerce: ecommerceNumber });
  if (result.status === "OK") {
    return result.pedidos?.find(
      (entry) => entry.pedido?.numero_ecommerce === ecommerceNumber,
    )?.pedido ?? null;
  }
  if (String(result.codigo_erro ?? "") === "20") return null;
  throw new Error(
    result.erros?.map((item) => item.erro).filter(Boolean).join("; ")
      || "Falha ao verificar pedido duplicado no Tiny.",
  );
}

function tinyCustomer(contact: ErpContactDraft) {
  return {
    nome: contact.name.slice(0, 30),
    nome_fantasia: contact.fantasy,
    tipo_pessoa: contact.personType,
    cpf_cnpj: contact.document,
    ie: contact.stateRegistration,
    endereco: contact.address,
    numero: contact.number,
    complemento: contact.complement,
    bairro: contact.neighborhood,
    cep: contact.postalCode,
    cidade: contact.city,
    uf: contact.state,
    pais: normalizeCountryName(contact.country),
    fone: contact.phone,
    email: contact.email,
    atualizar_cliente: "N",
  };
}

export type TinySalesOrderInput = {
  dealId: string;
  tinyContactId: number;
  orderDate: string;
  expectedDeliveryDate: string;
  natureName: string;
  freight: number;
  paymentForm: string;
  paymentMedium: string;
  bankAccount: string;
  category: string;
  dueDate: string;
  notes: string;
  items: Array<{ sku: string; description: string; quantity: number; unitPrice: number }>;
};

export async function createTinySalesOrder(input: TinySalesOrderInput) {
  const ecommerceNumber = `GHL-${input.dealId}`;
  const duplicate = await findOrderByEcommerceNumber(ecommerceNumber);
  if (duplicate?.id) {
    return { id: Number(duplicate.id), number: String(duplicate.numero ?? ""), existing: true };
  }

  const contact = await getTinyContactById(input.tinyContactId, "");
  const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) + input.freight;
  const account = input.bankAccount.trim() || input.paymentMedium.trim();
  const isFreeSample = input.natureName === FREE_SAMPLE_NATURE;
  const order = {
    data_pedido: brDate(input.orderDate),
    data_prevista: brDate(input.expectedDeliveryDate),
    cliente: tinyCustomer(contact),
    itens: input.items.map((item) => ({ item: {
      codigo: item.sku,
      descricao: item.description,
      unidade: "PR",
      quantidade: item.quantity.toFixed(2),
      valor_unitario: item.unitPrice.toFixed(2),
    } })),
    ...(!isFreeSample ? { forma_pagamento: input.paymentForm, meio_pagamento: account, parcelas: [{ parcela: {
      data: brDate(input.dueDate),
      valor: total.toFixed(2),
      destino: "Contas a Receber",
      forma_pagamento: input.paymentForm,
      meio_pagamento: account,
      obs: input.category ? `Categoria: ${input.category}`.slice(0, 100) : "",
    } }] } : {}),
    nome_natureza_operacao: input.natureName,
    ...(input.freight > 0 ? { frete_por_conta: "R" } : {}),
    valor_frete: input.freight.toFixed(2),
    numero_pedido_ecommerce: ecommerceNumber,
    situacao: "Aberto",
    obs: input.notes,
  };
  const result = await post("/pedido.incluir.php", { pedido: JSON.stringify({ pedido: order }) });
  if (result.status !== "OK") {
    throw new Error(result.erros?.map((item) => item.erro).filter(Boolean).join("; ") || "O Tiny recusou o pedido de venda.");
  }
  const created = firstOrderRecord(result.registros);
  if (!created?.id) {
    const recovered = await findOrderByEcommerceNumber(ecommerceNumber);
    if (recovered?.id) {
      return { id: Number(recovered.id), number: String(recovered.numero ?? ""), existing: false };
    }
    throw new Error("O Tiny aceitou o pedido, mas ele ainda não apareceu na consulta. Aguarde alguns segundos e tente novamente; o identificador do deal impedirá duplicação.");
  }
  return { id: Number(created.id), number: String(created.numero ?? ""), existing: false };
}
