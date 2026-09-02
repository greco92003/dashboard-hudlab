import assert from "node:assert/strict";
import test from "node:test";
import { OC_SITUACAO, paresACaminho } from "../lib/estoque/ordem-compra.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

const item = (cor, numeracao, quantidade, recebido = 0) => ({
  produtoId: `${cor}${numeracao}`.length,
  descricao: `SOLA SLIDE - ${cor.toUpperCase()} ${numeracao}`,
  cor,
  numeracao,
  quantidade,
  preco: 12.6,
  recebido,
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

const ordenado = (lista) =>
  [...lista].sort((a, b) =>
    `${a.cor}${a.numeracao}`.localeCompare(`${b.cor}${b.numeracao}`),
  );

// ── "a caminho" ─────────────────────────────────────────────────────────────

test("soma o que falta de cada ordem, por cor e numeração", () => {
  const ordens = [
    ordem({ id: 2, itens: [item("Preto", "40/41", 120), item("Branco", "36/37", 120)] }),
    ordem({ id: 3, itens: [item("Preto", "40/41", 346)] }),
  ];
  assert.deepEqual(ordenado(paresACaminho(ordens)), [
    { cor: "Branco", numeracao: "36/37", pares: 120 },
    { cor: "Preto", numeracao: "40/41", pares: 466 },
  ]);
});

test("o recebido da nota vinculada abate a linha", () => {
  const ordens = [ordem({ id: 4, itens: [item("Preto", "42/43", 120, 75)] })];
  assert.deepEqual(paresACaminho(ordens), [
    { cor: "Preto", numeracao: "42/43", pares: 45 },
  ]);
});

test("ordem cancelada não traz nada", () => {
  const ordens = [
    ordem({ id: 2, situacao: OC_SITUACAO.cancelado, itens: [item("Preto", "40/41", 120)] }),
  ];
  assert.deepEqual(paresACaminho(ordens), []);
});

test("ordem atendida e completa some pela aritmética, não pelo status", () => {
  // Processo acordado com o time: o recebido vira uma OC própria, com a nota
  // vinculada, e o Tiny a marca como atendida. Aqui ela zera porque
  // quantidade == recebido — não porque o status diz "atendida".
  const oc4 = ordem({
    id: 4,
    data: "2026-09-02",
    situacao: OC_SITUACAO.atendido,
    itens: [
      item("Preto", "38/39", 5, 5),
      item("Preto", "40/41", 5, 5),
      item("Preto", "42/43", 75, 75),
    ],
  });
  assert.deepEqual(paresACaminho([oc4]), []);
});

test("ordem atendida com entrega parcial NÃO some da conta", () => {
  // O Tiny marca a ordem como atendida ao vincular a nota, mesmo parcial.
  // Aconteceu com a OC 2: 85 recebidos de 1.100, status virou "atendida", e os
  // 1.015 restantes sumiram de "a caminho" sem nenhum aviso.
  const parcial = ordem({
    id: 2,
    situacao: OC_SITUACAO.atendido,
    itens: [item("Preto", "42/43", 120, 75)],
  });
  assert.deepEqual(paresACaminho([parcial]), [
    { cor: "Preto", numeracao: "42/43", pares: 45 },
  ]);
});

test("recebido acima do pedido não vira crédito negativo", () => {
  const ordens = [ordem({ id: 2, itens: [item("Preto", "42/43", 120, 500)] })];
  assert.deepEqual(paresACaminho(ordens), []);
});

test("item sem cor ou numeração reconhecida fica de fora", () => {
  // Produto novo cadastrado fora do padrão "SOLA SLIDE - COR NUM" não vira
  // linha da matriz: melhor não aparecer do que aparecer no lugar errado.
  const ordens = [
    ordem({
      id: 2,
      itens: [
        { ...item("Preto", "40/41", 120), cor: null, numeracao: null },
        item("Preto", "42/43", 40),
      ],
    }),
  ];
  assert.deepEqual(paresACaminho(ordens), [
    { cor: "Preto", numeracao: "42/43", pares: 40 },
  ]);
});
