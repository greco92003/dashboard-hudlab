import test from "node:test";
import assert from "node:assert/strict";

const { rotuloDoDia, ehHoje, tomDoGrupo, tomPorDias, statusCurto, somaDePares } = await import("../lib/producao/dias.ts");
const { getCurrentDateBrasilia } = await import("../lib/programacao/board-dates.ts");

// Sexta, 13/11/2026 (meia-noite local, como getCurrentDateBrasilia devolve).
const HOJE = new Date(2026, 10, 13);

test("rótulo do dia: hoje, amanhã e os demais com o dia da semana", () => {
  assert.equal(rotuloDoDia("13/11/2026", HOJE), "Hoje · sex 13/11");
  assert.equal(rotuloDoDia("14/11/2026", HOJE), "Amanhã · sáb 14/11");
  assert.equal(rotuloDoDia("16/11/2026", HOJE), "Seg 16/11");
  // Formato antigo (aaaa-mm-dd) também vale.
  assert.equal(rotuloDoDia("2026-11-20", HOJE), "Sex 20/11");
  // Etapa da Expedição não é data: volta como veio.
  assert.equal(rotuloDoDia("Cobrar Saldo", HOJE), "Cobrar Saldo");
  assert.equal(ehHoje("13/11/2026", HOJE), true);
  assert.equal(ehHoje("16/11/2026", HOJE), false);
});

test("tom: atrasado rosa, até 3 dias magenta, até 7 violeta, depois ardósia", () => {
  assert.equal(tomPorDias(-1), "tone-rose");
  assert.equal(tomPorDias(0), "tone-pink");
  assert.equal(tomPorDias(3), "tone-pink");
  assert.equal(tomPorDias(7), "tone-violet");
  assert.equal(tomPorDias(8), "tone-slate");
  assert.equal(tomDoGrupo({ id: "em-atraso", title: "Em atraso" }, HOJE), "tone-rose");
  assert.equal(tomDoGrupo({ id: "recebido", title: "Recebido" }, HOJE), "tone-green");
  assert.equal(tomDoGrupo({ id: "x", title: "16/11/2026" }, HOJE), "tone-pink");
  assert.equal(tomDoGrupo({ id: "x", title: "30/11/2026" }, HOJE), "tone-slate");
  assert.equal(tomDoGrupo({ id: "coleta", title: "Coleta" }, HOJE), "tone-sky");
});

test("status curto do pedido", () => {
  const hoje = getCurrentDateBrasilia();
  const dia = (delta) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() + delta);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  assert.deepEqual(statusCurto(dia(-3)), { texto: "Atrasado 3 dias", tom: "tone-rose" });
  assert.deepEqual(statusCurto(dia(-1)), { texto: "Atrasado 1 dia", tom: "tone-rose" });
  assert.deepEqual(statusCurto(dia(0)), { texto: "Embarca hoje", tom: "tone-pink" });
  assert.deepEqual(statusCurto(dia(1)), { texto: "Embarca amanhã", tom: "tone-pink" });
  assert.deepEqual(statusCurto(dia(5)), { texto: "Faltam 5 dias", tom: "tone-violet" });
  assert.deepEqual(statusCurto(null), { texto: "Sem data de embarque", tom: "tone-pink" });
  assert.deepEqual(statusCurto(dia(-3), true), { texto: "Recebido", tom: "tone-green" });
});

test("soma de pares ignora vazio e texto", () => {
  assert.equal(somaDePares([{ quantidadePares: "280" }, { quantidadePares: null }, { quantidadePares: "abc" }, { quantidadePares: "20" }]), 300);
});
