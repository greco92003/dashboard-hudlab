import test from "node:test";
import assert from "node:assert/strict";
import { buildDailySummary, DEFAULT_ALERTS, fmtMinutes, handoffAlertsDue } from "../lib/ghl/ai-seller/alerts.ts";
import { normalizeSettings, validateSettingsInput } from "../lib/ghl/ai-seller/settings-shape.ts";

// Horário de Brasília (UTC-3) -> ms. 14/10/2026 é quarta-feira.
const brt = (iso) => Date.parse(`${iso}-03:00`);
const iso = (local) => new Date(brt(local)).toISOString();
const handoff = (over) => ({
  id: "h1",
  escalated_at: iso("2026-10-14T09:00:00"),
  answered_at: null,
  alerted_at: null,
  owner_alerted_at: null,
  ...over,
});

test("passagem sem resposta: 1h útil avisa quem recebe, 2h avisa o owner, uma vez cada", () => {
  assert.deepEqual(handoffAlertsDue([handoff()], brt("2026-10-14T09:30:00"), DEFAULT_ALERTS), []);
  assert.deepEqual(handoffAlertsDue([handoff()], brt("2026-10-14T10:05:00"), DEFAULT_ALERTS), [
    { id: "h1", pessoa: true, owner: false, minutos: 65 },
  ]);
  assert.deepEqual(
    handoffAlertsDue([handoff({ alerted_at: iso("2026-10-14T10:05:00") })], brt("2026-10-14T11:10:00"), DEFAULT_ALERTS),
    [{ id: "h1", pessoa: false, owner: true, minutos: 130 }],
  );
  // Já avisados os dois, ou já respondida: nada.
  const done = handoff({ alerted_at: iso("2026-10-14T10:05:00"), owner_alerted_at: iso("2026-10-14T11:10:00") });
  assert.deepEqual(handoffAlertsDue([done], brt("2026-10-14T15:00:00"), DEFAULT_ALERTS), []);
  assert.deepEqual(handoffAlertsDue([handoff({ answered_at: iso("2026-10-14T09:20:00") })], brt("2026-10-14T15:00:00"), DEFAULT_ALERTS), []);
});

test("passagem à noite só conta a partir do turno seguinte", () => {
  const night = handoff({ escalated_at: iso("2026-10-14T21:00:00") });
  assert.deepEqual(handoffAlertsDue([night], brt("2026-10-15T08:00:00"), DEFAULT_ALERTS), []);
  assert.equal(handoffAlertsDue([night], brt("2026-10-15T09:40:00"), DEFAULT_ALERTS)[0].minutos, 70);
});

test("minutos por extenso", () => {
  assert.equal(fmtMinutes(45), "45 min");
  assert.equal(fmtMinutes(60), "1h");
  assert.equal(fmtMinutes(130), "2h10");
});

const overview = (over) => ({
  assumidos: 0,
  foraDaCami: [],
  responderam: { n: 0, pct: null },
  tempoResposta: { medianaSeg: null, piorSeg: null, n: 0 },
  passagens: { total: 0, porMotivo: [] },
  pagamento: { n: 0, pct: null },
  sumiram: { n: 0, pct: null },
  vendas: { n: 0, valor: 0 },
  custo: { reais: 0, porVendaReais: null, tokensIn: 0, tokensOut: 0, rodadas: 0 },
  funil: [],
  ...over,
});

test("resumo do dia: nada sem atividade; com atividade, números do dia", () => {
  assert.equal(buildDailySummary({ overview: overview(), paraRevisar: 0, escalationName: "Schay" }), null);
  const s = buildDailySummary({
    overview: overview({
      assumidos: 5,
      passagens: { total: 2, porMotivo: [{ motivo: "pronto_para_pagar", n: 1 }, { motivo: "reclamacao", n: 1 }] },
      vendas: { n: 1, valor: 718.8 },
      tempoResposta: { medianaSeg: 38.2, piorSeg: 90, n: 12 },
      custo: { reais: 3, porVendaReais: 3, tokensIn: 1, tokensOut: 1, rodadas: 14 },
    }),
    paraRevisar: 1,
    escalationName: "Schay",
  });
  assert.equal(s.title, "Cami hoje");
  assert.equal(
    s.message,
    "5 clientes novos · 2 para Schay (1 pronto para pagar) · 1 venda · resposta em 38 s. 1 conversa para revisar.",
  );
});

test("alertas no Controle: lidos do banco e validados ao salvar", () => {
  // Formato antigo ("18:30") conta como resumo ligado.
  const old = normalizeSettings({ alertas: { passagemSemRespostaMin: 60, ownerAposMin: 120, resumoDiario: "18:30" } });
  assert.deepEqual(old.alertas, { passagemSemRespostaMin: 60, ownerAposMin: 120, resumoDiario: true });
  assert.deepEqual(normalizeSettings({ alertas: { passagemSemRespostaMin: 5 } }).alertas, DEFAULT_ALERTS);

  const base = {
    estado: "ligada",
    minPares: 12,
    maxPares: 12,
    escalationName: "Schay",
    shifts: [["08:30", "12:00"]],
    custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
  };
  assert.equal(validateSettingsInput({ ...base, alertas: { passagemSemRespostaMin: 60, ownerAposMin: 120, resumoDiario: false } }).ok, true);
  assert.match(
    validateSettingsInput({ ...base, alertas: { passagemSemRespostaMin: 120, ownerAposMin: 60, resumoDiario: true } }).error,
    /dono não pode vir antes/,
  );
  assert.match(validateSettingsInput({ ...base, alertas: { passagemSemRespostaMin: 5, ownerAposMin: 60 } }).error, /15 e 1440/);
});
