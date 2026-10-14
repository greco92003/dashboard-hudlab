import test from "node:test";
import assert from "node:assert/strict";
import { escalationAvailability } from "../lib/ghl/ai-seller/hours.ts";
import { decideAssignment } from "../lib/ghl/ai-seller/decide.ts";
import { GHL_ATENDIMENTO_PIPELINE_ID } from "../lib/ghl/ai-seller/config.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../lib/ghl/ai-seller/settings-shape.ts";

// Horário de Brasília (UTC-3) -> ms. 14/10/2026 é quarta-feira.
const brt = (iso) => Date.parse(`${iso}-03:00`);

test("horário da Schay: turnos de seg a sex", () => {
  assert.equal(escalationAvailability(brt("2026-10-14T09:00:00")).available, true);
  assert.equal(escalationAvailability(brt("2026-10-14T17:59:00")).available, true);
  assert.equal(escalationAvailability(brt("2026-10-14T08:00:00")).returnsAt, "hoje às 8h30");
  assert.equal(escalationAvailability(brt("2026-10-14T12:30:00")).returnsAt, "hoje às 14h");
  assert.equal(escalationAvailability(brt("2026-10-14T18:00:00")).returnsAt, "amanhã às 8h30");
  assert.equal(escalationAvailability(brt("2026-10-16T19:00:00")).returnsAt, "segunda às 8h30");
  assert.equal(escalationAvailability(brt("2026-10-17T10:00:00")).returnsAt, "segunda às 8h30");
  assert.equal(escalationAvailability(brt("2026-10-18T10:00:00")).returnsAt, "amanhã às 8h30");
  assert.equal(escalationAvailability(brt("2026-10-14T13:05:00")).nowLabel, "13:05");
});

test("horário de quem recebe vem da configuração", () => {
  const shifts = [["09:00", "17:00"]];
  assert.equal(escalationAvailability(brt("2026-10-14T12:30:00"), shifts).available, true);
  assert.equal(escalationAvailability(brt("2026-10-14T08:00:00"), shifts).returnsAt, "hoje às 9h");
  assert.equal(escalationAvailability(brt("2026-10-14T17:30:00"), shifts).returnsAt, "amanhã às 9h");
});

test("configuração do banco: valores válidos passam, inválidos caem no padrão", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const ok = normalizeSettings({
    estado: "nao_pega_novos",
    min_pares: 12,
    max_pares: 23,
    escalation_user_id: " u123 ",
    escalation_name: "Raisa",
    escalation_shifts: [["14:00", "18:00"], ["08:30", "12:00"]],
  });
  assert.equal(ok.estado, "nao_pega_novos");
  assert.equal(ok.maxPares, 23);
  assert.equal(ok.escalationUserId, "u123");
  assert.equal(ok.escalationName, "Raisa");
  assert.deepEqual(ok.shifts, [["08:30", "12:00"], ["14:00", "18:00"]]);

  const bad = normalizeSettings({
    estado: "talvez",
    min_pares: 30,
    max_pares: 20,
    escalation_user_id: "",
    escalation_name: "  ",
    escalation_shifts: [["18:00", "08:00"]],
  });
  assert.equal(bad.estado, "ligada");
  assert.equal(bad.minPares, DEFAULT_SETTINGS.minPares);
  assert.equal(bad.maxPares, DEFAULT_SETTINGS.maxPares);
  assert.equal(bad.escalationUserId, null);
  assert.equal(bad.escalationName, "Schay");
  assert.deepEqual(bad.shifts, DEFAULT_SETTINGS.shifts);
});

const NOW = brt("2026-10-14T13:00:00");
const base = {
  now: NOW,
  estado: "ligada",
  minPares: 12,
  maxPares: 12,
  tags: ["lead"],
  aiTag: "ia-atendimento",
  escalatedTag: "ia-escalado",
  pipelineId: GHL_ATENDIMENTO_PIPELINE_ID,
  pares: 12,
  messages: [],
};
const msg = (extra) => ({
  id: "m",
  direction: "outbound",
  body: "oi",
  dateAdded: new Date(NOW - 3600e3).toISOString(),
  userId: null,
  attachments: [],
  isAutomated: false,
  ...extra,
});

test("entrada: Cami assume 12 pares no Atendimento sem ninguém do time na conversa", () => {
  assert.deepEqual(decideAssignment(base), { assign: true });
  // Automação e mensagens da própria IA não contam como time conversando.
  assert.deepEqual(
    decideAssignment({ ...base, messages: [msg({ isAutomated: true }), msg({ id: "ia" })] }),
    { assign: true },
  );
});

test("entrada: motivos para não assumir", () => {
  const motivo = (input) => decideAssignment({ ...base, ...input }).motivo;
  assert.equal(motivo({ estado: "nao_pega_novos" }), "cami_pausada");
  assert.equal(motivo({ estado: "desligada" }), "cami_pausada");
  assert.equal(motivo({ tags: ["ia-atendimento"] }), "ja_com_a_ia");
  assert.equal(motivo({ tags: ["ia-escalado"] }), "ja_passou_para_humano");
  assert.equal(motivo({ pipelineId: null }), "sem_oportunidade");
  assert.equal(motivo({ pipelineId: "outro" }), "fora_do_atendimento");
  assert.equal(motivo({ pares: 13 }), "fora_da_faixa_de_pares");
  assert.equal(motivo({ pares: null }), "fora_da_faixa_de_pares");
  assert.equal(motivo({ messages: [msg({ userId: "schay" })] }), "time_ja_conversando");
  // Faixa vem da configuração: ampliar para 12–23 aceita 15 pares.
  assert.deepEqual(decideAssignment({ ...base, maxPares: 23, pares: 15 }), { assign: true });
  // Conversa do time de mais de 72h atrás não impede.
  assert.equal(
    decideAssignment({
      ...base,
      messages: [msg({ userId: "schay", dateAdded: new Date(NOW - 80 * 3600e3).toISOString() })],
    }).assign,
    true,
  );
});
