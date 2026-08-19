import assert from "node:assert/strict";
import test from "node:test";
import { dateFromOpportunityName, ebookAdjustedFootwearUnitPrice, extractGhlOrderSource, natureName, paymentKind } from "../lib/erp/order-rules.ts";

test("normaliza as duas formas de Pix e cartão do GHL", () => {
  assert.equal(paymentKind("PIX à vista"), "pix");
  assert.equal(paymentKind("Pix Sicredi"), "pix");
  assert.equal(paymentKind("Cartão de Crédito"), "credit_card");
});

test("extrai vencimento explícito do nome da oportunidade", () => {
  assert.equal(dateFromOpportunityName("CLIENTE - 18/08/2026"), "2026-08-18");
  assert.equal(dateFromOpportunityName("CLIENTE - 2026-08-18"), "2026-08-18");
  assert.equal(dateFromOpportunityName("GUILHERME - VESTORETO - 1933"), null);
});

test("gera natureza conforme contribuinte e UF", () => {
  assert.equal(natureName("RS"), "Venda de mercadorias - Consumidor final - Rio grande do Sul");
  assert.equal(natureName("BA"), "Venda de Mercadorias - Consumidor final - (PA,AC,AM,BA,GO)");
  assert.equal(natureName("PR"), "Venda de mercadorias - Consumidor final - Outros estados");
});

test("lê quantidade, preço, frete e pagamento dos campos reais do GHL", () => {
  const definitions = [
    { id: "q", fieldKey: "opportunity.nmero_quantidade_de_pares" },
    { id: "p", fieldKey: "opportunity.valor_unitario_do_par" },
    { id: "f", fieldKey: "opportunity.valor_do_frete_pago_cliente" },
    { id: "m", fieldKey: "opportunity.forma_de_pagamento" },
  ];
  const result = extractGhlOrderSource({
    name: "PEDIDO - 20/08/2026",
    customFields: [
      { id: "q", fieldValueNumber: 500 },
      { id: "p", fieldValueString: "59,90" },
      { id: "f", fieldValueString: "R$ 80,00" },
      { id: "m", fieldValueString: "Pix Sicredi" },
    ],
  }, definitions);
  assert.equal(result.expectedPairs, 500);
  assert.equal(result.unitPrice, 59.9);
  assert.equal(result.customerFreight, 80);
  assert.equal(result.paymentKind, "pix");
  assert.equal(result.dueDate, null);
});
test("desconta o ebook do total e recalcula o valor unitário dos pares", () => {
  assert.equal(ebookAdjustedFootwearUnitPrice(5_000, 26.45, 100, 100), 23.55);
  assert.equal(ebookAdjustedFootwearUnitPrice(5_000, 26.45, 80, 100), 28.84);
  assert.equal(ebookAdjustedFootwearUnitPrice(5_000, 26.45, 100, 0), null);
});