/**
 * Leva o rascunho da Cami para o formulário do cadastro de pedido. Módulo puro.
 *
 * Preenche tudo que a Cami achou e deixa o resto como está: data de embarque e
 * transportadora continuam com o vendedor. Os modelos só são trocados quando a
 * Cami achou grade; o vendedor confere e salva, com as validações de sempre.
 */
import {
  blankOrderRegistrationModel,
  type OrderRegistrationConfig,
  type OrderRegistrationDraft,
} from "@/lib/ghl/order-registration-shared";
import type { FichaRascunho } from "@/lib/ghl/ficha-pedido/regras";

export interface ResultadoAplicacao {
  draft: OrderRegistrationDraft;
  /** O que a Cami preencheu, em palavras, para o aviso da tela. */
  preenchidos: string[];
  /** O que não coube no formulário (ex.: mais modelos do que o GHL tem). */
  ignorados: string[];
}

const texto = (n: number | null) => (n === null ? null : String(n));

export function fichaSemGrade(draft: OrderRegistrationDraft): boolean {
  return draft.models.every(
    (m) =>
      !m.artUrl.trim() &&
      !m.soleColor.trim() &&
      [...Object.values(m.adultGrade), ...Object.values(m.childGrade)].every((q) => !String(q).trim() || Number(q) === 0),
  );
}

export function aplicarRascunhoNoFormulario(
  atual: OrderRegistrationDraft,
  rascunho: FichaRascunho,
  config: OrderRegistrationConfig,
): ResultadoAplicacao {
  const draft: OrderRegistrationDraft = { ...atual };
  const preenchidos: string[] = [];
  const ignorados: string[] = [];

  const comGrade = rascunho.modelos.filter(
    (m) => Object.keys(m.adultGrade).length + Object.keys(m.childGrade).length > 0,
  );
  if (comGrade.length > 0) {
    const modelos: OrderRegistrationDraft["models"] = [];
    rascunho.modelos.forEach((m, i) => {
      const definicao = config.modelDefinitions.find((d) => d.modelNumber === i + 1);
      if (!definicao) {
        ignorados.push(`Modelo ${i + 1}: o GHL não tem campos para tantos modelos.`);
        return;
      }
      const base = blankOrderRegistrationModel(definicao);
      const adulto = Object.fromEntries(
        definicao.adultOptions.map((op) => [op.id, m.adultGrade[op.label] ? String(m.adultGrade[op.label]) : ""]),
      );
      const infantil = Object.fromEntries(
        definicao.childOptions.map((op) => [op.id, m.childGrade[op.label] ? String(m.childGrade[op.label]) : ""]),
      );
      const foraDaGrade = [
        ...Object.keys(m.adultGrade).filter((t) => !definicao.adultOptions.some((op) => op.label === t)),
        ...Object.keys(m.childGrade).filter((t) => !definicao.childOptions.some((op) => op.label === t)),
      ];
      if (foraDaGrade.length) ignorados.push(`Modelo ${i + 1}: numeração ${foraDaGrade.join(", ")} não existe no GHL.`);
      modelos.push({
        ...base,
        soleColor: m.soleColor && definicao.soleOptions.includes(m.soleColor) ? m.soleColor : "",
        artUrl: m.artUrl ?? "",
        adultGrade: adulto,
        childGrade: infantil,
        hasChild: Object.values(infantil).some((q) => Number(q) > 0),
      });
    });
    if (modelos.length > 0) {
      draft.models = modelos;
      const comSolado = modelos.filter((m) => m.soleColor).length;
      const comArte = modelos.filter((m) => m.artUrl).length;
      preenchidos.push(
        `Grade de ${modelos.length} modelo(s)`,
        ...(comSolado ? [`Solado de ${comSolado} modelo(s)`] : []),
        ...(comArte ? [`Arte aprovada de ${comArte} modelo(s)`] : []),
      );
    }
  }

  const numeros: [keyof OrderRegistrationDraft, number | null, string][] = [
    ["quantityPairs", rascunho.quantityPairs, "Pares"],
    ["unitPrice", rascunho.unitPrice, "Preço do par"],
    ["monetaryValue", rascunho.monetaryValue, "Valor do pedido"],
  ];
  for (const [campo, valor, rotulo] of numeros) {
    const v = texto(valor);
    if (v === null) continue;
    (draft as Record<string, unknown>)[campo] = v;
    preenchidos.push(rotulo);
  }

  if (rascunho.orderType && config.orderTypes.includes(rascunho.orderType)) {
    draft.orderType = rascunho.orderType;
    preenchidos.push("Tipo do pedido");
  }
  if (rascunho.freightCondition && config.freightConditions.includes(rascunho.freightCondition)) {
    draft.freightCondition = rascunho.freightCondition;
    preenchidos.push("Condição de frete");
    if (rascunho.freightClientValue !== null && !/empresa/i.test(rascunho.freightCondition)) {
      draft.freightClientValue = String(rascunho.freightClientValue);
      preenchidos.push("Frete do cliente");
    }
  }
  if (rascunho.paymentForm && config.paymentForms.includes(rascunho.paymentForm)) {
    draft.paymentForm = rascunho.paymentForm;
    preenchidos.push("Forma de pagamento");
    if (/cartão/i.test(rascunho.paymentForm)) {
      if (rascunho.cardBrand && config.cardBrands.includes(rascunho.cardBrand)) {
        draft.cardBrand = rascunho.cardBrand;
        preenchidos.push("Bandeira");
      }
      if (rascunho.cardInstallments) {
        draft.cardInstallments = String(rascunho.cardInstallments);
        preenchidos.push("Parcelas");
      }
      if (rascunho.cardSaleDate) {
        draft.cardSaleDate = rascunho.cardSaleDate;
        preenchidos.push("Data da venda no cartão");
      }
    }
  }

  return { draft, preenchidos, ignorados };
}
