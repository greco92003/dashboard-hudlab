import assert from "node:assert/strict";
import test from "node:test";
import { aplicarRascunhoNoFormulario, fichaSemGrade } from "../lib/ghl/ficha-pedido/aplicar.ts";

const opcoes = (labels) => labels.map((label, i) => ({ id: `op${i}-${label}`, label }));
const definicao = (modelNumber) => ({
  modelNumber,
  soleOptions: ["Branco", "Preto"],
  adultOptions: opcoes(["34/35", "36/37", "38/39", "40/41", "42/43", "44/45"]),
  childOptions: opcoes(["28/29", "30/31", "32/33"]),
});
const config = {
  pipelineName: "Atendimento",
  stageName: "Pagamento Confirmado/Completar Dados",
  orderTypes: ["Pedido", "Evento", "Amostra", "Reposição"],
  freightConditions: ["Frete Pago pelo Cliente", "Frete Pago pela Empresa (Frete Grátis)"],
  paymentForms: ["Pix à vista", "Pix 50/50", "Cartão de Crédito"],
  cardBrands: ["Mastercard", "Visa"],
  maxPaymentProofs: 5,
  modelDefinitions: [definicao(1), definicao(2)],
};
const vazio = {
  updatedAt: null, opportunityName: "Bress Bier", seller: "Schay", monetaryValue: "1540", orderType: "Evento",
  embarkDate: "", designer: "Felipe",
  models: [{ modelNumber: 1, soleColor: "", artUrl: "", adultGrade: {}, hasChild: false, childGrade: {} }],
  quantityPairs: "28", unitPrice: "53.8", freightCondition: "", freightCompanyValue: "", freightClientValue: "",
  carrier: "", paymentForm: "", cardBrand: "", cardInstallments: "", cardSaleDate: "",
};
const rascunho = {
  modelos: [{
    modelNumber: 1, descricao: "Bress Bier", soleColor: "Preto", soleNote: null, artUrl: "https://exemplo.test/arte.png",
    tipoPersonalizacao: "HUD LAB START", adultGrade: { "34/35": 3, "36/37": 5, "38/39": 5, "40/41": 12, "42/43": 3 },
    childGrade: {}, hasChild: false, origemGrade: "msg x",
  }],
  quantityPairs: 28, unitPrice: 55, monetaryValue: 1540, paymentForm: "Cartão de Crédito", cardBrand: null,
  cardInstallments: 6, cardSaleDate: null, freightCondition: "Frete Pago pelo Cliente", freightClientValue: 59,
  comprovanteUrls: ["https://exemplo.test/comp.jpeg"], orderType: "Evento", eventDate: "2026-12-15",
  observacaoImportante: "EVENTO 15/12", observacoes: [], avisos: [], origens: {},
};

test("Bress Bier: grade pelos ids das opções, solado, arte, preço corrigido, frete e cartão", () => {
  assert.equal(fichaSemGrade(vazio), true);
  const { draft, preenchidos, ignorados } = aplicarRascunhoNoFormulario(vazio, rascunho, config);
  const m = draft.models[0];
  assert.equal(m.soleColor, "Preto");
  assert.equal(m.artUrl, "https://exemplo.test/arte.png");
  assert.equal(m.adultGrade["op3-40/41"], "12");
  assert.equal(m.adultGrade["op5-44/45"], "");
  assert.equal(m.hasChild, false);
  assert.equal(draft.unitPrice, "55");
  assert.equal(draft.quantityPairs, "28");
  assert.equal(draft.freightCondition, "Frete Pago pelo Cliente");
  assert.equal(draft.freightClientValue, "59");
  assert.equal(draft.paymentForm, "Cartão de Crédito");
  assert.equal(draft.cardInstallments, "6");
  assert.equal(draft.cardBrand, "");
  assert.equal(draft.embarkDate, "");
  assert.equal(draft.carrier, "");
  assert.equal(fichaSemGrade(draft), false);
  assert.ok(preenchidos.includes("Grade de 1 modelo(s)") && preenchidos.includes("Preço do par"));
  assert.deepEqual(ignorados, []);
});

test("sem grade no rascunho, os modelos do formulário ficam como estão", () => {
  const semGrade = { ...rascunho, modelos: [{ ...rascunho.modelos[0], adultGrade: {}, childGrade: {} }] };
  const { draft } = aplicarRascunhoNoFormulario(vazio, semGrade, config);
  assert.deepEqual(draft.models, vazio.models);
});

test("mais modelos do que o GHL tem e solado fora das opções viram aviso, sem quebrar", () => {
  const tres = {
    ...rascunho,
    modelos: [0, 1, 2].map((i) => ({ ...rascunho.modelos[0], modelNumber: i + 1, soleColor: i === 1 ? "Azul" : "Preto" })),
  };
  const { draft, ignorados } = aplicarRascunhoNoFormulario(vazio, tres, config);
  assert.equal(draft.models.length, 2);
  assert.equal(draft.models[1].soleColor, "");
  assert.ok(ignorados.some((a) => a.includes("Modelo 3")));
});
