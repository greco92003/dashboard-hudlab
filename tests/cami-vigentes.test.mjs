import test from "node:test";
import assert from "node:assert/strict";
import {
  avisosAtivos,
  contextoVigentes,
  isoToLocalInput,
  localInputToIso,
  descontoDaFaixa,
  precoComPromocao,
  promocaoAtiva,
  resumoDesconto,
  vigencia,
} from "../lib/ghl/ai-seller/vigentes.ts";
import { normalizeSettings, validateSettingsInput } from "../lib/ghl/ai-seller/settings-shape.ts";
import { executeTool } from "../lib/ghl/ai-seller/tools.ts";
import { buildContextText } from "../lib/ghl/ai-seller/prompt.ts";

const brt = (local) => Date.parse(`${local}-03:00`);
const fechaMes = {
  nome: "Fecha Mês",
  inicio: "2026-10-25T00:00:00-03:00",
  fim: "2026-10-31T23:59:00-03:00",
  descontoPct: 5,
  minPares: 12,
  texto: "Fecha Mês: 5% nos pares até 31/10.",
};

test("vigência: agendada, ativa, encerrada sozinha no fim", () => {
  assert.equal(vigencia(fechaMes, brt("2026-10-24T23:00:00")), "agendada");
  assert.equal(vigencia(fechaMes, brt("2026-10-25T00:00:00")), "ativa");
  assert.equal(vigencia(fechaMes, brt("2026-10-31T23:59:00")), "encerrada");
  assert.equal(promocaoAtiva(fechaMes, brt("2026-10-28T10:00:00")), fechaMes);
  assert.equal(promocaoAtiva(fechaMes, brt("2026-11-01T10:00:00")), null);
  assert.equal(promocaoAtiva(null, Date.now()), null);
  const aviso = { texto: "Férias coletivas", inicio: "2026-12-20T00:00:00-03:00", fim: "2027-01-05T23:59:00-03:00" };
  assert.deepEqual(avisosAtivos([aviso], brt("2026-12-25T10:00:00")), [aviso]);
  assert.deepEqual(avisosAtivos([aviso], brt("2026-10-25T10:00:00")), []);
});

test("preço com promoção em centavos: 59,90 com 5% = 56,91; subtotal = par × pares", () => {
  assert.deepEqual(precoComPromocao(12, fechaMes), {
    unitario: 56.91,
    subtotal: 682.92,
    unitarioCheio: 59.9,
    subtotalCheio: 718.8,
    aplicada: true,
    descontoPct: 5,
    pixDescontoPct: 10,
    pixUnitario: 53.91,
    pixSubtotal: 646.92,
  });
  assert.equal(precoComPromocao(24, fechaMes).unitario, 55.01);
  assert.equal(precoComPromocao(20, { ...fechaMes, minPares: 24 }).aplicada, false);
  assert.equal(precoComPromocao(20, { ...fechaMes, minPares: 24 }).unitario, 59.9);
  assert.equal(precoComPromocao(8, fechaMes), null);
  assert.equal(precoComPromocao(12, null).subtotal, 718.8);
  // Sem promoção, o PIX é só os 5% da forma de pagamento.
  assert.equal(precoComPromocao(12, null).pixUnitario, 56.91);
  assert.equal(precoComPromocao(12, null).pixDescontoPct, 5);
});

test("orçamento da Cami com promoção: grava o valor com desconto e conta a promoção", async () => {
  const calls = [];
  const actions = {
    async writeBudget(input) {
      calls.push(input);
    },
    async quoteFreight() {
      return 119;
    },
  };
  const call = { call_id: "c1", name: "atualizar_orcamento", arguments: JSON.stringify({ pares: 12, cep: "01001-000" }) };
  const result = await executeTool(call, actions, { promocao: fechaMes });
  assert.deepEqual(calls[0], { pares: 12, unitario: 56.91, subtotal: 682.92, frete: 119 });
  const out = JSON.parse(result.output);
  assert.equal(out.total, 801.92);
  assert.deepEqual(out.pix, { desconto_pct: 10, valor_unitario: 53.91, subtotal: 646.92, total: 765.92 });
  assert.deepEqual(out.promocao, {
    nome: "Fecha Mês",
    desconto_pct: 5,
    valida_ate: "31/10 23:59",
    valor_unitario_sem_promocao: 59.9,
    subtotal_sem_promocao: 718.8,
  });
  // Sem promoção, como antes.
  const sem = JSON.parse((await executeTool(call, actions)).output);
  assert.equal(sem.valor_unitario, 59.9);
  assert.equal(sem.promocao, null);
});

test("contexto da Cami: promoção e avisos que valem agora", () => {
  assert.equal(contextoVigentes(null, []), "");
  const texto = contextoVigentes(fechaMes, [{ texto: "Férias coletivas em janeiro.", inicio: "2026-10-01T00:00:00-03:00", fim: "2026-11-30T23:59:00-03:00" }]);
  assert.match(texto, /Promoção vigente "Fecha Mês": 5% de desconto/);
  assert.match(texto, /até 31\/10 23:59/);
  assert.match(texto, /valor no PIX à vista \(mais 5% sobre a tabela\)/);
  assert.match(texto, /prevalecem sobre o manual/);
  assert.match(texto, /Como apresentar: Fecha Mês: 5% nos pares até 31\/10\./);
  assert.match(texto, /Aviso até 30\/11 23:59: Férias coletivas em janeiro\./);
  const ctx = buildContextText({ today: "28/10/2026", contactName: "Ana", pipelineName: null, stageName: null, crmPares: 12, crmValor: null, vigentes: texto });
  assert.match(ctx, /Regras comerciais vigentes agora/);
});

test("campo de data do Controle: Brasília ida e volta", () => {
  assert.equal(localInputToIso("2026-10-25T00:00"), "2026-10-25T00:00:00-03:00");
  assert.equal(localInputToIso("25/10/2026"), null);
  assert.equal(isoToLocalInput("2026-10-25T00:00:00-03:00"), "2026-10-25T00:00");
  assert.equal(isoToLocalInput("2026-10-25T03:00:00.000Z"), "2026-10-25T00:00");
});

test("Controle: promoção e avisos validados ao salvar, lidos com folga do banco", () => {
  const base = {
    estado: "ligada",
    minPares: 12,
    maxPares: 24,
    escalationName: "Schay",
    shifts: [["08:30", "12:00"]],
    custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
    alertas: { passagemSemRespostaMin: 60, ownerAposMin: 120, resumoDiario: true },
  };
  const ok = validateSettingsInput({ ...base, promocao: fechaMes, avisos: [] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.row.promocao, fechaMes);
  assert.equal(validateSettingsInput({ ...base, promocao: null }).row.promocao, null);
  assert.match(validateSettingsInput({ ...base, promocao: { ...fechaMes, fim: fechaMes.inicio } }).error, /fim precisa ser depois/);
  assert.match(validateSettingsInput({ ...base, promocao: { ...fechaMes, descontoPct: 40 } }).error, /entre 0 e 30/);
  assert.match(validateSettingsInput({ ...base, promocao: { ...fechaMes, minPares: 6 } }).error, /12 ou mais/);
  assert.match(validateSettingsInput({ ...base, promocao: { ...fechaMes, nome: "" } }).error, /nome/);
  assert.match(validateSettingsInput({ ...base, avisos: [{ texto: "oi", inicio: fechaMes.inicio, fim: fechaMes.fim }] }).error, /Aviso 1/);

  assert.deepEqual(normalizeSettings({ promocao: fechaMes, avisos: "lixo" }).promocao, fechaMes);
  assert.deepEqual(normalizeSettings({ promocao: fechaMes, avisos: "lixo" }).avisos, []);
  assert.equal(normalizeSettings({ promocao: { nome: "x" } }).promocao, null);
  assert.equal(normalizeSettings(null).promocao, null);
});

const blackNovember = {
  nome: "Black November",
  inicio: "2026-11-01T00:00:00-03:00",
  fim: "2026-11-30T23:59:00-03:00",
  descontoPct: 5,
  minPares: 12,
  faixas: [
    { minPares: 36, descontoPct: 7 },
    { minPares: 100, descontoPct: 10 },
    { minPares: 500, descontoPct: 15 },
  ],
  texto: "",
};

test("promoção por faixa: os preços da tabela da Black, no cartão e no PIX", () => {
  const casos = [
    [12, 56.91, 53.91, 5, 10],
    [24, 55.01, 52.11, 5, 10],
    [35, 55.01, 52.11, 5, 10],
    [36, 53.85, 50.95, 7, 12],
    [99, 53.85, 50.95, 7, 12],
    [120, 49.41, 46.67, 10, 15],
    [500, 44.97, 42.32, 15, 20],
    [1000, 42.42, 39.92, 15, 20],
  ];
  for (const [pares, cartao, pix, pct, pixPct] of casos) {
    const preco = precoComPromocao(pares, blackNovember);
    assert.equal(preco.unitario, cartao, `${pares} pares no cartão`);
    assert.equal(preco.pixUnitario, pix, `${pares} pares no PIX`);
    assert.equal(preco.descontoPct, pct);
    assert.equal(preco.pixDescontoPct, pixPct);
  }
  assert.equal(precoComPromocao(50, blackNovember).subtotal, 2692.5);
  assert.equal(precoComPromocao(50, blackNovember).pixSubtotal, 2547.5);
  assert.equal(descontoDaFaixa(8, blackNovember), 0);
  assert.equal(resumoDesconto(blackNovember), "5% a 15%");
  assert.equal(resumoDesconto(fechaMes), "5%");
});

test("contexto da Cami lista as faixas da promoção", () => {
  const texto = contextoVigentes(blackNovember, []);
  assert.match(texto, /5% a partir de 12 pares, 7% a partir de 36 pares, 10% a partir de 100 pares, 15% a partir de 500 pares/);
  assert.match(texto, /até 30\/11 23:59/);
});

test("Controle: faixas validadas ao salvar e lidas do banco", () => {
  const base = {
    estado: "ligada",
    minPares: 12,
    maxPares: 35,
    escalationName: "Schay",
    shifts: [["08:30", "12:00"]],
    custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
    alertas: { passagemSemRespostaMin: 60, ownerAposMin: 120, resumoDiario: true },
  };
  const ok = validateSettingsInput({ ...base, promocao: blackNovember, avisos: [] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.row.promocao, blackNovember);
  // Faixa vazia some do objeto: fica igual a uma promoção sem faixas.
  assert.equal("faixas" in validateSettingsInput({ ...base, promocao: { ...fechaMes, faixas: [] } }).row.promocao, false);
  const fora = { ...blackNovember, faixas: [{ minPares: 100, descontoPct: 10 }, { minPares: 36, descontoPct: 7 }] };
  assert.match(validateSettingsInput({ ...base, promocao: fora }).error, /faixa 3: o mínimo de pares precisa ser maior/);
  const igualPrimeira = { ...blackNovember, faixas: [{ minPares: 12, descontoPct: 7 }] };
  assert.match(validateSettingsInput({ ...base, promocao: igualPrimeira }).error, /faixa 2/);
  const caro = { ...blackNovember, faixas: [{ minPares: 36, descontoPct: 40 }] };
  assert.match(validateSettingsInput({ ...base, promocao: caro }).error, /faixa 2: desconto entre 0 e 30/);
  assert.deepEqual(normalizeSettings({ promocao: blackNovember }).promocao, blackNovember);
  assert.equal(normalizeSettings({ promocao: { ...blackNovember, faixas: "lixo" } }).promocao, null);
});
