import test from "node:test";
import assert from "node:assert/strict";
import { mergeTinyCreatedProductResponse } from "../lib/erp/tiny-created-product.ts";
import { buildTinyV2ManufacturedProduct } from "../lib/erp/tiny-manufacturing-payload.ts";
import {
  tinyClonerBasePrice,
  tinyClonerVariationPrice,
} from "../lib/erp/tiny-cloner-prices.ts";

test("vincula os IDs retornados pelo Tiny às variações pelo SKU", () => {
  const draft = {
    sku: "CH-SL-AFK-PRT",
    descricao: "Produto",
    tipo: "V",
    variacoes: [
      {
        sku: "CH-SL-AFK-PRT-3435",
        grade: [{ chave: "Tamanho", valor: "34/35" }],
      },
      {
        sku: "CH-SL-AFK-PRT-3637",
        grade: [{ chave: "Tamanho", valor: "36/37" }],
      },
    ],
  };

  const product = mergeTinyCreatedProductResponse(draft, {
    id: 760900000,
    codigo: "CH-SL-AFK-PRT",
    descricao: "Produto",
    variacoes: [
      {
        id: 760900002,
        codigo: "ch-sl-afk-prt-3637",
        descricao: "Produto 36/37",
      },
      {
        id: 760900001,
        codigo: "CH-SL-AFK-PRT-3435",
        descricao: "Produto 34/35",
      },
    ],
  });

  assert.equal(product.id, 760900000);
  assert.deepEqual(
    product.variacoes?.map((variation) => ({
      id: variation.id,
      sku: variation.sku,
      size: variation.grade?.[0]?.valor,
    })),
    [
      { id: 760900001, sku: "CH-SL-AFK-PRT-3435", size: "34/35" },
      { id: 760900002, sku: "CH-SL-AFK-PRT-3637", size: "36/37" },
    ],
  );
});

test("não inventa ID quando a resposta do Tiny não contém a variação", () => {
  const product = mergeTinyCreatedProductResponse(
    {
      sku: "PAI",
      tipo: "V",
      variacoes: [
        {
          sku: "PAI-3435",
          grade: [{ chave: "Tamanho", valor: "34/35" }],
        },
      ],
    },
    { id: 10, codigo: "PAI", variacoes: [] },
  );

  assert.equal(product.variacoes?.[0]?.id, undefined);
});
test("monta uma variação Fabricada com estrutura e etapa em um registro v2", () => {
  const record = buildTinyV2ManufacturedProduct({
    target: {
      id: 760916918,
      sku: "CH-SL-AFK-PRT-3435",
      descricao: "Chinelo 34/35",
      grade: [{ chave: "Tamanho - Slide", valor: "34/35" }],
      unidade: "PR",
      ncm: "64022000",
      origem: 0,
      precos: { preco: 49.9 },
    },
    source: {
      id: 100,
      sku: "CLONER-3435",
      tipo: "F",
      producao: {
        produtos: [{
          produto: { id: 200, sku: "MATERIA-PRIMA", descricao: "Matéria-prima" },
          quantidade: 2,
        }],
        etapas: ["Montagem"],
      },
    },
  }, 1);

  assert.deepEqual(record, {
    produto: {
      sequencia: 1,
      id: 760916918,
      codigo: "CH-SL-AFK-PRT-3435",
      nome: "Chinelo 34/35",
      unidade: "PR",
      preco: 49.9,
      ncm: "64022000",
      origem: "0",
      situacao: "A",
      tipo: "P",
      classe_produto: "F",
      grade: { "Tamanho - Slide": "34/35" },
      estrutura: [{ item: {
        id_produto: 200,
        descricao: "Matéria-prima",
        quantidade: 2,
      } }],
      etapas: [{ etapa: { nome: "Montagem" } }],
    },
  });
});

test("não aceita concluir uma variação Fabricada sem estrutura ou etapa", () => {
  assert.throws(
    () => buildTinyV2ManufacturedProduct({
      target: { id: 10, sku: "PRODUTO", descricao: "Produto", precos: { preco: 1 } },
      source: { id: 20, sku: "CLONER", tipo: "F", producao: {} },
    }, 1),
    /não possui estrutura ou etapa de produção/,
  );
});
test("informa preço em todas as variações quando o cloner infantil retorna preço nulo", () => {
  const cloner = {
    precos: { preco: 59.9 },
    variacoes: [
      { precos: { preco: null } },
      { precos: null },
      {},
    ],
  };

  assert.equal(tinyClonerBasePrice(cloner), 59.9);
  assert.deepEqual(
    cloner.variacoes.map((variation) => tinyClonerVariationPrice(cloner, variation)),
    [59.9, 59.9, 59.9],
  );
});

test("envia preço zero explícito quando o cloner não possui nenhum preço", () => {
  const cloner = {
    precos: null,
    variacoes: [{ precos: { preco: null } }],
  };

  assert.equal(tinyClonerBasePrice(cloner), 0);
  assert.equal(tinyClonerVariationPrice(cloner, cloner.variacoes[0]), 0);
});
