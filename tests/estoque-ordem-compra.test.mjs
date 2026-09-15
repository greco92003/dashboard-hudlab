import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidarCompras,
  OC_SITUACAO,
  paresACaminho,
} from "../lib/estoque/ordem-compra.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Ids reais dos SKUs no Tiny, para o teste falar a mesma língua. */
const P40 = 728159280;
const P42 = 728159353;
const B36 = 728159007;
const B40 = 728159134;

const SKU = {
  [P40]: ["Preto", "40/41"],
  [P42]: ["Preto", "42/43"],
  [B36]: ["Branco", "36/37"],
  [B40]: ["Branco", "40/41"],
};

const item = (produtoId, quantidade) => {
  const [cor, numeracao] = SKU[produtoId];
  return {
    produtoId,
    descricao: `SOLA SLIDE - ${cor.toUpperCase()} ${numeracao}`,
    cor,
    numeracao,
    quantidade,
    preco: 12.6,
  };
};

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
  numero: "017907",
  dataEmissao: "2026-09-03",
  itens: [],
  ...over,
});

const linha = (consolidado, produtoId) =>
  consolidado.find((l) => l.produtoId === produtoId);

// ── consolidação ────────────────────────────────────────────────────────────

test("soma o pedido de todas as ordens e subtrai o recebido das notas", () => {
  const consolidado = consolidarCompras(
    [
      ordem({ id: 2, itens: [item(P40, 115), item(P42, 45)] }),
      ordem({ id: 3, itens: [item(P40, 346), item(P42, 213)] }),
    ],
    [nota({ itens: [{ produtoId: P42, quantidade: 75 }] })],
  );

  assert.deepEqual(
    { ...linha(consolidado, P40) },
    { produtoId: P40, cor: "Preto", numeracao: "40/41", pedido: 461, recebido: 0, faltando: 461 },
  );
  assert.deepEqual(
    { ...linha(consolidado, P42) },
    { produtoId: P42, cor: "Preto", numeracao: "42/43", pedido: 258, recebido: 75, faltando: 183 },
  );
});

test("o desmembramento do Tiny não conta duas vezes", () => {
  // Caso real de 14/09. A OC 2 tinha 540 pares de branco; ao aplicar a nota, o
  // Tiny reduziu a original e criou a OC 5 com o que entrou — e a filha nasce
  // "em andamento", SEM nota vinculada. Somando as duas e subtraindo a nota, o
  // líquido fica certo sozinho: a duplicata e o abatimento se anulam.
  const mae = ordem({ id: 2, itens: [item(P40, 475)] });
  const filha = ordem({
    id: 5,
    data: "2026-09-14",
    situacao: OC_SITUACAO.emAndamento,
    itens: [item(B36, 120), item(B40, 120)],
  });
  const consolidado = consolidarCompras(
    [mae, filha],
    [
      nota({
        itens: [
          { produtoId: B36, quantidade: 120 },
          { produtoId: B40, quantidade: 120 },
        ],
      }),
    ],
  );

  assert.equal(linha(consolidado, B36).faltando, 0, "branco chegou inteiro");
  assert.equal(linha(consolidado, B40).faltando, 0);
  assert.equal(linha(consolidado, P40).faltando, 475, "o preto continua vindo");
  assert.deepEqual(paresACaminho(consolidado), [
    { cor: "Preto", numeracao: "40/41", pares: 475 },
  ]);
});

test("ordem cancelada não entra no pedido", () => {
  const consolidado = consolidarCompras(
    [
      ordem({ id: 2, situacao: OC_SITUACAO.cancelado, itens: [item(P40, 120)] }),
      ordem({ id: 3, itens: [item(P40, 50)] }),
    ],
    [],
  );
  assert.equal(linha(consolidado, P40).pedido, 50);
});

test("atendida e em andamento continuam contando", () => {
  // O Tiny usa os dois estados no desmembramento. Cortar por status faria o
  // saldo de uma entrega parcial sumir sem aviso — foi o que aconteceu com a
  // OC 2 em setembro, 85 recebidos de 1.100 e 1.015 invisíveis.
  const consolidado = consolidarCompras(
    [
      ordem({ id: 4, situacao: OC_SITUACAO.atendido, itens: [item(P40, 5)] }),
      ordem({ id: 5, situacao: OC_SITUACAO.emAndamento, itens: [item(P40, 60)] }),
    ],
    [],
  );
  assert.equal(linha(consolidado, P40).faltando, 65);
});

test("recebido acima do pedido não vira saldo negativo", () => {
  const consolidado = consolidarCompras(
    [ordem({ id: 2, itens: [item(P42, 120)] })],
    [nota({ itens: [{ produtoId: P42, quantidade: 500 }] })],
  );
  assert.equal(linha(consolidado, P42).faltando, 0);
  assert.deepEqual(paresACaminho(consolidado), []);
});

test("nota de produto que ninguém pediu não quebra nem abate", () => {
  // Entrada avulsa: o saldo do Tiny já a registrou, aqui ela não tem o que
  // abater.
  const consolidado = consolidarCompras(
    [ordem({ id: 2, itens: [item(P40, 100)] })],
    [nota({ itens: [{ produtoId: B36, quantidade: 999 }] })],
  );
  assert.equal(consolidado.length, 1);
  assert.equal(linha(consolidado, P40).faltando, 100);
});

test("item sem cor ou numeração reconhecida fica de fora", () => {
  const consolidado = consolidarCompras(
    [
      ordem({
        id: 2,
        itens: [{ ...item(P40, 120), cor: null, numeracao: null }, item(P42, 40)],
      }),
    ],
    [],
  );
  assert.deepEqual(paresACaminho(consolidado), [
    { cor: "Preto", numeracao: "42/43", pares: 40 },
  ]);
});

test("a mesma numeração em ordens diferentes vira uma linha só", () => {
  const consolidado = consolidarCompras(
    [
      ordem({ id: 2, itens: [item(P40, 115)] }),
      ordem({ id: 3, itens: [item(P40, 346)] }),
      ordem({ id: 4, situacao: OC_SITUACAO.atendido, itens: [item(P40, 5)] }),
    ],
    [nota({ itens: [{ produtoId: P40, quantidade: 5 }] })],
  );
  assert.equal(consolidado.length, 1);
  assert.deepEqual(paresACaminho(consolidado), [
    { cor: "Preto", numeracao: "40/41", pares: 461 },
  ]);
});
