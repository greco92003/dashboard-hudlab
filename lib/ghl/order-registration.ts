import {
  fetchCustomFieldDefs,
  fetchGhlPipelines,
  fetchOpportunityById,
  searchGhlOpportunitiesByStage,
  updateGhlOpportunity,
  uploadGhlCustomFieldFiles,
  type GhlCustomFieldDef,
  type GhlOpportunity,
  type GhlUploadedFile,
} from "@/lib/ghl/api";
import {
  ORDER_REGISTRATION_ACCEPTED_FILE_TYPES,
  ORDER_REGISTRATION_MAX_FILE_BYTES,
  ORDER_REGISTRATION_PIPELINE_NAME,
  ORDER_REGISTRATION_STAGE_NAME,
  type OrderRegistrationConfig,
  type OrderRegistrationDraft,
  type OrderRegistrationModelDefinition,
  type OrderRegistrationModelValue,
  type OrderRegistrationOpportunity,
  type OrderRegistrationPaymentProof,
  type OrderRegistrationResponse,
  validateOrderRegistrationDraft,
} from "@/lib/ghl/order-registration-shared";

type FieldName =
  | "orderType"
  | "embarkDate"
  | "designer"
  | "quantityPairs"
  | "unitPrice"
  | "freightCondition"
  | "freightCompanyValue"
  | "freightClientValue"
  | "carrier"
  | "paymentForm"
  | "cardBrand"
  | "cardInstallments"
  | "cardSaleDate"
  | "paymentProofs";

type ResolvedModelFields = {
  modelNumber: number;
  sole: GhlCustomFieldDef;
  art: GhlCustomFieldDef;
  adult: GhlCustomFieldDef;
  child: GhlCustomFieldDef;
};

type ResolvedFields = {
  fields: Record<FieldName, GhlCustomFieldDef>;
  models: ResolvedModelFields[];
  config: OrderRegistrationConfig;
};

const FIELD_KEYS: Record<FieldName, string> = {
  orderType: "tipo_do_pedido",
  embarkDate: "data_de_embarque",
  designer: "designer_responsvel",
  quantityPairs: "nmero_quantidade_de_pares",
  unitPrice: "valor_unitario_do_par",
  freightCondition: "condio_de_frete",
  freightCompanyValue: "valor_do_frete_pago_hud_lab",
  freightClientValue: "valor_do_frete_pago_cliente",
  carrier: "transportadora",
  paymentForm: "forma_de_pagamento",
  cardBrand: "bandeira_carto",
  cardInstallments: "parcelamento_carto_de_crdito_vezes",
  cardSaleDate: "data_venda_carto",
  paymentProofs: "comprovantes_de_pagamento",
};

const ACCEPTED_FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "csv",
  "xlsx",
  "xls",
  "mp4",
  "mpeg",
  "zip",
  "rar",
  "txt",
  "svg",
]);

export class OrderRegistrationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "OrderRegistrationError";
  }
}

function fieldKeySuffix(fieldKey: string): string {
  const separator = fieldKey.indexOf(".");
  return separator >= 0 ? fieldKey.slice(separator + 1) : fieldKey;
}

function picklistStrings(definition: GhlCustomFieldDef): string[] {
  return (definition.picklistOptions ?? []).filter(
    (option): option is string => typeof option === "string",
  );
}

function gradeOptions(definition: GhlCustomFieldDef) {
  return (definition.picklistOptions ?? []).flatMap((option) =>
    typeof option === "string"
      ? []
      : [{ id: option.id, label: option.label }],
  );
}

function resolveFields(definitions: GhlCustomFieldDef[]): ResolvedFields {
  const definitionsByKey = new Map(
    definitions.map((definition) => [
      fieldKeySuffix(definition.fieldKey),
      definition,
    ]),
  );
  const fields = {} as Record<FieldName, GhlCustomFieldDef>;
  const definitionByName = (name: string) =>
    definitions.find(
      (definition) =>
        definition.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0,
    );

  for (const [name, fieldKey] of Object.entries(FIELD_KEYS) as Array<
    [FieldName, string]
  >) {
    const definition = definitionsByKey.get(fieldKey);
    if (!definition) {
      throw new OrderRegistrationError(
        `O campo "${fieldKey}" não foi encontrado no GHL.`,
        503,
      );
    }
    fields[name] = definition;
  }

  const models: ResolvedModelFields[] = [];
  const modelDefinitions: OrderRegistrationModelDefinition[] = [];
  for (let modelNumber = 1; modelNumber <= 10; modelNumber++) {
    // Modelo 3 was created in GHL with a malformed fieldKey, so the visible
    // field name is the reliable fallback for all model slots.
    const sole =
      definitionsByKey.get(`solado_modelo_${modelNumber}`) ??
      definitionByName(`Solado Modelo ${modelNumber}`);
    const art = definitionsByKey.get(
      `artes_aprovadas_modelo_${modelNumber}`,
    );
    const adult =
      definitionsByKey.get(
        modelNumber === 1
          ? "grade_modelo_1"
          : `grade_modelo_${modelNumber}_adulto`,
      ) ??
      definitionsByKey.get(`grade_modelo_${modelNumber}`);
    const child = definitionsByKey.get(
      `grade_modelo_${modelNumber}_infantil`,
    );

    if (!sole && !art && !adult && !child) continue;
    if (!sole || !art || !adult || !child) {
      throw new OrderRegistrationError(
        `Os campos do modelo ${modelNumber} estão incompletos no GHL.`,
        503,
      );
    }

    const adultOptions = gradeOptions(adult);
    const childOptions = gradeOptions(child);
    if (adultOptions.length === 0 || childOptions.length === 0) {
      throw new OrderRegistrationError(
        `As linhas de grade do modelo ${modelNumber} não estão configuradas no GHL.`,
        503,
      );
    }
    models.push({ modelNumber, sole, art, adult, child });
    modelDefinitions.push({
      modelNumber,
      soleOptions: picklistStrings(sole),
      adultOptions,
      childOptions,
    });
  }

  if (models.length === 0 || models[0]?.modelNumber !== 1) {
    throw new OrderRegistrationError(
      "Os campos do modelo 1 não estão configurados no GHL.",
      503,
    );
  }

  return {
    fields,
    models,
    config: {
      pipelineName: ORDER_REGISTRATION_PIPELINE_NAME,
      stageName: ORDER_REGISTRATION_STAGE_NAME,
      orderTypes: picklistStrings(fields.orderType),
      freightConditions: picklistStrings(fields.freightCondition),
      paymentForms: picklistStrings(fields.paymentForm).filter(
        (option) => !/boleto/i.test(option),
      ),
      cardBrands: picklistStrings(fields.cardBrand),
      maxPaymentProofs: fields.paymentProofs.maxFileLimit ?? 5,
      modelDefinitions,
    },
  };
}

function rawFieldValue(entry: Record<string, unknown> | undefined): unknown {
  if (!entry) return null;
  if ("fieldValue" in entry) return entry.fieldValue;
  for (const [key, value] of Object.entries(entry)) {
    if (key.startsWith("fieldValue")) return value;
  }
  return null;
}

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function valueAsNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateToInput(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  const brazilianDate = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  );
  if (brazilianDate) {
    const [, day, month, year] = brazilianDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed)
    ? ""
    : new Date(parsed).toISOString().slice(0, 10);
}

function dateToBrazilian(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function gradeValues(
  definition: GhlCustomFieldDef,
  value: unknown,
): Record<string, string> {
  const values =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    gradeOptions(definition).map((option) => {
      const raw = values[option.id];
      return [
        option.id,
        raw === null || raw === undefined ? "" : String(raw),
      ];
    }),
  );
}

function hasGradeValue(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => Number(value) > 0);
}

function paymentProofs(value: unknown): OrderRegistrationPaymentProof[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string" || !record.url) return [];
    const meta =
      record.meta && typeof record.meta === "object"
        ? (record.meta as Record<string, unknown>)
        : {};
    return [
      {
        url: record.url,
        name:
          (typeof meta.name === "string" && meta.name) ||
          (typeof meta.originalname === "string" && meta.originalname) ||
          "Comprovante",
        mimeType:
          typeof meta.mimetype === "string" ? meta.mimetype : null,
        size: typeof meta.size === "number" ? meta.size : null,
      },
    ];
  });
}

function mapOpportunity(
  opportunity: GhlOpportunity,
  resolved: ResolvedFields,
): OrderRegistrationOpportunity {
  const valuesById = new Map(
    (opportunity.customFields ?? []).map((entry) => [
      entry.id,
      rawFieldValue(entry),
    ]),
  );
  const fieldValue = (field: GhlCustomFieldDef) => valuesById.get(field.id);

  const mappedModels = resolved.models.map((model): OrderRegistrationModelValue => {
    const adultGrade = gradeValues(model.adult, fieldValue(model.adult));
    const childGrade = gradeValues(model.child, fieldValue(model.child));
    return {
      modelNumber: model.modelNumber,
      soleColor: valueAsString(fieldValue(model.sole)),
      artUrl: valueAsString(fieldValue(model.art)),
      adultGrade,
      hasChild: hasGradeValue(childGrade),
      childGrade,
    };
  });
  let visibleModelCount = 1;
  for (const model of mappedModels) {
    if (
      model.artUrl ||
      model.soleColor ||
      hasGradeValue(model.adultGrade) ||
      hasGradeValue(model.childGrade)
    ) {
      visibleModelCount = model.modelNumber;
    }
  }

  return {
    id: opportunity.id,
    name: opportunity.name || "Oportunidade sem nome",
    monetaryValue: opportunity.monetaryValue,
    source: opportunity.source,
    status: opportunity.status,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
    contact: {
      id: opportunity.contact?.id ?? opportunity.contactId,
      name: opportunity.contact?.name ?? opportunity.name ?? null,
      companyName: opportunity.contact?.companyName ?? null,
      email: opportunity.contact?.email ?? null,
      phone: opportunity.contact?.phone ?? null,
    },
    orderType: valueAsString(fieldValue(resolved.fields.orderType)),
    embarkDate: dateToInput(fieldValue(resolved.fields.embarkDate)),
    designer: valueAsString(fieldValue(resolved.fields.designer)),
    quantityPairs: valueAsNumber(fieldValue(resolved.fields.quantityPairs)),
    unitPrice: valueAsNumber(fieldValue(resolved.fields.unitPrice)),
    freightCondition: valueAsString(
      fieldValue(resolved.fields.freightCondition),
    ),
    freightCompanyValue: valueAsNumber(
      fieldValue(resolved.fields.freightCompanyValue),
    ),
    freightClientValue: valueAsNumber(
      fieldValue(resolved.fields.freightClientValue),
    ),
    carrier: valueAsString(fieldValue(resolved.fields.carrier)),
    paymentForm: valueAsString(fieldValue(resolved.fields.paymentForm)),
    cardBrand: valueAsString(fieldValue(resolved.fields.cardBrand)),
    cardInstallments: valueAsNumber(
      fieldValue(resolved.fields.cardInstallments),
    ),
    cardSaleDate: dateToInput(fieldValue(resolved.fields.cardSaleDate)),
    paymentProofs: paymentProofs(
      fieldValue(resolved.fields.paymentProofs),
    ),
    models: mappedModels.slice(0, visibleModelCount),
  };
}

async function resolveTarget() {
  const pipelines = await fetchGhlPipelines();
  const pipeline = pipelines.find(
    (item) =>
      item.name.localeCompare(ORDER_REGISTRATION_PIPELINE_NAME, "pt-BR", {
        sensitivity: "base",
      }) === 0,
  );
  const stage = pipeline?.stages?.find(
    (item) =>
      item.name.localeCompare(ORDER_REGISTRATION_STAGE_NAME, "pt-BR", {
        sensitivity: "base",
      }) === 0,
  );
  if (!pipeline || !stage) {
    throw new OrderRegistrationError(
      "Pipeline ou estágio do cadastro de pedido não foi encontrado no GHL.",
      503,
    );
  }
  return { pipeline, stage };
}

/** Small batches keep the per-id reads from bursting against GHL's rate limit. */
const DETAIL_BATCH_SIZE = 5;

async function fetchOpportunityDetails(
  ids: string[],
): Promise<GhlOpportunity[]> {
  const details: GhlOpportunity[] = [];
  for (let index = 0; index < ids.length; index += DETAIL_BATCH_SIZE) {
    const batch = ids.slice(index, index + DETAIL_BATCH_SIZE);
    details.push(...(await Promise.all(batch.map(fetchOpportunityById))));
  }
  return details;
}

export async function getOrderRegistrationSnapshot(): Promise<OrderRegistrationResponse> {
  const [definitions, target] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    resolveTarget(),
  ]);
  const resolved = resolveFields(definitions);
  const [openOpportunities, wonOpportunities] = await Promise.all([
    searchGhlOpportunitiesByStage(
      target.pipeline.id,
      target.stage.id,
      "open",
    ),
    searchGhlOpportunitiesByStage(
      target.pipeline.id,
      target.stage.id,
      "won",
    ),
  ]);
  const summaries = Array.from(
    new Map(
      [...openOpportunities, ...wonOpportunities].map((opportunity) => [
        opportunity.id,
        opportunity,
      ]),
    ).values(),
  ).filter(
    (opportunity) =>
      opportunity.pipelineId === target.pipeline.id &&
      opportunity.pipelineStageId === target.stage.id &&
      (opportunity.status === "open" || opportunity.status === "won"),
  );

  // `/opportunities/search` omits TEXTBOX_LIST fields, so the grades come back
  // empty from it. Only the per-id read has them — and a form loaded without
  // the stored grades would write blanks over them on the next save.
  const opportunities = await fetchOpportunityDetails(
    summaries.map((opportunity) => opportunity.id),
  );

  return {
    opportunities: opportunities
      .map((opportunity) => mapOpportunity(opportunity, resolved))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    config: resolved.config,
    fetchedAt: new Date().toISOString(),
  };
}

function compactGrade(
  values: Record<string, string>,
  definition: GhlCustomFieldDef,
): Record<string, string> {
  const allowed = new Set(gradeOptions(definition).map((option) => option.id));
  return Object.fromEntries(
    Object.entries(values)
      .filter(
        ([optionId, value]) =>
          allowed.has(optionId) && Number.isInteger(Number(value)) && Number(value) > 0,
      )
      .map(([optionId, value]) => [optionId, String(Number(value))]),
  );
}

function existingProofFileValues(
  opportunity: GhlOpportunity,
  proofFieldId: string,
): Array<Record<string, unknown>> {
  const entry = opportunity.customFields?.find(
    (field) => field.id === proofFieldId,
  );
  const value = rawFieldValue(entry);
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function validateFiles(files: File[], maxFiles: number): string[] {
  const issues: string[] = [];
  if (files.length > maxFiles) {
    issues.push(`Selecione no máximo ${maxFiles} comprovantes.`);
  }
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (
      !ORDER_REGISTRATION_ACCEPTED_FILE_TYPES.has(file.type) &&
      !ACCEPTED_FILE_EXTENSIONS.has(extension)
    ) {
      issues.push(`O arquivo "${file.name}" tem um formato não permitido.`);
    }
    if (file.size > ORDER_REGISTRATION_MAX_FILE_BYTES) {
      issues.push(`O arquivo "${file.name}" excede o limite de 50 MB.`);
    }
  }
  return issues;
}

function fieldUpdate(field: GhlCustomFieldDef, fieldValue: unknown) {
  return { id: field.id, fieldValue };
}

function uploadedFilesAsValues(
  uploadedFiles: GhlUploadedFile[],
): Array<Record<string, unknown>> {
  return uploadedFiles.map((file) => ({
    deleted: file.deleted,
    url: file.url,
    meta: file.meta,
  }));
}

export async function saveOrderRegistration(
  opportunityId: string,
  draft: OrderRegistrationDraft,
  files: File[],
): Promise<OrderRegistrationOpportunity> {
  const [opportunity, definitions, target] = await Promise.all([
    fetchOpportunityById(opportunityId),
    fetchCustomFieldDefs("opportunity"),
    resolveTarget(),
  ]);
  if (
    opportunity.pipelineId !== target.pipeline.id ||
    opportunity.pipelineStageId !== target.stage.id ||
    (opportunity.status !== "open" && opportunity.status !== "won")
  ) {
    throw new OrderRegistrationError(
      "Esta oportunidade não está mais em Pagamento Confirmado/Completar Dados. Atualize a lista.",
      409,
    );
  }
  if (
    draft.updatedAt &&
    opportunity.updatedAt &&
    draft.updatedAt !== opportunity.updatedAt
  ) {
    throw new OrderRegistrationError(
      "A oportunidade foi alterada no GHL depois que você abriu o formulário. Atualize a lista antes de salvar.",
      409,
    );
  }

  const resolved = resolveFields(definitions);
  const existingFiles = existingProofFileValues(
    opportunity,
    resolved.fields.paymentProofs.id,
  );
  const fileIssues = validateFiles(
    files,
    Math.max(0, resolved.config.maxPaymentProofs - existingFiles.length),
  );
  const validationIssues = validateOrderRegistrationDraft(
    draft,
    resolved.config,
    existingFiles.length + files.length,
  );
  const issues = [...fileIssues, ...validationIssues];
  if (issues.length > 0) {
    throw new OrderRegistrationError(
      "Revise os campos obrigatórios antes de salvar.",
      422,
      issues,
    );
  }

  const customFields = [
    fieldUpdate(resolved.fields.orderType, draft.orderType),
    fieldUpdate(
      resolved.fields.embarkDate,
      dateToBrazilian(draft.embarkDate),
    ),
    fieldUpdate(resolved.fields.designer, draft.designer),
  ];

  for (const definition of resolved.models) {
    const model = draft.models.find(
      (item) => item.modelNumber === definition.modelNumber,
    );
    customFields.push(
      fieldUpdate(definition.sole, model?.soleColor ?? ""),
      fieldUpdate(definition.art, model?.artUrl ?? ""),
      fieldUpdate(
        definition.adult,
        model ? compactGrade(model.adultGrade, definition.adult) : {},
      ),
      fieldUpdate(
        definition.child,
        model?.hasChild
          ? compactGrade(model.childGrade, definition.child)
          : {},
      ),
    );
  }

  const companyPaysFreight = /empresa/i.test(draft.freightCondition);
  const isCard = /cartão/i.test(draft.paymentForm);
  customFields.push(
    fieldUpdate(resolved.fields.quantityPairs, Number(draft.quantityPairs)),
    fieldUpdate(resolved.fields.unitPrice, Number(draft.unitPrice)),
    fieldUpdate(resolved.fields.freightCondition, draft.freightCondition),
    fieldUpdate(
      resolved.fields.freightCompanyValue,
      companyPaysFreight ? Number(draft.freightCompanyValue) : 0,
    ),
    fieldUpdate(
      resolved.fields.freightClientValue,
      companyPaysFreight ? 0 : Number(draft.freightClientValue),
    ),
    fieldUpdate(resolved.fields.carrier, draft.carrier),
    fieldUpdate(resolved.fields.paymentForm, draft.paymentForm),
    fieldUpdate(resolved.fields.cardBrand, isCard ? draft.cardBrand : ""),
    fieldUpdate(
      resolved.fields.cardInstallments,
      isCard ? Number(draft.cardInstallments) : 0,
    ),
    fieldUpdate(
      resolved.fields.cardSaleDate,
      isCard ? draft.cardSaleDate : "",
    ),
  );

  if (files.length > 0) {
    const uploadedFiles = await uploadGhlCustomFieldFiles(
      resolved.fields.paymentProofs.id,
      files,
    );
    if (uploadedFiles.length !== files.length) {
      throw new OrderRegistrationError(
        "O GHL não confirmou todos os comprovantes enviados.",
        502,
      );
    }
    customFields.push(
      fieldUpdate(resolved.fields.paymentProofs, [
        ...existingFiles,
        ...uploadedFilesAsValues(uploadedFiles),
      ]),
    );
  }

  await updateGhlOpportunity(opportunityId, {
    monetaryValue: Math.round(Number(draft.monetaryValue) * 100) / 100,
    customFields,
  });

  const updatedOpportunity = await fetchOpportunityById(opportunityId);
  return mapOpportunity(updatedOpportunity, resolved);
}
