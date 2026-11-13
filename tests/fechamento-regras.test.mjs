import test from "node:test";
import assert from "node:assert/strict";

const {
  ultimoMomentoDeTurno,
  primeiroMomentoDeTurno,
  situacaoDoCard,
  rotuloDaSituacao,
  quandoTexto,
} = await import("../lib/fechamento/regras.ts");

// Turno da Schay (08:30-12:00 e 14:00-18:00, segunda a sexta, Brasília).
const TURNOS = [
  ["08:30", "12:00"],
  ["14:00", "18:00"],
];
const brt = (s) => Date.parse(`${s}:00-03:00`);
const iso = (ms) => new Date(ms).toISOString();
const base = {
  ultimaClienteEm: null,
  ultimaNossaEm: null,
  clienteEsperando: false,
  contatoManualEm: null,
  adiadoAte: null,
  dataCombinada: null,
  camiAtendendo: false,
  naEtapaDesde: brt("2026-11-10T10:00"),
};

test("último momento de turno antes do limite", () => {
  // Janela fecha às 20h de quinta: vale até as 18h.
  assert.equal(iso(ultimoMomentoDeTurno(brt("2026-11-12T20:00"), TURNOS)), iso(brt("2026-11-12T18:00")));
  // Dentro do turno: o próprio limite.
  assert.equal(iso(ultimoMomentoDeTurno(brt("2026-11-12T10:00"), TURNOS)), iso(brt("2026-11-12T10:00")));
  // No almoço: fim do turno da manhã.
  assert.equal(iso(ultimoMomentoDeTurno(brt("2026-11-12T13:00"), TURNOS)), iso(brt("2026-11-12T12:00")));
  // Sábado e segunda cedo: sexta às 18h.
  assert.equal(iso(ultimoMomentoDeTurno(brt("2026-11-14T10:00"), TURNOS)), iso(brt("2026-11-13T18:00")));
  assert.equal(iso(ultimoMomentoDeTurno(brt("2026-11-16T08:00"), TURNOS)), iso(brt("2026-11-13T18:00")));
});

test("primeiro momento de turno a partir de um instante", () => {
  assert.equal(iso(primeiroMomentoDeTurno(brt("2026-11-14T10:00"), TURNOS)), iso(brt("2026-11-16T08:30")));
  assert.equal(iso(primeiroMomentoDeTurno(brt("2026-11-12T12:30"), TURNOS)), iso(brt("2026-11-12T14:00")));
  assert.equal(iso(primeiroMomentoDeTurno(brt("2026-11-12T19:00"), TURNOS)), iso(brt("2026-11-13T08:30")));
  // 20/11 (sexta) é feriado: quinta à noite pula para segunda.
  assert.equal(iso(primeiroMomentoDeTurno(brt("2026-11-19T19:00"), TURNOS)), iso(brt("2026-11-23T08:30")));
});

test("janela aberta e a última palavra é nossa: follow-up grátis até o último momento de turno", () => {
  const e = { ...base, ultimaClienteEm: brt("2026-11-12T20:00"), ultimaNossaEm: brt("2026-11-12T20:05") };
  const s = situacaoDoCard(e, brt("2026-11-13T09:00"), TURNOS);
  assert.equal(s.tipo, "janela");
  assert.equal(iso(s.prazoEm), iso(brt("2026-11-13T18:00")));
  assert.equal(s.cor, "laranja");
  assert.equal(s.ultimaChance, false);
  assert.equal(rotuloDaSituacao(s, brt("2026-11-13T09:00")), "Follow-up grátis até hoje 18h");
  // Na última hora de turno antes do prazo: pisca.
  const tarde = situacaoDoCard(e, brt("2026-11-13T17:10"), TURNOS);
  assert.equal(tarde.ultimaChance, true);
  assert.match(rotuloDaSituacao(tarde, brt("2026-11-13T17:10")), /^Última chance/);
});

test("follow-up já mandado na segunda metade da janela: o próximo é em 2 dias", () => {
  const e = { ...base, ultimaClienteEm: brt("2026-11-12T20:00"), ultimaNossaEm: brt("2026-11-13T15:00") };
  const s = situacaoDoCard(e, brt("2026-11-13T15:30"), TURNOS);
  assert.equal(s.tipo, "dois_dias");
  // 15/11 é domingo (e feriado): segunda 16/11 às 8h30.
  assert.equal(iso(s.prazoEm), iso(brt("2026-11-16T08:30")));
  assert.equal(s.cor, "verde");
});

test("janela fechada: 2 dias depois do último contato, por modelo", () => {
  const e = { ...base, ultimaClienteEm: brt("2026-11-11T10:00"), ultimaNossaEm: brt("2026-11-11T10:05") };
  const agora = brt("2026-11-13T11:00");
  const s = situacaoDoCard(e, agora, TURNOS);
  assert.equal(s.tipo, "dois_dias");
  assert.equal(s.janelaAberta, false);
  assert.equal(iso(s.prazoEm), iso(brt("2026-11-13T10:05")));
  assert.equal(s.cor, "amarelo");
  assert.equal(rotuloDaSituacao(s, agora), "Follow-up atrasado desde hoje 10h05 (por modelo)");
});

test("cliente escreveu por último: vermelho", () => {
  const e = { ...base, ultimaClienteEm: brt("2026-11-10T14:00"), clienteEsperando: true };
  const s = situacaoDoCard(e, brt("2026-11-13T09:00"), TURNOS);
  assert.equal(s.cor, "vermelho");
  assert.equal(s.tipo, "responder");
  assert.equal(rotuloDaSituacao(s, brt("2026-11-13T09:00")), "Cliente esperando resposta há 3 dias");
});

test("com a Cami: fica fora dos avisos", () => {
  const s = situacaoDoCard({ ...base, camiAtendendo: true, clienteEsperando: true }, brt("2026-11-13T09:00"), TURNOS);
  assert.equal(s.cor, "cami");
  assert.equal(s.prazoEm, null);
});

test("parado há mais de 14 dias: cinza", () => {
  const e = { ...base, ultimaClienteEm: brt("2026-10-25T10:00"), ultimaNossaEm: brt("2026-11-01T10:00") };
  const s = situacaoDoCard(e, brt("2026-11-13T09:00"), TURNOS);
  assert.equal(s.cor, "cinza");
  assert.equal(rotuloDaSituacao(s, brt("2026-11-13T09:00")), "Parado há mais de 14 dias: decidir");
});

test("adiado e combinado mandam no prazo", () => {
  const agora = brt("2026-11-13T09:00");
  const adiado = situacaoDoCard(
    { ...base, ultimaClienteEm: brt("2026-11-12T10:00"), ultimaNossaEm: brt("2026-11-12T10:05"), adiadoAte: brt("2026-11-18T09:00") },
    agora,
    TURNOS,
  );
  assert.equal(adiado.tipo, "adiado");
  assert.equal(adiado.cor, "verde");
  // "Me chama segunda": vence segunda no começo do turno.
  const combinado = situacaoDoCard(
    { ...base, ultimaClienteEm: brt("2026-11-12T10:00"), ultimaNossaEm: brt("2026-11-12T10:05"), dataCombinada: brt("2026-11-16T00:00") },
    agora,
    TURNOS,
  );
  assert.equal(combinado.tipo, "combinado");
  assert.equal(iso(combinado.prazoEm), iso(brt("2026-11-16T08:30")));
  // Combinado antigo, já cumprido (contato depois da data): volta à régua normal.
  const cumprido = situacaoDoCard(
    { ...base, ultimaClienteEm: brt("2026-11-10T10:00"), ultimaNossaEm: brt("2026-11-12T10:00"), dataCombinada: brt("2026-11-11T00:00") },
    agora,
    TURNOS,
  );
  assert.equal(cumprido.tipo, "dois_dias");
});

test("ordem: vermelho, laranja, amarelo, verde, cinza, Cami", () => {
  const agora = brt("2026-11-13T09:00");
  const cards = [
    situacaoDoCard({ ...base, camiAtendendo: true }, agora, TURNOS),
    situacaoDoCard({ ...base, ultimaClienteEm: brt("2026-10-20T10:00") }, agora, TURNOS),
    situacaoDoCard({ ...base, ultimaClienteEm: brt("2026-11-12T20:00"), ultimaNossaEm: brt("2026-11-13T15:00") }, agora, TURNOS),
    situacaoDoCard({ ...base, ultimaClienteEm: brt("2026-11-11T10:00"), ultimaNossaEm: brt("2026-11-11T10:05") }, agora, TURNOS),
    situacaoDoCard({ ...base, ultimaClienteEm: brt("2026-11-12T20:00"), ultimaNossaEm: brt("2026-11-12T20:05") }, agora, TURNOS),
    situacaoDoCard({ ...base, ultimaClienteEm: brt("2026-11-12T20:00"), clienteEsperando: true }, agora, TURNOS),
  ];
  const cores = [...cards].sort((a, b) => a.ordem - b.ordem).map((c) => c.cor);
  assert.deepEqual(cores, ["vermelho", "laranja", "amarelo", "verde", "cinza", "cami"]);
});

test("texto de quando", () => {
  const agora = brt("2026-11-13T09:00");
  assert.equal(quandoTexto(brt("2026-11-13T18:00"), agora), "hoje 18h");
  assert.equal(quandoTexto(brt("2026-11-14T08:30"), agora), "amanhã 8h30");
  assert.equal(quandoTexto(brt("2026-11-16T08:30"), agora), "seg 16/11 8h30");
});
