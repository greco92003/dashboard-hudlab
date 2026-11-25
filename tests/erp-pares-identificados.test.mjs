import assert from "node:assert/strict";
import test from "node:test";
import {
  etiquetasComPessoas,
  gradeDosPares,
  modelosComLista,
  quantidadeEsperada,
  romaneioPorSetor,
} from "../lib/erp/pares-identificados.ts";
import { parseLabelDescription } from "../lib/erp/production-labels.ts";
import { abbreviateColor, buildBaseSku, inferSoleColorFromCloner, normalizeColorName } from "../lib/erp/product-rules.ts";

const REF = "Chinelo Slide 112601 - CAROLINE ATLAS BRASIL - EVA Preto - Preto";
const pessoa = (nome, filial, setor, numeracao) => ({ nome, filial, setor, numeracao });
const extra = (numeracao) => ({ nome: null, filial: null, setor: null, numeracao });
const etiqueta = (size) => parseLabelDescription(`${REF} - ${size}`);

const pares = [
  pessoa("ZENIR", "Lajeado", "Costura 2", "37/38"),
  pessoa("ANA", "Bom Retiro", "Corte", "37/38"),
  pessoa("BRUNO", "Lajeado", "Costura 2", "35/36"),
  pessoa("CARLA", "Lajeado", "Corte", "44/45"),
  extra("37/38"),
  extra("33/34"),
];

test("a grade soma pessoas e extras por numeração, em ordem de tamanho", () => {
  assert.deepEqual(gradeDosPares(pares), [
    { size: "33/34", quantity: 1, audience: "adulto" },
    { size: "35/36", quantity: 1, audience: "adulto" },
    { size: "37/38", quantity: 3, audience: "adulto" },
    { size: "44/45", quantity: 1, audience: "adulto" },
  ]);
});

test("com lista, o pedido vira um modelo só e a quantidade é a da lista", () => {
  const [modelo, ...resto] = modelosComLista([], pares);
  assert.equal(resto.length, 0);
  assert.equal(modelo.totalPairs, 6);
  assert.equal(modelo.soleColor, "EVA Preto");
  assert.equal(quantidadeEsperada(895, pares), 6);
  assert.equal(quantidadeEsperada(895, []), 895);
  const daFicha = [{ modelNumber: 3, audience: "adulto", soleColor: "Branco", artUrl: "x", grades: [], totalPairs: 0 }];
  assert.equal(modelosComLista(daFicha, []), daFicha);
});

test("etiquetas: cada pessoa na sua numeração, ordenadas por filial/setor/nome, extras no fim", () => {
  const labels = ["33/34", "35/36", "37/38", "37/38", "37/38", "44/45"].map(etiqueta);
  const resultado = etiquetasComPessoas(labels, pares);
  assert.deepEqual(
    resultado.map((label) => label.pessoa ? `${label.pessoa.filial}|${label.pessoa.setor}|${label.pessoa.nome}|${label.size}` : `extra|${label.size}`),
    [
      "Bom Retiro|Corte|ANA|37/38",
      "Lajeado|Corte|CARLA|44/45",
      "Lajeado|Costura 2|BRUNO|35/36",
      "Lajeado|Costura 2|ZENIR|37/38",
      "extra|33/34",
      "extra|37/38",
    ],
  );
});

test("etiquetas: pedido com menos pares do que pessoas para com erro claro", () => {
  const labels = ["33/34", "35/36", "37/38", "44/45"].map(etiqueta);
  assert.throws(() => etiquetasComPessoas(labels, pares), /37\/38: faltam 1/);
});

test("romaneio: uma filial + setor por caixa e os extras em caixas próprias", () => {
  const linhas = [
    { reference: REF, size: "33/34", quantity: 1 },
    { reference: REF, size: "35/36", quantity: 1 },
    { reference: REF, size: "37/38", quantity: 3 },
    { reference: REF, size: "44/45", quantity: 1 },
  ];
  const grupos = romaneioPorSetor(linhas, pares);
  assert.deepEqual(
    grupos.map((grupo) => [grupo.filial, grupo.setor, grupo.volumes.map((volume) => volume.lines.map((line) => `${line.size}x${line.quantity}`).join(","))]),
    [
      ["Bom Retiro", "Corte", ["37/38x1"]],
      ["Lajeado", "Corte", ["44/45x1"]],
      ["Lajeado", "Costura 2", ["35/36x1,37/38x1"]],
      [null, null, ["33/34x1,37/38x1"]],
    ],
  );
  const total = grupos.flatMap((grupo) => grupo.volumes).reduce((sum, volume) => sum + volume.pairs, 0);
  assert.equal(total, 6);
});

test("romaneio: setor grande ocupa várias caixas sem misturar com outro setor", () => {
  const muitos = Array.from({ length: 20 }, (_, index) => pessoa(`P${index}`, "Lajeado", "Montagem", "39/40"));
  const grupos = romaneioPorSetor([{ reference: REF, size: "39/40", quantity: 21 }], [...muitos, pessoa("X", "Teutônia", "PU", "39/40")]);
  assert.deepEqual(grupos.map((grupo) => [grupo.setor, grupo.volumes.map((volume) => volume.pairs)]), [
    ["Montagem", [18, 2]],
    ["PU", [1]],
  ]);
});

test("romaneio: falta de pares no pedido não passa em silêncio", () => {
  assert.throws(() => romaneioPorSetor([{ reference: REF, size: "37/38", quantity: 1 }], pares), /faltam/);
});

test("cloner com sola EVA gera título e SKU sem confundir com a sola PVC", () => {
  const sole = inferSoleColorFromCloner("Chinelo Slide CLONER - SOLA (EVA PRETO) / GÁSPEA (PRETO)");
  assert.equal(sole, "EVA Preto");
  assert.equal(normalizeColorName("eva preta"), "EVA Preto");
  assert.equal(abbreviateColor("EVA Preto"), "EVAPRT");
  assert.equal(abbreviateColor("Preto"), "PRT");
  assert.equal(buildBaseSku("Caroline Atlas Brasil", "Preto", "adulto", sole), "CH-SL-CAROLINE-ATLAS-BRASIL-EVAPRT-PRT");
});
