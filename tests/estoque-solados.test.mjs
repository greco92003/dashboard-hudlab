import assert from "node:assert/strict";
import test from "node:test";
import {
  combinacoesSolado,
  curvaDeDemanda,
  montarResumo,
  NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP,
  parseSoladoDescricao,
  publicoDaNumeracao,
  SOLADO_PARAMETROS_PADRAO,
} from "../lib/estoque/solados.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

const sku = (cor, numeracao, saldo) => ({
  produtoId: `${cor}-${numeracao}`.length,
  descricao: `SOLA SLIDE - ${cor.toUpperCase()} ${numeracao}`,
  cor,
  numeracao,
  saldo,
});

let seq = 0;
const negocio = (over = {}) => ({
  dealId: `d${++seq}`,
  nome: "n",
  pipeline: "Atendimento",
  etapa: "Produção de Pedidos",
  dataEmbarque: null,
  itens: [],
  paresSemSolado: 0,
  ...over,
});

/** Parâmetros com a cobertura desligada, para isolar trava e lote. */
const semCobertura = { ...SOLADO_PARAMETROS_PADRAO, consumoMensalMedio: 0 };
/** 1.390 pares/mês ÷ 21 dias úteis × 15 = 993 pares de cobertura. */
const comCobertura = { ...SOLADO_PARAMETROS_PADRAO, consumoMensalMedio: 1390 };

const linha = (resumo, cor, numeracao) =>
  resumo.linhas.find((l) => l.cor === cor && l.numeracao === numeracao);

// ── leitura de dados ────────────────────────────────────────────────────────

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

test("a matriz cobre as 18 combinações, em ordem crescente de numeração", () => {
  const combos = combinacoesSolado();
  assert.equal(combos.length, 18);
  assert.equal(new Set(combos.map((c) => `${c.cor}${c.numeracao}`)).size, 18);
  assert.deepEqual(
    combos.slice(0, 4).map((c) => c.numeracao),
    ["28/29", "30/31", "32/33", "34/35"],
  );
});

// ── curva com teto de influência ────────────────────────────────────────────

test("um pedido gigante não domina a curva além do teto", () => {
  // Sem teto, o pedido de 900 valeria 90% da curva. Com teto de 10% ele é
  // reduzido a 100 pares e passa a valer o mesmo que o pedido pequeno.
  const negocios = [
    negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 900 }] }),
    negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 100 }] }),
  ];
  const semTeto = curvaDeDemanda(negocios, 1);
  assert.equal(semTeto.get("Preto|40/41"), 900);

  const comTeto = curvaDeDemanda(negocios, 0.1);
  assert.equal(comTeto.get("Preto|40/41"), 100);
  assert.equal(comTeto.get("Branco|36/37"), 100);
});

test("o teto reduz o pedido inteiro, preservando a grade interna dele", () => {
  const negocios = [
    negocio({
      itens: [
        { cor: "Preto", numeracao: "40/41", pares: 600 },
        { cor: "Preto", numeracao: "38/39", pares: 300 },
      ],
    }),
    negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 100 }] }),
  ];
  const curva = curvaDeDemanda(negocios, 0.1);
  // 900 pares reduzidos a 100, mantendo a proporção 2:1 entre as numerações.
  assert.equal(Math.round(curva.get("Preto|40/41")), 67);
  assert.equal(Math.round(curva.get("Preto|38/39")), 33);
});

// ── estoque mínimo ──────────────────────────────────────────────────────────

test("a cobertura de 15 dias úteis vira pares e se distribui pela curva", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", 0), sku("Branco", "36/37", 0)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 75 }] }),
      negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 25 }] }),
    ],
    // teto desligado: aqui o que se testa é a distribuição, não o corte
    parametros: { ...comCobertura, tetoInfluenciaPedido: 1 },
  });
  assert.equal(resumo.coberturaEmPares, 993);
  // 75% e 25% da cobertura.
  assert.equal(linha(resumo, "Preto", "40/41").minimo, 745);
  assert.equal(linha(resumo, "Branco", "36/37").minimo, 248);
});

test("com poucos pedidos o teto achata a curva, e isso é proposital", () => {
  // Dois pedidos: os dois passam de 10% do total, os dois são cortados, e a
  // curva vira meio a meio. Amostra pequena não merece confiança de curva —
  // achatar é o comportamento conservador. Com a janela real (dezenas de
  // pedidos) o teto só morde os gigantes.
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", 0), sku("Branco", "36/37", 0)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 75 }] }),
      negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 25 }] }),
    ],
    parametros: comCobertura,
  });
  assert.equal(linha(resumo, "Preto", "40/41").minimo, 497);
  assert.equal(linha(resumo, "Branco", "36/37").minimo, 497);
});

test("a trava levanta o mínimo de quem a curva deixaria abaixo dela", () => {
  const resumo = montarResumo({
    skus: [sku("Branco", "44/45", 0)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 1000 }] }),
    ],
    parametros: comCobertura,
  });
  const l = linha(resumo, "Branco", "44/45");
  assert.equal(l.curva, 0, "a curva não destina nada a este SKU");
  assert.equal(l.minimo, 20, "mas a trava garante 20");
  assert.equal(l.minimoTravado, true);
});

test("sem histórico de consumo, o mínimo é a trava e nada mais", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", 0)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 100 }] }),
    ],
    parametros: semCobertura,
  });
  assert.equal(resumo.coberturaEmPares, 0);
  assert.equal(linha(resumo, "Preto", "40/41").minimo, 20);
});

// ── projetado e compra ──────────────────────────────────────────────────────

test("o que está a caminho entra no projetado e reduz a compra", () => {
  const base = {
    skus: [sku("Preto", "40/41", -56)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 113 }] }),
    ],
    parametros: semCobertura,
  };
  const sem = montarResumo(base);
  const com = montarResumo({
    ...base,
    aCaminho: [{ cor: "Preto", numeracao: "40/41", pares: 120 }],
  });

  assert.equal(linha(sem, "Preto", "40/41").projetado, -169);
  assert.equal(linha(com, "Preto", "40/41").projetado, -49);
  assert.equal(linha(com, "Preto", "40/41").aCaminho, 120);
  // 120 pares a caminho tiram exatamente 120 da compra.
  assert.equal(
    linha(sem, "Preto", "40/41").sugestaoCompra -
      linha(com, "Preto", "40/41").sugestaoCompra,
    120,
  );
  assert.equal(com.totalACaminho, 120);
});

test("a compra sobe para o lote mínimo quando falta pouco", () => {
  // Saldo 19, mínimo 20: falta 1 par, mas o fornecedor só vende de 40 em 40.
  const resumo = montarResumo({
    skus: [sku("Branco", "28/29", 19)],
    negocios: [],
    parametros: semCobertura,
  });
  const l = linha(resumo, "Branco", "28/29");
  assert.equal(l.projetado, 19);
  assert.equal(l.sugestaoCompra, 40);
  assert.equal(l.compraArredondadaAoLote, true, "a tela precisa sinalizar isso");
});

test("acima do lote a compra é livre, sem arredondar", () => {
  const resumo = montarResumo({
    skus: [sku("Preto", "42/43", -135)],
    negocios: [
      negocio({ itens: [{ cor: "Preto", numeracao: "42/43", pares: 55 }] }),
    ],
    aCaminho: [{ cor: "Preto", numeracao: "42/43", pares: 120 }],
    parametros: semCobertura,
  });
  const l = linha(resumo, "Preto", "42/43");
  assert.equal(l.projetado, -70);
  assert.equal(l.sugestaoCompra, 90, "20 de mínimo + 70 de rombo");
  assert.equal(l.compraArredondadaAoLote, false);
});

test("estoque acima do mínimo não gera compra", () => {
  const resumo = montarResumo({
    skus: [sku("Branco", "42/43", 92)],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "42/43", pares: 15 }] }),
    ],
    parametros: semCobertura,
  });
  assert.equal(linha(resumo, "Branco", "42/43").sugestaoCompra, 0);
});

// ── exceção temporária e erros visíveis ─────────────────────────────────────

test("pedido legado, já baixado no cadastro do ERP, fica fora da necessidade", () => {
  const legado = [...NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP][0];
  const resumo = montarResumo({
    skus: [sku("Preto", "40/41", -56)],
    negocios: [
      negocio({
        dealId: legado,
        itens: [{ cor: "Preto", numeracao: "40/41", pares: 176 }],
      }),
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 113 }] }),
    ],
    parametros: semCobertura,
  });
  assert.equal(linha(resumo, "Preto", "40/41").necessidade, 113);
  assert.equal(resumo.legadosForaDaConta, 1);
  assert.equal(resumo.negocios.length, 1);
});

test("o pedido legado também não pesa na curva", () => {
  const legado = [...NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP][0];
  const resumo = montarResumo({
    skus: [],
    negocios: [
      negocio({
        dealId: legado,
        itens: [{ cor: "Branco", numeracao: "44/45", pares: 900 }],
      }),
      negocio({ itens: [{ cor: "Preto", numeracao: "40/41", pares: 100 }] }),
    ],
    parametros: comCobertura,
  });
  assert.equal(linha(resumo, "Branco", "44/45").curva, 0);
  assert.equal(linha(resumo, "Preto", "40/41").curva, 993);
});

test("a lista de legados é finita e some quando esvaziar", () => {
  // Guarda-corpo: se alguém adicionar um pedido novo aqui, este teste lembra
  // que a constante é temporária e tem data para morrer.
  assert.equal(NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP.size, 28);
  const semLegados = montarResumo({
    skus: [],
    negocios: [negocio()],
    parametros: semCobertura,
  });
  assert.equal(semLegados.legadosForaDaConta, 0);
});

test("demanda sem SKU correspondente aparece como erro, não some da conta", () => {
  const resumo = montarResumo({
    skus: [],
    negocios: [
      negocio({ itens: [{ cor: "Branco", numeracao: "36/37", pares: 8 }] }),
    ],
    parametros: semCobertura,
  });
  const l = linha(resumo, "Branco", "36/37");
  assert.equal(l.necessidade, 8);
  assert.equal(l.saldo, null);
  assert.equal(l.projetado, null);
  assert.equal(l.sugestaoCompra, null, "sem saldo não se sugere compra");
  assert.deepEqual(resumo.skusNaoEncontrados, ["SOLA SLIDE - BRANCO 36/37"]);
});

test("soma os pares de modelos que ficaram sem cor de solado", () => {
  const resumo = montarResumo({
    skus: [],
    negocios: [
      negocio({ paresSemSolado: 6 }),
      negocio({ paresSemSolado: 2 }),
    ],
    parametros: semCobertura,
  });
  assert.equal(resumo.paresSemSolado, 8);
});
