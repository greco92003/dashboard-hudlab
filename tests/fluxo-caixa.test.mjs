import test from "node:test";
import assert from "node:assert/strict";
import {
  agrupamentoAutomatico,
  assinaturaDaListagem,
  contasDoPeriodo,
  formatarDataTiny,
  inicioDoBucket,
  lancamentosDaConta,
  mapearContaTiny,
  mensagemDoTiny,
  montarFluxo,
  normalizarData,
  proximoBucket,
  statusDaConta,
} from "../lib/fluxo-caixa/regras.ts";

const HOJE = "2026-09-16";

function conta(parcial) {
  return {
    tipo: "pagar",
    tiny_id: 1,
    situacao: "aberto",
    data_emissao: null,
    data_vencimento: "2026-09-17",
    data_pagamento: null,
    valor: 100,
    saldo: 100,
    historico: null,
    numero_documento: null,
    contato_id: null,
    contato_nome: null,
    contato_cpf_cnpj: null,
    categoria_id: null,
    categoria_nome: null,
    forma_pagamento: null,
    ...parcial,
  };
}

test("normaliza datas do Tiny", () => {
  assert.equal(normalizarData("2026-09-17"), "2026-09-17");
  assert.equal(normalizarData("2026-09-17T10:00:00"), "2026-09-17");
  assert.equal(normalizarData("17/09/2026"), "2026-09-17");
  assert.equal(normalizarData("x"), null);
  assert.equal(normalizarData(null), null);
  assert.equal(formatarDataTiny("2026-09-17"), "17/09/2026");
});

test("status da conta", () => {
  assert.equal(statusDaConta(conta({ situacao: "cancelada" }), HOJE), "cancelada");
  assert.equal(statusDaConta(conta({ situacao: "pago", saldo: 100 }), HOJE), "paga");
  assert.equal(statusDaConta(conta({ saldo: 0 }), HOJE), "paga");
  assert.equal(statusDaConta(conta({ data_vencimento: "2026-09-15" }), HOJE), "atrasada");
  assert.equal(statusDaConta(conta({ data_vencimento: HOJE }), HOJE), "a_vencer");
});

test("atrasada entra hoje, negativa quando é a pagar", () => {
  assert.deepEqual(lancamentosDaConta(conta({ data_vencimento: "2026-09-10" }), HOJE), [
    { data: HOJE, valor: -100, atrasado: true },
  ]);
});

test("parcial divide a parte paga e o saldo", () => {
  const parcial = conta({
    tipo: "receber",
    situacao: "parcial",
    valor: 300,
    saldo: 100,
    data_pagamento: "2026-09-05",
    data_vencimento: "2026-09-20",
  });
  assert.deepEqual(lancamentosDaConta(parcial, HOJE), [
    { data: "2026-09-05", valor: 200, atrasado: false },
    { data: "2026-09-20", valor: 100, atrasado: false },
  ]);
  assert.deepEqual(lancamentosDaConta(conta({ situacao: "cancelada" }), HOJE), []);
});

test("paga sem data de pagamento cai no vencimento", () => {
  assert.deepEqual(lancamentosDaConta(conta({ situacao: "pago", saldo: 0 }), HOJE), [
    { data: "2026-09-17", valor: -100, atrasado: false },
  ]);
});

test("buckets de semana e mês", () => {
  assert.equal(inicioDoBucket("2026-09-16", "semana"), "2026-09-14");
  assert.equal(inicioDoBucket("2026-09-13", "semana"), "2026-09-07");
  assert.equal(inicioDoBucket("2026-09-16", "mes"), "2026-09-01");
  assert.equal(proximoBucket("2026-12-01", "mes"), "2027-01-01");
  assert.equal(proximoBucket("2026-09-14", "semana"), "2026-09-21");
  assert.equal(agrupamentoAutomatico("2026-09-01", "2026-09-30"), "dia");
  assert.equal(agrupamentoAutomatico("2026-09-01", "2026-11-29"), "semana");
  assert.equal(agrupamentoAutomatico("2026-01-01", "2026-12-31"), "mes");
});

const CONTAS_FLUXO = [
  conta({ tiny_id: 1, tipo: "receber", valor: 1000, saldo: 1000, data_vencimento: "2026-09-17" }),
  conta({ tiny_id: 2, valor: 300, saldo: 300, data_vencimento: "2026-09-17" }),
  conta({ tiny_id: 3, valor: 200, saldo: 200, data_vencimento: "2026-09-10" }),
  conta({ tiny_id: 4, tipo: "receber", situacao: "recebido", valor: 500, saldo: 0, data_pagamento: "2026-09-01", data_vencimento: "2026-09-01" }),
];

test("fluxo com saldo inicial antes do período", () => {
  const { pontos, resumo } = montarFluxo({
    contas: CONTAS_FLUXO,
    inicio: "2026-09-15",
    fim: "2026-09-18",
    agrupamento: "dia",
    hoje: HOJE,
    saldoInicial: { valor: 1000, data: "2026-09-01" },
  });
  assert.deepEqual(
    pontos.map((p) => [p.inicio, p.entradas, p.saidas, p.fechamento, p.atrasadoSaidas]),
    [
      ["2026-09-15", 0, 0, 1500, 0],
      ["2026-09-16", 0, -200, 1300, -200],
      ["2026-09-17", 1000, -300, 2000, 0],
      ["2026-09-18", 0, 0, 2000, 0],
    ],
  );
  assert.deepEqual(resumo, {
    saldoInicioPeriodo: 1500,
    entradas: 1000,
    saidas: -500,
    fechamentoFinal: 2000,
    atrasadasPagar: { quantidade: 1, valor: 200 },
    atrasadasReceber: { quantidade: 0, valor: 0 },
  });
});

test("fluxo com saldo inicial no meio do período volta o ponto de partida", () => {
  const { pontos } = montarFluxo({
    contas: CONTAS_FLUXO,
    inicio: "2026-09-15",
    fim: "2026-09-18",
    agrupamento: "dia",
    hoje: HOJE,
    saldoInicial: { valor: 1000, data: "2026-09-17" },
  });
  assert.deepEqual(pontos.map((p) => p.fechamento), [1200, 1000, 1700, 1700]);
});

test("listas trazem atrasadas de qualquer data e o resto só do período", () => {
  const lista = contasDoPeriodo(
    [
      conta({ tiny_id: 1, data_vencimento: "2026-01-10" }),
      conta({ tiny_id: 2, data_vencimento: "2026-12-10" }),
      conta({ tiny_id: 3, data_vencimento: "2026-09-20" }),
      conta({ tiny_id: 4, situacao: "cancelada", data_vencimento: "2026-09-20" }),
      conta({ tiny_id: 5, situacao: "pago", saldo: 0, data_vencimento: "2026-08-01", data_pagamento: "2026-09-16" }),
    ],
    "2026-09-16",
    "2026-09-30",
    HOJE,
  );
  assert.deepEqual(lista.map((c) => [c.tiny_id, c.status]), [
    [1, "atrasada"],
    [3, "a_vencer"],
    [5, "paga"],
  ]);
});

test("mapeia conta do Tiny juntando listagem e detalhe", () => {
  const listagem = {
    id: 55,
    situacao: "aberto",
    data: "2026-09-01",
    dataVencimento: "2026-09-17",
    historico: " Conta de luz ",
    valor: "250.50",
    saldo: 250.5,
    cliente: { id: 9, nome: "CEEE", cpfCnpj: "123" },
  };
  assert.deepEqual(
    mapearContaTiny("pagar", listagem, { id: 55, categoria: { id: 3, descricao: "Energia" }, dataLiquidacao: null }),
    conta({
      tiny_id: 55,
      data_emissao: "2026-09-01",
      valor: 250.5,
      saldo: 250.5,
      historico: "Conta de luz",
      contato_id: 9,
      contato_nome: "CEEE",
      contato_cpf_cnpj: "123",
      categoria_id: 3,
      categoria_nome: "Energia",
    }),
  );
  assert.equal(mapearContaTiny("receber", { id: 1, situacao: "recebido", dataVencimento: "2026-09-01", valor: 10 }).saldo, 0);
  assert.equal(mapearContaTiny("receber", { id: 1 }), null);
  assert.notEqual(assinaturaDaListagem(listagem), assinaturaDaListagem({ ...listagem, situacao: "pago" }));
});

test("mensagem de erro do Tiny", () => {
  const erro = new Error('[Tiny v3] POST /contas-pagar → HTTP 400: {"mensagem":"Ocorreram erros de validação","detalhes":[{"campo":"contato","mensagem":"obrigatório"}]}');
  assert.equal(mensagemDoTiny(erro), "Ocorreram erros de validação — contato: obrigatório");
  assert.equal(mensagemDoTiny(new Error("falhou")), "falhou");
});
