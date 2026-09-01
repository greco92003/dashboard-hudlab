import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrderRegistrationValidationIssues,
  validateOrderRegistrationDraft,
} from "../lib/ghl/order-registration-shared.ts";

const config = {
  pipelineName: "Atendimento",
  stageName: "Conferir Pgto/Completar Dados",
  orderTypes: ["Pedido", "Evento"],
  freightConditions: [
    "Frete Pago pelo Cliente",
    "Frete Pago pela Empresa (Frete Grátis)",
  ],
  paymentForms: ["Pix à vista", "Pix 50/50", "Cartão de Crédito"],
  cardBrands: ["Mastercard", "Visa"],
  maxPaymentProofs: 5,
  modelDefinitions: [
    {
      modelNumber: 1,
      soleOptions: ["Branco", "Preto"],
      adultOptions: [
        { id: "adult-34", label: "34/35" },
        { id: "adult-36", label: "36/37" },
      ],
      childOptions: [{ id: "child-28", label: "28/29" }],
    },
  ],
};

function validDraft() {
  return {
    updatedAt: "2026-08-21T12:00:00.000Z",
    opportunityName: "Pedido Cliente Exemplo",
    seller: "Maria",
    monetaryValue: "529",
    orderType: "Pedido",
    embarkDate: "2026-09-11",
    designer: "Greco",
    models: [
      {
        modelNumber: 1,
        soleColor: "Preto",
        artUrl: "https://drive.google.com/file/example",
        adultGrade: { "adult-34": "4", "adult-36": "6" },
        hasChild: false,
        childGrade: { "child-28": "" },
      },
    ],
    quantityPairs: "10",
    unitPrice: "52.9",
    freightCondition: "Frete Pago pelo Cliente",
    freightCompanyValue: "",
    freightClientValue: "100",
    carrier: "Braspress",
    paymentForm: "Pix à vista",
    cardBrand: "",
    cardInstallments: "",
    cardSaleDate: "",
  };
}

test("accepts a complete Pix order", () => {
  assert.deepEqual(
    validateOrderRegistrationDraft(validDraft(), config, 1),
    [],
  );
});

test("detects grade and monetary total mismatches", () => {
  const draft = validDraft();
  draft.models[0].adultGrade["adult-36"] = "5";
  draft.monetaryValue = "500";

  const issues = validateOrderRegistrationDraft(draft, config, 1);
  assert.ok(issues.some((issue) => issue.includes("soma das grades")));
  assert.ok(issues.some((issue) => issue.includes("valor do pedido")));
});

test("requires the conditional credit card fields", () => {
  const draft = validDraft();
  draft.paymentForm = "Cartão de Crédito";

  const issues = validateOrderRegistrationDraft(draft, config, 1);
  assert.ok(issues.some((issue) => issue.includes("bandeira")));
  assert.ok(issues.some((issue) => issue.includes("Parcelamento")));
  assert.ok(issues.some((issue) => issue.includes("venda no cartão")));
});

test("requires a child grade only when the checkbox is enabled", () => {
  const draft = validDraft();
  draft.models[0].hasChild = true;

  const issues = validateOrderRegistrationDraft(draft, config, 1);
  assert.ok(issues.some((issue) => issue.includes("grade infantil")));
});

test("requires a valid sole color for every model", () => {
  const draft = validDraft();
  draft.models[0].soleColor = "";

  const issues = getOrderRegistrationValidationIssues(draft, config, 1);
  assert.ok(issues.some((issue) => issue.field === "models.1.soleColor"));
});

test("requires at least one payment proof", () => {
  const issues = validateOrderRegistrationDraft(validDraft(), config, 0);
  assert.ok(issues.some((issue) => issue.includes("comprovante")));
});

test("associates required validation messages with their fields", () => {
  const draft = validDraft();
  draft.opportunityName = "";
  draft.seller = "";
  draft.orderType = "";
  draft.designer = "";
  draft.models[0].artUrl = "";
  draft.carrier = "";

  const issues = getOrderRegistrationValidationIssues(draft, config, 0);
  const fields = new Set(issues.map((issue) => issue.field));

  assert.ok(fields.has("orderType"));
  assert.ok(fields.has("opportunityName"));
  assert.ok(fields.has("seller"));
  assert.ok(fields.has("designer"));
  assert.ok(fields.has("models.1.artUrl"));
  assert.ok(fields.has("carrier"));
  assert.ok(fields.has("paymentProofs"));
  assert.ok(issues.every((issue) => issue.message.length > 0));
});
