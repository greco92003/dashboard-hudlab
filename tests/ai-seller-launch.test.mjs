import test from "node:test";
import assert from "node:assert/strict";
import { escalationAvailability } from "../lib/ghl/ai-seller/hours.ts";
import { decideAssignment } from "../lib/ghl/ai-seller/decide.ts";
import { GHL_ATENDIMENTO_PIPELINE_ID } from "../lib/ghl/ai-seller/config.ts";

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

const NOW = brt("2026-10-14T13:00:00");
const base = {
  now: NOW,
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
  assert.equal(motivo({ tags: ["ia-atendimento"] }), "ja_com_a_ia");
  assert.equal(motivo({ tags: ["ia-escalado"] }), "ja_passou_para_humano");
  assert.equal(motivo({ pipelineId: null }), "sem_oportunidade");
  assert.equal(motivo({ pipelineId: "outro" }), "fora_do_atendimento");
  assert.equal(motivo({ pares: 13 }), "fora_da_faixa_de_pares");
  assert.equal(motivo({ pares: null }), "fora_da_faixa_de_pares");
  assert.equal(motivo({ messages: [msg({ userId: "schay" })] }), "time_ja_conversando");
  // Conversa do time de mais de 72h atrás não impede.
  assert.equal(
    decideAssignment({
      ...base,
      messages: [msg({ userId: "schay", dateAdded: new Date(NOW - 80 * 3600e3).toISOString() })],
    }).assign,
    true,
  );
});
