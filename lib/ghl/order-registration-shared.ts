import { z } from "zod";

export const ORDER_REGISTRATION_PIPELINE_NAME = "Atendimento";
export const ORDER_REGISTRATION_STAGE_NAME =
  "Conferir Pgto/Completar Dados";
export const ORDER_REGISTRATION_MAX_MODELS = 10;
export const ORDER_REGISTRATION_MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ORDER_REGISTRATION_ACCEPTED_FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/jpeg",
  "image/png",
  "image/gif",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "video/mp4",
  "video/mpeg",
  "application/zip",
  "application/x-rar-compressed",
  "text/plain",
  "image/svg+xml",
]);

export type OrderRegistrationOption = {
  id: string;
  label: string;
};

export type OrderRegistrationModelDefinition = {
  modelNumber: number;
  adultOptions: OrderRegistrationOption[];
  childOptions: OrderRegistrationOption[];
};

export type OrderRegistrationConfig = {
  pipelineName: string;
  stageName: string;
  orderTypes: string[];
  freightConditions: string[];
  paymentForms: string[];
  cardBrands: string[];
  maxPaymentProofs: number;
  modelDefinitions: OrderRegistrationModelDefinition[];
};

export type OrderRegistrationPaymentProof = {
  url: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

export type OrderRegistrationModelValue = {
  modelNumber: number;
  artUrl: string;
  adultGrade: Record<string, string>;
  hasChild: boolean;
  childGrade: Record<string, string>;
};

export type OrderRegistrationOpportunity = {
  id: string;
  name: string;
  monetaryValue: number | null;
  source: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contact: {
    id: string | null;
    name: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
  };
  orderType: string;
  embarkDate: string;
  designer: string;
  quantityPairs: number | null;
  unitPrice: number | null;
  freightCondition: string;
  freightCompanyValue: number | null;
  freightClientValue: number | null;
  carrier: string;
  paymentForm: string;
  cardBrand: string;
  cardInstallments: number | null;
  cardSaleDate: string;
  paymentProofs: OrderRegistrationPaymentProof[];
  models: OrderRegistrationModelValue[];
};

export type OrderRegistrationResponse = {
  opportunities: OrderRegistrationOpportunity[];
  config: OrderRegistrationConfig;
  fetchedAt: string;
};

const gradeSchema = z.record(z.string(), z.string().max(12));

export const orderRegistrationDraftSchema = z.object({
  updatedAt: z.string().nullable(),
  monetaryValue: z.string().trim(),
  orderType: z.string().trim(),
  embarkDate: z.string().trim(),
  designer: z.string().trim(),
  models: z
    .array(
      z.object({
        modelNumber: z.number().int().min(1).max(ORDER_REGISTRATION_MAX_MODELS),
        artUrl: z.string().trim().max(2_000),
        adultGrade: gradeSchema,
        hasChild: z.boolean(),
        childGrade: gradeSchema,
      }),
    )
    .min(1)
    .max(ORDER_REGISTRATION_MAX_MODELS),
  quantityPairs: z.string().trim(),
  unitPrice: z.string().trim(),
  freightCondition: z.string().trim(),
  freightCompanyValue: z.string().trim(),
  freightClientValue: z.string().trim(),
  carrier: z.string().trim(),
  paymentForm: z.string().trim(),
  cardBrand: z.string().trim(),
  cardInstallments: z.string().trim(),
  cardSaleDate: z.string().trim(),
});

export type OrderRegistrationDraft = z.infer<
  typeof orderRegistrationDraftSchema
>;

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseRequiredNumber(
  value: string,
  label: string,
  issues: string[],
  options: { integer?: boolean; allowZero?: boolean } = {},
): number | null {
  if (!value.trim()) {
    issues.push(`${label} é obrigatório.`);
    return null;
  }
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number)) {
    issues.push(`${label} deve ser um número válido.`);
    return null;
  }
  if (options.integer && !Number.isInteger(number)) {
    issues.push(`${label} deve ser um número inteiro.`);
    return null;
  }
  if (options.allowZero ? number < 0 : number <= 0) {
    issues.push(
      `${label} deve ser ${options.allowZero ? "zero ou maior" : "maior que zero"}.`,
    );
    return null;
  }
  return number;
}

function gradeTotal(
  values: Record<string, string>,
  allowedOptions: OrderRegistrationOption[],
  label: string,
  issues: string[],
): number {
  const allowedIds = new Set(allowedOptions.map((option) => option.id));
  let total = 0;
  for (const [optionId, rawValue] of Object.entries(values)) {
    if (!allowedIds.has(optionId)) {
      issues.push(`${label} contém uma numeração inválida.`);
      continue;
    }
    if (!rawValue.trim()) continue;
    const quantity = Number(rawValue);
    if (!Number.isInteger(quantity) || quantity < 0) {
      issues.push(`${label} deve conter apenas quantidades inteiras positivas.`);
      continue;
    }
    total += quantity;
  }
  return total;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateOrderRegistrationDraft(
  draft: OrderRegistrationDraft,
  config: OrderRegistrationConfig,
  paymentProofCount: number,
): string[] {
  const issues: string[] = [];
  if (!config.orderTypes.includes(draft.orderType)) {
    issues.push("Selecione um tipo de pedido válido.");
  }
  if (!isValidDateInput(draft.embarkDate)) {
    issues.push("Informe uma data de embarque válida.");
  }
  if (!draft.designer) issues.push("Designer responsável é obrigatório.");

  const monetaryValue = parseRequiredNumber(
    draft.monetaryValue,
    "Valor do pedido",
    issues,
  );
  const quantityPairs = parseRequiredNumber(
    draft.quantityPairs,
    "Quantidade de pares",
    issues,
    { integer: true },
  );
  const unitPrice = parseRequiredNumber(
    draft.unitPrice,
    "Valor unitário do par",
    issues,
  );

  const expectedModelNumbers = draft.models.map((_, index) => index + 1);
  if (
    draft.models.some(
      (model, index) => model.modelNumber !== expectedModelNumbers[index],
    )
  ) {
    issues.push("Os modelos devem ser preenchidos em sequência.");
  }

  let allGradesTotal = 0;
  for (const model of draft.models) {
    const definition = config.modelDefinitions.find(
      (item) => item.modelNumber === model.modelNumber,
    );
    if (!definition) {
      issues.push(`Modelo ${model.modelNumber} não está configurado no GHL.`);
      continue;
    }
    if (!model.artUrl || !isHttpUrl(model.artUrl)) {
      issues.push(
        `Artes aprovadas do modelo ${model.modelNumber} deve ser um link válido.`,
      );
    }
    const adultTotal = gradeTotal(
      model.adultGrade,
      definition.adultOptions,
      `Grade adulta do modelo ${model.modelNumber}`,
      issues,
    );
    if (adultTotal <= 0) {
      issues.push(
        `Preencha ao menos uma quantidade na grade adulta do modelo ${model.modelNumber}.`,
      );
    }
    allGradesTotal += adultTotal;

    if (model.hasChild) {
      const childTotal = gradeTotal(
        model.childGrade,
        definition.childOptions,
        `Grade infantil do modelo ${model.modelNumber}`,
        issues,
      );
      if (childTotal <= 0) {
        issues.push(
          `Preencha ao menos uma quantidade na grade infantil do modelo ${model.modelNumber}.`,
        );
      }
      allGradesTotal += childTotal;
    }
  }

  if (quantityPairs !== null && allGradesTotal !== quantityPairs) {
    issues.push(
      `A soma das grades (${allGradesTotal}) deve ser igual à quantidade de pares (${quantityPairs}).`,
    );
  }
  if (
    monetaryValue !== null &&
    quantityPairs !== null &&
    unitPrice !== null &&
    Math.abs(monetaryValue - quantityPairs * unitPrice) > 0.01
  ) {
    issues.push(
      `O valor do pedido deve ser ${new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(quantityPairs * unitPrice)} (quantidade × valor unitário).`,
    );
  }

  if (!config.freightConditions.includes(draft.freightCondition)) {
    issues.push("Selecione uma condição de frete válida.");
  }
  const companyPaysFreight = /empresa/i.test(draft.freightCondition);
  parseRequiredNumber(
    companyPaysFreight
      ? draft.freightCompanyValue
      : draft.freightClientValue,
    companyPaysFreight
      ? "Valor do frete pago pela Hudlab"
      : "Valor do frete pago pelo cliente",
    issues,
    { allowZero: true },
  );
  if (!draft.carrier) issues.push("Transportadora é obrigatória.");

  if (!config.paymentForms.includes(draft.paymentForm)) {
    issues.push("Selecione uma forma de pagamento válida.");
  }
  if (/cartão/i.test(draft.paymentForm)) {
    if (!config.cardBrands.includes(draft.cardBrand)) {
      issues.push("Selecione uma bandeira de cartão válida.");
    }
    parseRequiredNumber(
      draft.cardInstallments,
      "Parcelamento do cartão",
      issues,
      { integer: true },
    );
    if (!isValidDateInput(draft.cardSaleDate)) {
      issues.push("Informe uma data válida para a venda no cartão.");
    }
  }

  if (paymentProofCount < 1) {
    issues.push("Adicione ao menos um comprovante de pagamento.");
  }
  if (paymentProofCount > config.maxPaymentProofs) {
    issues.push(
      `O GHL aceita no máximo ${config.maxPaymentProofs} comprovantes de pagamento.`,
    );
  }

  return Array.from(new Set(issues));
}

export type OrderRegistrationValidationIssue = {
  field: string;
  message: string;
};

function validationFieldFromMessage(
  message: string,
  draft: OrderRegistrationDraft,
): string {
  const normalized = message.toLocaleLowerCase("pt-BR");
  const modelNumber = normalized.match(/modelo (\d+)/)?.[1];

  if (normalized.includes("artes aprovadas") && modelNumber) {
    return `models.${modelNumber}.artUrl`;
  }
  if (normalized.includes("grade adulta") && modelNumber) {
    return `models.${modelNumber}.adultGrade`;
  }
  if (normalized.includes("grade infantil") && modelNumber) {
    return `models.${modelNumber}.childGrade`;
  }
  if (normalized.includes("não está configurado") && modelNumber) {
    return `models.${modelNumber}.artUrl`;
  }
  if (normalized.includes("tipo de pedido")) return "orderType";
  if (normalized.includes("data de embarque")) return "embarkDate";
  if (normalized.includes("designer responsável")) return "designer";
  if (normalized.includes("valor do pedido")) return "monetaryValue";
  if (normalized.includes("soma das grades")) return "quantityPairs";
  if (normalized.includes("quantidade de pares")) return "quantityPairs";
  if (normalized.includes("valor unitário do par")) return "unitPrice";
  if (normalized.includes("modelos devem")) return "models";
  if (normalized.includes("condição de frete")) return "freightCondition";
  if (normalized.includes("frete pago pela hudlab")) {
    return "freightCompanyValue";
  }
  if (normalized.includes("frete pago pelo cliente")) {
    return "freightClientValue";
  }
  if (normalized.includes("transportadora")) return "carrier";
  if (normalized.includes("forma de pagamento")) return "paymentForm";
  if (normalized.includes("bandeira")) return "cardBrand";
  if (normalized.includes("parcelamento")) return "cardInstallments";
  if (normalized.includes("venda no cartão")) return "cardSaleDate";
  if (normalized.includes("comprovante")) return "paymentProofs";

  if (normalized.includes("valor do frete")) {
    return /empresa/i.test(draft.freightCondition)
      ? "freightCompanyValue"
      : "freightClientValue";
  }
  return "_form";
}

export function getOrderRegistrationValidationIssues(
  draft: OrderRegistrationDraft,
  config: OrderRegistrationConfig,
  paymentProofCount: number,
): OrderRegistrationValidationIssue[] {
  return validateOrderRegistrationDraft(draft, config, paymentProofCount).map(
    (message) => ({
      field: validationFieldFromMessage(message, draft),
      message,
    }),
  );
}

export function createOrderRegistrationDraft(
  opportunity: OrderRegistrationOpportunity,
): OrderRegistrationDraft {
  return {
    updatedAt: opportunity.updatedAt,
    monetaryValue:
      opportunity.monetaryValue === null ? "" : String(opportunity.monetaryValue),
    orderType: opportunity.orderType,
    embarkDate: opportunity.embarkDate,
    designer: opportunity.designer,
    models: opportunity.models.map((model) => ({
      ...model,
      adultGrade: { ...model.adultGrade },
      childGrade: { ...model.childGrade },
    })),
    quantityPairs:
      opportunity.quantityPairs === null ? "" : String(opportunity.quantityPairs),
    unitPrice:
      opportunity.unitPrice === null ? "" : String(opportunity.unitPrice),
    freightCondition: opportunity.freightCondition,
    freightCompanyValue:
      opportunity.freightCompanyValue === null
        ? ""
        : String(opportunity.freightCompanyValue),
    freightClientValue:
      opportunity.freightClientValue === null
        ? ""
        : String(opportunity.freightClientValue),
    carrier: opportunity.carrier,
    paymentForm: opportunity.paymentForm,
    cardBrand: opportunity.cardBrand,
    cardInstallments:
      opportunity.cardInstallments === null
        ? ""
        : String(opportunity.cardInstallments),
    cardSaleDate: opportunity.cardSaleDate,
  };
}

export function blankOrderRegistrationModel(
  definition: OrderRegistrationModelDefinition,
): OrderRegistrationModelValue {
  return {
    modelNumber: definition.modelNumber,
    artUrl: "",
    adultGrade: Object.fromEntries(
      definition.adultOptions.map((option) => [option.id, ""]),
    ),
    hasChild: false,
    childGrade: Object.fromEntries(
      definition.childOptions.map((option) => [option.id, ""]),
    ),
  };
}
