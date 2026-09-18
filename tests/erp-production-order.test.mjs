import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionLabels, parseLabelDescription } from "../lib/erp/production-labels.ts";
import { checkProductionOrder, parseGeneratedItems } from "../lib/erp/production-order-rules.ts";

test("quebra a descrição do Tiny em tipo, código, modelo, cor e tamanho", () => {
  assert.deepEqual(parseLabelDescription("Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 28/29"), {
    description: "Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 28/29",
    kind: "Chinelo Slide Infantil",
    code: "072601",
    model: "FIFTY FIGHT",
    color: "Preto",
    size: "28/29",
    parsed: true,
  });
});

test("modelo com hífen continua inteiro", () => {
  const label = parseLabelDescription("Chinelo Slide 081234 - CROSS - FIT BOX - Off White - Tamanho: 40 / 41");
  assert.equal(label.model, "CROSS - FIT BOX");
  assert.equal(label.color, "Off White");
  assert.equal(label.size, "40/41");
});

test("descrição fora do padrão cai no texto inteiro", () => {
  const label = parseLabelDescription("Chinelo avulso sem código");
  assert.equal(label.parsed, false);
  assert.equal(label.description, "Chinelo avulso sem código");
});

test("uma etiqueta por par, sem livro digital, ordenada por tamanho", () => {
  const labels = buildProductionLabels([
    { description: "Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 32/33", quantity: 4 },
    { description: "LIVRO DIGITAL HUD LAB - Quantidade de Acessos", quantity: 13 },
    { description: "Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 28/29", quantity: 2 },
    { description: "Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 28/29", quantity: 1 },
  ]);
  assert.equal(labels.length, 7);
  assert.deepEqual(labels.map((label) => label.size), ["28/29", "28/29", "28/29", "32/33", "32/33", "32/33", "32/33"]);
});

test("lê os itens da v2 nos dois formatos", () => {
  const wrapped = parseGeneratedItems([{ item: { codigo: "A-28", descricao: "A", quantidade: "5.00", quantidade_gerada: "3.00", mensagem: "" } }]);
  const flat = parseGeneratedItems([{ codigo: "A-28", descricao: "A", quantidade: "5", quantidade_gerada: "3" }]);
  assert.deepEqual(wrapped, flat.map((item) => ({ ...item, message: "" })));
  assert.equal(wrapped[0].generated, 3);
});

test("pareia pela descrição quando um dos lados vem sem código", () => {
  // Pedido 2046: a v2 devolveu os itens gerados sem `codigo`; sem cair na
  // descrição, cada produto virava duas linhas divergentes.
  const sold = [{ sku: "CH-SL-ANA-MESTRE-BRC-3637", description: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantity: 11 }];
  const semCodigo = checkProductionOrder(sold, parseGeneratedItems([
    { descricao: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantidade: "11.0000", quantidade_gerada: "11.0000" },
  ]));
  assert.equal(semCodigo.ok, true);
  assert.equal(semCodigo.lines.length, 1);

  const semSku = checkProductionOrder(
    [{ sku: "", description: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantity: 11 }],
    parseGeneratedItems([{ codigo: "CH-SL-ANA-MESTRE-BRC-3637", descricao: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantidade: "11", quantidade_gerada: "11" }]),
  );
  assert.equal(semSku.ok, true);
  assert.equal(semSku.lines.length, 1);
});

test("item que o Tiny recusa por não ser fabricado não vira divergência", () => {
  const sold = [{ sku: "", description: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantity: 11 }];
  const check = checkProductionOrder(sold, parseGeneratedItems([
    { descricao: "Chinelo Slide 092601 - ANA MESTRE - Branco - 36/37", quantidade: "11", quantidade_gerada: "11" },
    { descricao: "LIVRO DIGITAL HUD LAB - Quantidade de Acessos", quantidade: "13", quantidade_gerada: "0", mensagem: "Não é possível gerar ordem de produção pois o produto não é do tipo 'Fabricado'." },
    { codigo: "LIVRO-DIG-HUDLAB-1", descricao: "LIVRO DIGITAL HUD LAB - Quantidade de Acessos", quantidade: "13", quantidade_gerada: "0", mensagem: "Não é possível gerar ordem de produção pois o produto não é do tipo 'Fabricado'." },
  ]));
  assert.equal(check.ok, true);
  assert.equal(check.lines.length, 1);
});

test("confere vendido contra gerado", () => {
  const sold = [
    { sku: "A-28", description: "A 28/29", quantity: 5 },
    { sku: "A-30", description: "A 30/31", quantity: 2 },
    { sku: "EBOOK", description: "Livro Digital", quantity: 1 },
  ];
  const ok = checkProductionOrder(sold, parseGeneratedItems([
    { codigo: "A-28", quantidade: "5", quantidade_gerada: "5" },
    { codigo: "A-30", quantidade: "2", quantidade_gerada: "2" },
  ]));
  assert.equal(ok.ok, true);

  const divergent = checkProductionOrder(sold, parseGeneratedItems([
    { codigo: "A-28", quantidade: "5", quantidade_gerada: "3", mensagem: "Estoque disponível" },
  ]));
  assert.equal(divergent.ok, false);
  assert.deepEqual(divergent.lines.map((line) => [line.sku, line.sold, line.generated, line.ok]), [
    ["A-28", 5, 3, false],
    ["A-30", 2, null, false],
  ]);
});

test("retorno vazio nunca conta como conferido", () => {
  assert.equal(checkProductionOrder([{ sku: "A", description: "A", quantity: 1 }], []).ok, false);
  assert.equal(checkProductionOrder([], []).ok, false);
});
