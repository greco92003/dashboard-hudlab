import assert from "node:assert/strict";
import test from "node:test";
import { montarRascunho, precoDoParPeloNegocio, recortarConversa } from "../lib/ghl/ficha-pedido/regras.ts";

const msg = (id, dateAdded, body, extra = {}) => ({
  id,
  messageType: "TYPE_WHATSAPP",
  direction: "outbound",
  body,
  dateAdded,
  source: null,
  attachments: [],
  ...extra,
});

const respostaBase = (sobrescrever = {}) => ({
  modelos: [
    {
      descricao: "Bress Bier",
      arte_ref: "anexo-1",
      legenda_cor_sola: "Cor da sola: Preto",
      solado: "Preto",
      cor_pintura_solado: "",
      tipo_personalizacao: "HUD LAB START",
      grade_adulto: [
        { tamanho: "34/35", quantidade: 3 },
        { tamanho: "36/37", quantidade: 5 },
        { tamanho: "38/39", quantidade: 5 },
        { tamanho: "40/41", quantidade: 12 },
        { tamanho: "42/43", quantidade: 3 },
      ],
      grade_infantil: [],
      origem_grade: "msg a1: ARTE APROVADA",
    },
  ],
  total_pares_declarado: 28,
  pagamento: { forma: "Cartão de Crédito", valor_unitario: 55, origem: "msg a2: 2" },
  frete: { condicao: "Frete Pago pelo Cliente", valor_cliente: 59, origem: "msg a3: Frete R$ 59,00" },
  comprovante_refs: ["anexo-2"],
  cartao: { bandeira: "desconhecido", parcelas: 6, data_venda: "" },
  tipo_pedido: { valor: "Evento", origem: "msg a4: dia 15 de dezembro" },
  data_evento: "2026-12-15",
  observacoes: ["Manter a caixa personalizada."],
  duvidas: [],
  ...sobrescrever,
});

const anexos = new Map([
  ["anexo-1", { url: "https://exemplo.test/arte.png", mimeType: "image/png" }],
  ["anexo-2", { url: "https://exemplo.test/comprovante.jpeg", mimeType: "image/jpeg" }],
]);

test("recorte termina 3 dias depois do Pagamento Aprovado e ignora atividades", () => {
  const mensagens = [
    msg("velha", "2026-08-01T10:00:00Z", "orçamento antigo"),
    msg("ini", "2026-11-11T12:00:00Z", "Olá"),
    msg("atividade", "2026-11-12T12:00:00Z", "", { messageType: "TYPE_ACTIVITY_OPPORTUNITY" }),
    msg("aprov", "2026-11-16T18:25:00Z", "Status do Pedido: Pagamento Aprovado\nOlá"),
    msg("depois", "2026-11-18T10:00:00Z", "email do cadastro"),
    msg("producao", "2026-11-25T10:00:00Z", "Seu pedido já está em produção"),
  ];
  const ids = recortarConversa(mensagens, { criadaEm: "2026-11-11T11:00:00Z" }).map((m) => m.id);
  assert.deepEqual(ids, ["ini", "aprov", "depois"]);
});

test("cliente antigo: a janela não passa de 40 dias antes do fim", () => {
  const mensagens = [
    msg("ano-passado", "2025-11-01T10:00:00Z", "pedido de 2025"),
    msg("recente", "2026-11-10T10:00:00Z", "quero de novo"),
  ];
  const ids = recortarConversa(mensagens, {
    criadaEm: "2025-10-30T10:00:00Z",
    agora: new Date("2026-11-18T12:00:00Z"),
  }).map((m) => m.id);
  assert.deepEqual(ids, ["recente"]);
});

test("Bress Bier: rascunho completo, valor bate com o negócio e sem avisos de valor", () => {
  const r = montarRascunho(respostaBase(), { anexos, valorNegocio: 1540 });
  assert.equal(r.quantityPairs, 28);
  assert.equal(r.unitPrice, 55);
  assert.equal(r.monetaryValue, 1540);
  assert.equal(r.modelos[0].soleColor, "Preto");
  assert.equal(r.modelos[0].artUrl, "https://exemplo.test/arte.png");
  assert.deepEqual(r.modelos[0].adultGrade, { "34/35": 3, "36/37": 5, "38/39": 5, "40/41": 12, "42/43": 3 });
  assert.equal(r.modelos[0].hasChild, false);
  assert.equal(r.freightClientValue, 59);
  assert.equal(r.cardInstallments, 6);
  assert.equal(r.cardBrand, null);
  assert.deepEqual(r.comprovanteUrls, ["https://exemplo.test/comprovante.jpeg"]);
  assert.equal(r.observacoes[0], "Evento em 15/12.");
  assert.ok(!r.avisos.some((a) => a.includes("valor do negócio")));
});

test("preço da conversa diferente do negócio: prevalece o negócio, com aviso", () => {
  const r = montarRascunho(respostaBase(), { anexos, valorNegocio: 1506.4 });
  assert.equal(r.unitPrice, 53.8);
  assert.equal(r.monetaryValue, 1506.4);
  assert.ok(r.avisos.some((a) => a.includes("55,00") && a.includes("Usei o valor do negócio")));
});

test("preço do par pelo negócio usa até 3 casas para fechar no centavo", () => {
  assert.equal(precoDoParPeloNegocio(1540, 28), 55);
  assert.equal(precoDoParPeloNegocio(967.38, 17), 56.905);
  assert.equal(precoDoParPeloNegocio(970.38, 18), 53.91);
});

test("sem preço na conversa, usa o negócio; negócio fora da faixa vira aviso e não é usado", () => {
  const semPreco = montarRascunho(
    respostaBase({ pagamento: { forma: "Cartão de Crédito", valor_unitario: null, origem: "" } }),
    { anexos, valorNegocio: 1540 },
  );
  assert.equal(semPreco.unitPrice, 55);
  assert.ok(semPreco.avisos.some((a) => a.includes("calculado pelo valor do negócio")));

  const foraDaFaixa = montarRascunho(respostaBase(), { anexos, valorNegocio: 154000 });
  assert.equal(foraDaFaixa.unitPrice, 55);
  assert.equal(foraDaFaixa.monetaryValue, 1540);
  assert.ok(foraDaFaixa.avisos.some((a) => a.includes("fora da faixa")));
});

test("frete não achado com 36 pares ou mais vira frete grátis, com aviso", () => {
  const resposta = respostaBase({ frete: { condicao: "desconhecido", valor_cliente: null, origem: "" }, total_pares_declarado: 36 });
  resposta.modelos[0].grade_adulto.push({ tamanho: "44/45", quantidade: 8 });
  const r = montarRascunho(resposta, { anexos, valorNegocio: null });
  assert.equal(r.quantityPairs, 36);
  assert.equal(r.freightCondition, "Frete Pago pela Empresa (Frete Grátis)");
  assert.ok(r.avisos.some((a) => a.includes("36 pares")));
});

test("evento vira a observação importante no formato da equipe", () => {
  const r = montarRascunho(respostaBase(), { anexos, valorNegocio: 1540 });
  assert.equal(r.observacaoImportante, "EVENTO 15/12");
  const pedido = montarRascunho(respostaBase({ tipo_pedido: { valor: "Pedido", origem: "" }, data_evento: "" }), { anexos, valorNegocio: 1540 });
  assert.equal(pedido.observacaoImportante, null);
});

test("solado colorido fica vazio para o vendedor escolher a base", () => {
  const resposta = respostaBase();
  resposta.modelos[0].solado = "colorido";
  resposta.modelos[0].cor_pintura_solado = "vermelho";
  const r = montarRascunho(resposta, { anexos, valorNegocio: 1540 });
  assert.equal(r.modelos[0].soleColor, null);
  assert.match(r.modelos[0].soleNote, /vermelho.*Mais claro, Branco; mais escuro, Preto/);
  assert.ok(r.avisos.some((a) => a.includes("Solado colorido")));
});

test("soma das grades diferente do total declarado vira aviso; tamanhos inválidos e zeros saem", () => {
  const resposta = respostaBase({ total_pares_declarado: 30 });
  resposta.modelos[0].grade_adulto.push({ tamanho: "46/47", quantidade: 2 }, { tamanho: "44/45", quantidade: 0 });
  const r = montarRascunho(resposta, { anexos, valorNegocio: 1540 });
  assert.equal(r.quantityPairs, 28);
  assert.ok(r.avisos.some((a) => a.includes("28 pares") && a.includes("30")));
});

test("bandeira e parcelas só valem para cartão; arte e comprovante ausentes viram aviso", () => {
  const r = montarRascunho(
    respostaBase({
      pagamento: { forma: "Pix à vista", valor_unitario: 52.1, origem: "msg a2: pix" },
      cartao: { bandeira: "Visa", parcelas: 6, data_venda: "2026-11-16" },
      comprovante_refs: ["anexo-9"],
    }),
    { anexos: new Map(), valorNegocio: null },
  );
  assert.equal(r.cardBrand, null);
  assert.equal(r.cardInstallments, null);
  assert.equal(r.cardSaleDate, null);
  assert.equal(r.modelos[0].artUrl, null);
  assert.ok(r.avisos.some((a) => a.includes("arte aprovada")));
  assert.ok(r.avisos.some((a) => a.includes("comprovante")));
});

test("sem grade na conversa: pares e valor ficam para o vendedor, mesmo com orçamento de N pares", () => {
  const resposta = respostaBase({ total_pares_declarado: 36 });
  resposta.modelos[0].grade_adulto = [];
  const r = montarRascunho(resposta, { anexos, valorNegocio: 1760 });
  assert.equal(r.quantityPairs, null);
  assert.equal(r.monetaryValue, null);
  assert.ok(r.avisos.some((a) => a.includes("36 pares, mas sem grade")));
});
