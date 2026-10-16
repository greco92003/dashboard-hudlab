import test from "node:test";
import assert from "node:assert/strict";
import {
  avisosAtivos,
  contextoVigentes,
  isoToLocalInput,
  localInputToIso,
  precoComPromocao,
  promocaoAtiva,
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
  });
  assert.equal(precoComPromocao(24, fechaMes).unitario, 55.01);
  assert.equal(precoComPromocao(20, { ...fechaMes, minPares: 24 }).aplicada, false);
  assert.equal(precoComPromocao(20, { ...fechaMes, minPares: 24 }).unitario, 59.9);
  assert.equal(precoComPromocao(8, fechaMes), null);
  assert.equal(precoComPromocao(12, null).subtotal, 718.8);
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
  assert.match(texto, /Acumula com os 5% do PIX/);
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
