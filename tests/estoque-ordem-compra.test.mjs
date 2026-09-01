import assert from "node:assert/strict";
import test from "node:test";
import {
  aplicarRecebimentos,
  OC_SITUACAO,
  paresACaminho,
} from "../lib/estoque/ordem-compra.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Ids reais dos SKUs de solado no Tiny, para o teste falar a mesma língua. */
const P38 = 728159255;
const P40 = 728159280;
const P42 = 728159353;

const item = (produtoId, cor, numeracao, quantidade) => ({
  produtoId,
  descricao: `SOLA SLIDE - ${cor.toUpperCase()} ${numeracao}`,
  cor,
  numeracao,
  quantidade,
  preco: 12.6,
  recebido: 0,
});

const ordem = (over = {}) => ({
  id: 1,
  numeroPedido: null,
  data: "2026-08-19",
  dataPrevista: null,
  situacao: OC_SITUACAO.emAberto,
  fornecedor: "INPU",
  notaFiscal: null,
  itens: [],
  ...over,
});

const nota = (over = {}) => ({
  id: 1,
  numero: "017905",
  dataEmissao: "2026-08-28",
  itens: [],
  ...over,
});

const linha = (ordens, id, produtoId) =>
  ordens.find((o) => o.id === id).itens.find((i) => i.produtoId === produtoId);

// ── abatimento ──────────────────────────────────────────────────────────────

test("a nota abate a ordem mais antiga primeiro", () => {
  const antiga = ordem({ id: 2, data: "2026-08-19", itens: [item(P42, "Preto", "42/43", 120)] });
  const nova = ordem({ id: 3, data: "2026-08-27", itens: [item(P42, "Preto", "42/43", 213)] });

  const saida = aplicarRecebimentos(
    [nova, antiga],
    [nota({ itens: [{ produtoId: P42, quantidade: 75 }] })],
  );

  assert.equal(linha(saida, 2, P42).recebido, 75, "a de 19/08 recebe");
  assert.equal(linha(saida, 3, P42).recebido, 0, "a de 27/08 não");
});

test("o que passa da ordem mais antiga transborda para a seguinte", () => {
  const antiga = ordem({ id: 2, data: "2026-08-19", itens: [item(P42, "Preto", "42/43", 120)] });
  const nova = ordem({ id: 3, data: "2026-08-27", itens: [item(P42, "Preto", "42/43", 213)] });

  const saida = aplicarRecebimentos(
    [antiga, nova],
    [nota({ itens: [{ produtoId: P42, quantidade: 200 }] })],
  );

  assert.equal(linha(saida, 2, P42).recebido, 120, "enche a primeira");
  assert.equal(linha(saida, 3, P42).recebido, 80, "o resto vai para a segunda");
});

test("nota anterior à ordem não a abate", () => {
  // Caso real: a nota 017903 (17/08, 1.050 pares) é a remessa antiga, já
  // absorvida na contagem física. Sem este corte ela apagaria 1.050 pares de
  // "a caminho" da OC 2, criada só em 19/08.
  const oc2 = ordem({ id: 2, data: "2026-08-19", itens: [item(P40, "Preto", "40/41", 120)] });

  const saida = aplicarRecebimentos(
    [oc2],
    [nota({ dataEmissao: "2026-08-17", itens: [{ produtoId: P40, quantidade: 330 }] })],
  );

  assert.equal(linha(saida, 2, P40).recebido, 0);
  assert.deepEqual(paresACaminho(saida), [
    { cor: "Preto", numeracao: "40/41", pares: 120 },
  ]);
});

test("entrega parcial deixa o resto em 'a caminho'", () => {
  // O caso que motivou tudo: 85 pares de 1.100. Vincular a nota no Tiny marca
  // a OC como atendida e faria os outros 1.015 sumirem da conta.
  const oc2 = ordem({
    id: 2,
    itens: [
      item(P38, "Preto", "38/39", 100),
      item(P40, "Preto", "40/41", 120),
      item(P42, "Preto", "42/43", 120),
    ],
  });

  const saida = aplicarRecebimentos(
    [oc2],
    [
      nota({
        itens: [
          { produtoId: P38, quantidade: 5 },
          { produtoId: P40, quantidade: 5 },
          { produtoId: P42, quantidade: 75 },
        ],
      }),
    ],
  );

  assert.deepEqual(
    paresACaminho(saida).sort((a, b) => a.numeracao.localeCompare(b.numeracao)),
    [
      { cor: "Preto", numeracao: "38/39", pares: 95 },
      { cor: "Preto", numeracao: "40/41", pares: 115 },
      { cor: "Preto", numeracao: "42/43", pares: 45 },
    ],
  );
});

test("reaplicar as mesmas notas não abate duas vezes", () => {
  // `recebido` é sempre recalculado do zero: a leitura roda a cada atualização
  // da tela e não pode acumular sobre o resultado anterior.
  const oc = ordem({ id: 2, itens: [item(P42, "Preto", "42/43", 120)] });
  const notas = [nota({ itens: [{ produtoId: P42, quantidade: 75 }] })];

  const uma = aplicarRecebimentos([oc], notas);
  const outra = aplicarRecebimentos(uma, notas);

  assert.equal(linha(outra, 2, P42).recebido, 75);
});

test("ordem cancelada não absorve recebimento", () => {
  const cancelada = ordem({
    id: 2,
    data: "2026-08-19",
    situacao: OC_SITUACAO.cancelado,
    itens: [item(P42, "Preto", "42/43", 120)],
  });
  const viva = ordem({ id: 3, data: "2026-08-27", itens: [item(P42, "Preto", "42/43", 213)] });

  const saida = aplicarRecebimentos(
    [cancelada, viva],
    [nota({ itens: [{ produtoId: P42, quantidade: 50 }] })],
  );

  assert.equal(linha(saida, 2, P42).recebido, 0);
  assert.equal(linha(saida, 3, P42).recebido, 50);
});

test("recebimento sem ordem correspondente não vira crédito", () => {
  // Entrada avulsa, ou nota maior que o pedido. O saldo do Tiny já a
  // registrou; aqui ela só não tem o que abater — e não pode virar negativo.
  const oc = ordem({ id: 2, itens: [item(P42, "Preto", "42/43", 120)] });

  const saida = aplicarRecebimentos(
    [oc],
    [nota({ itens: [{ produtoId: P42, quantidade: 500 }] })],
  );

  assert.equal(linha(saida, 2, P42).recebido, 120);
  assert.deepEqual(paresACaminho(saida), []);
});

test("ordem sem data fica de fora do abatimento", () => {
  // Sem data não dá para saber se ela precede a nota. Ficar de fora mantém os
  // pares em "a caminho", que erra para o lado de comprar — não de faltar.
  const oc = ordem({ id: 2, data: null, itens: [item(P42, "Preto", "42/43", 120)] });

  const saida = aplicarRecebimentos(
    [oc],
    [nota({ itens: [{ produtoId: P42, quantidade: 75 }] })],
  );

  assert.equal(linha(saida, 2, P42).recebido, 0);
});

test("ordem marcada como atendida não some de 'a caminho'", () => {
  // O Tiny marca a ordem como atendida quando se vincula uma nota, mesmo numa
  // entrega parcial. Aconteceu de verdade com a OC 2: 85 recebidos de 1.100,
  // situacao virou "1", e os 1.015 restantes sumiram da conta.
  const oc = ordem({
    id: 2,
    situacao: OC_SITUACAO.atendido,
    itens: [item(P42, "Preto", "42/43", 120)],
  });

  const saida = aplicarRecebimentos(
    [oc],
    [nota({ itens: [{ produtoId: P42, quantidade: 75 }] })],
  );

  assert.deepEqual(paresACaminho(saida), [
    { cor: "Preto", numeracao: "42/43", pares: 45 },
  ]);
});
