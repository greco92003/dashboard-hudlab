import assert from "node:assert/strict";
import test from "node:test";
import {
  combinacoesSolado,
  montarResumo,
  NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP,
  parseSoladoDescricao,
  publicoDaNumeracao,
} from "../lib/estoque/solados.ts";

test("lê cor e numeração da descrição do Tiny, tolerando espaço duplo", () => {
  assert.deepEqual(parseSoladoDescricao("SOLA SLIDE - PRETO 40/41"), {
    cor: "Preto",
    numeracao: "40/41",
  });
  // Este SKU está cadastrado com espaço duplo no Tiny.
  assert.deepEqual(parseSoladoDescricao("SOLA SLIDE - BRANCO  44/45"), {
    cor: "Branco",
    numeracao: "44/45",
  });
  // O produto legado sem cor nem numeração não pode virar linha da matriz.
  assert.equal(parseSoladoDescricao("SOLA SLIDE"), null);
  assert.equal(parseSoladoDescricao("NAPA WAY 3MM PRETO"), null);
  assert.equal(parseSoladoDescricao(null), null);
});

test("separa numeração infantil de adulta", () => {
  assert.equal(publicoDaNumeracao("30/31"), "infantil");
  assert.equal(publicoDaNumeracao("40/41"), "adulto");
});

test("a matriz cobre as 18 combinações de cor e numeração", () => {
  const combos = combinacoesSolado();
  assert.equal(combos.length, 18);
  assert.equal(new Set(combos.map((c) => `${c.cor}${c.numeracao}`)).size, 18);
  // Ordem crescente de numeração dentro de cada cor: infantil antes de adulto.
  assert.deepEqual(
    combos.slice(0, 4).map((c) => c.numeracao),
    ["28/29", "30/31", "32/33", "34/35"],
  );
});

const sku = (cor, numeracao, saldo, minimo = 0) => ({
  produtoId: `${cor}-${numeracao}`.length,
  descricao: `SOLA SLIDE - ${cor.toUpperCase()} ${numeracao}`,
  cor,
  numeracao,
  saldo,
  minimo,
});

const negocio = (over) => ({
  dealId: "d",
  nome: "n",
  pipeline: "Atendimento",
  etapa: "Produção de Pedidos",
  dataEmbarque: null,
  itens: [],
  paresSemSolado: 0,
  ...over,
});

test("todo pedido da janela conta uma vez, sem netting", () => {
  // Com a baixa no faturamento, nenhum pedido da janela foi descontado do Tiny
  // ainda — inclusive os que já foram produzidos e esperam nota.
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", 120)],
    negocios: [
      negocio({
        dealId: "a",
        etapa: "Produção de Pedidos",
        itens: [{ cor: "Preto", numeracao: "40/41", pares: 176 }],
      }),
      negocio({
        dealId: "b",
        etapa: "Expedição",
        itens: [{ cor: "Preto", numeracao: "40/41", pares: 113 }],
      }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Preto" && l.numeracao === "40/41",
  );
  assert.equal(linha.necessidade, 289);
  assert.equal(linha.projetado, -169);
  assert.equal(linha.sugestaoCompra, 169);
});

test("sugestão de compra cobre a necessidade e ainda deixa o estoque mínimo", () => {
  const resumo = montarResumo({
    skus: [sku("Branco", "38/39", 50, 100)],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "38/39", pares: 17 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Branco" && l.numeracao === "38/39",
  );
  assert.equal(linha.projetado, 33);
  assert.equal(linha.sugestaoCompra, 67);
});

test("sem mínimo definido, a sugestão só cobre o que falta", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "42/43", -42, 0)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "42/43", pares: 55 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Preto" && l.numeracao === "42/43",
  );
  assert.equal(linha.projetado, -97);
  assert.equal(linha.sugestaoCompra, 97);
});

test("saldo negativo é falta real e entra inteiro na compra", () => {
  // Saldo negativo no Tiny são solados já faturados que não existem. É falta
  // real e entra inteira na compra, somada à demanda ainda não faturada.
  const resumo = montarResumo({
    skus: [sku("Branco", "38/39", -171, 0)],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "38/39", pares: 17 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Branco" && l.numeracao === "38/39",
  );
  assert.equal(linha.saldoNegativo, true);
  assert.equal(linha.projetado, -188);
  assert.equal(linha.sugestaoCompra, 188);
});

test("saldo negativo com estoque mínimo soma o mínimo à compra", () => {
  const resumo = montarResumo({
    skus: [sku("Branco", "40/41", -169, 60)],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "40/41", pares: 13 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Branco" && l.numeracao === "40/41",
  );
  assert.equal(linha.projetado, -182);
  assert.equal(linha.sugestaoCompra, 242);
});

test("saldo sobrando não gera sugestão de compra", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "38/39", 70)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "38/39", pares: 50 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Preto" && l.numeracao === "38/39",
  );
  assert.equal(linha.sugestaoCompra, 0);
});

test("demanda sem SKU correspondente aparece como erro, não some da conta", () => {
  const resumo = montarResumo({
    skus: [],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 8 }] }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Branco" && l.numeracao === "36/37",
  );
  assert.equal(linha.necessidade, 8);
  assert.equal(linha.saldo, null);
  assert.equal(linha.projetado, null);
  assert.equal(linha.sugestaoCompra, null);
  assert.deepEqual(resumo.skusNaoEncontrados, ["SOLA SLIDE - BRANCO 36/37"]);
});

test("soma os pares de modelos que ficaram sem cor de solado", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", 10)],
    negocios: [
      negocio({ dealId: "a", paresSemSolado: 6 }),
      negocio({ dealId: "b", paresSemSolado: 2 }),
    ],
  });
  assert.equal(resumo.paresSemSolado, 8);
});

test("pedido legado, já baixado no cadastro do ERP, fica fora da necessidade", () => {
  // Estes pedidos já saíram do saldo do Tiny sob a regra antiga e não serão
  // baixados de novo no faturamento. Contá-los desconta duas vezes.
  const legado = [...NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP][0];
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", -56)],
    negocios: [
      negocio({
        dealId: legado,
        itens: [{ cor: "Preto", numeracao: "40/41", pares: 176 }],
      }),
      negocio({
        dealId: "novo",
        itens: [{ cor: "Preto", numeracao: "40/41", pares: 113 }],
      }),
    ],
  });
  const linha = resumo.linhas.find(
    (l) => l.cor === "Preto" && l.numeracao === "40/41",
  );
  assert.equal(linha.necessidade, 113, "só o pedido novo conta");
  assert.equal(linha.projetado, -169);
  assert.equal(resumo.legadosForaDaConta, 1);
  assert.equal(resumo.negocios.length, 1);
});

test("pares sem cor de solado de pedido legado não entram no alerta", () => {
  const legado = [...NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP][0];
  const resumo = montarResumo({
    skus: [],
    negocios: [
      negocio({ dealId: legado, paresSemSolado: 40 }),
      negocio({ dealId: "novo", paresSemSolado: 6 }),
    ],
  });
  assert.equal(resumo.paresSemSolado, 6);
});

test("a lista de legados é finita e some quando esvaziar", () => {
  // Guarda-corpo: se alguém adicionar um pedido novo aqui, este teste lembra
  // que a constante é temporária e tem data para morrer.
  assert.equal(NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP.size, 28);
  const semLegados = montarResumo({
    skus: [sku("Preto", "40/41", 10)],
    negocios: [negocio({ dealId: "novo" })],
  });
  assert.equal(semLegados.legadosForaDaConta, 0);
});
