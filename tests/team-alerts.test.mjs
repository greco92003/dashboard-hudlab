import test from "node:test";
import assert from "node:assert/strict";
import {
  avisoDeClique,
  avisoDeEspera,
  avisoDePassagem,
  botaoDoClique,
  campanhaDoEnvio,
  juntarAvisos,
  linhaDeModelo,
  linkDoContato,
} from "../lib/ghl/team-alerts/text.ts";
import { dentroDoHorarioDeAviso, escolherVia, inicioDaBusca, ultimoClique } from "../lib/ghl/team-alerts/rules.ts";

const brt = (local) => Date.parse(`${local}-03:00`);
const H = 60 * 60 * 1000;

test("linha do modelo: sem quebra de linha, sem espaços seguidos, sem travessão, com limite", () => {
  const linha = linhaDeModelo("Cliente tocou em Ver Tabela\n\nAna   (24 pares) — Negociação\t ok");
  assert.equal(linha, "Cliente tocou em Ver Tabela. Ana (24 pares), Negociação ok.");
  assert.doesNotMatch(linha, /\n|\t| {2,}/);
  const longa = linhaDeModelo("x".repeat(900));
  assert.equal(longa.length, 600);
  assert.ok(longa.endsWith("…"));
});

test("cliques reconhecidos são os botões das campanhas, e só eles", () => {
  assert.equal(botaoDoClique("Quero Aproveitar"), "Quero Aproveitar");
  assert.equal(botaoDoClique(" fazer pedido "), "Fazer Pedido");
  assert.equal(botaoDoClique("Ver Tabela"), "Ver Tabela");
  assert.equal(botaoDoClique("Consultar Prazo"), "Consultar Prazo");
  assert.equal(botaoDoClique("SIM, Quero Acesso VIP"), "Entrou na Lista VIP");
  assert.equal(botaoDoClique("quero aproveitar a promoção de vocês"), null);
  assert.equal(botaoDoClique("Agora não"), null);
});

test("campanha do clique pelo envio do robô que veio antes", () => {
  assert.equal(campanhaDoEnvio("SUA BLACK VIP ACABA AMANHÃ\nÚltimo dia para garantir"), "Último dia da Black VIP");
  assert.equal(campanhaDoEnvio("SUA BLACK VIP ESTÁ NA RETA FINAL Faltam poucos dias"), "Reta final da Black VIP");
  assert.equal(campanhaDoEnvio("SUA BLACK VIP ESTÁ LIBERADA! Até 20% OFF"), "abertura da Black VIP");
  assert.equal(campanhaDoEnvio("A Black November da Hud Lab começou! 🖤"), "Black November");
  assert.equal(campanhaDoEnvio("Oi, tudo bem?"), null);
});

const msg = (id, direction, body, local, extra = {}) => ({
  id,
  direction,
  body,
  dateAdded: new Date(brt(local)).toISOString(),
  userId: null,
  isAutomated: false,
  ...extra,
});
const ROBO = "usuario-automacao";
const SCHAY = "usuario-schay";

test("último clique: sem resposta, com resposta da Cami e com resposta do time", () => {
  const base = [
    msg("m1", "outbound", "SUA BLACK VIP ESTÁ NA RETA FINAL", "2026-10-28T14:13:00", { userId: ROBO, isAutomated: true }),
    msg("m2", "inbound", "Quero Aproveitar", "2026-10-28T14:21:00"),
    msg("m3", "outbound", "", "2026-10-28T14:21:05", { userId: ROBO, isAutomated: true }),
  ];
  const desde = brt("2026-10-28T14:00:00");
  const ehClique = (c) => botaoDoClique(c) != null;

  const sozinho = ultimoClique(base, desde, ehClique);
  assert.equal(sozinho.mensagem.id, "m2");
  assert.equal(sozinho.envioAnterior, "SUA BLACK VIP ESTÁ NA RETA FINAL");
  assert.equal(sozinho.atendido, false);
  assert.equal(sozinho.respostaDaCami, false);

  // A Cami manda com o mesmo usuário dos workflows, fora de workflow: não é o time.
  const cami = ultimoClique([...base, msg("m4", "outbound", "Vou chamar a Schay", "2026-10-28T14:22:00", { userId: ROBO })], desde, ehClique);
  assert.equal(cami.atendido, false);
  assert.equal(cami.respostaDaCami, true);

  const schay = ultimoClique([...base, msg("m5", "outbound", "Olá! Aqui é a Schay", "2026-10-28T14:40:00", { userId: SCHAY })], desde, ehClique);
  assert.equal(schay.atendido, true);

  // Clique antes do início da busca não conta.
  assert.equal(ultimoClique(base, brt("2026-10-28T15:00:00"), ehClique), null);
});

test("janela de 24h: livre com folga de 30 min; fechada, modelo (ou nada, sem workflow)", () => {
  const agora = brt("2026-10-29T15:00:00");
  assert.equal(escolherVia(agora - 2 * H, agora, true), "livre");
  assert.equal(escolherVia(agora - 23.4 * H, agora, true), "livre");
  assert.equal(escolherVia(agora - 23.6 * H, agora, true), "modelo");
  assert.equal(escolherVia(null, agora, true), "modelo");
  assert.equal(escolherVia(agora - 30 * H, agora, false), "sem_modelo");
});

test("horário de aviso e início da busca: a primeira do dia pega a noite", () => {
  assert.equal(dentroDoHorarioDeAviso(brt("2026-10-30T07:59:00")), false);
  assert.equal(dentroDoHorarioDeAviso(brt("2026-10-30T08:00:00")), true);
  assert.equal(dentroDoHorarioDeAviso(brt("2026-10-30T20:59:00")), true);
  assert.equal(dentroDoHorarioDeAviso(brt("2026-10-30T21:00:00")), false);
  const manha = brt("2026-10-30T08:00:00");
  assert.equal(inicioDaBusca(brt("2026-10-29T20:55:00"), manha), brt("2026-10-29T20:50:00"));
  assert.equal(inicioDaBusca(brt("2026-10-25T20:55:00"), manha), manha - 12 * H);
  assert.equal(inicioDaBusca(null, manha), manha - 0.5 * H);
});

test("texto do aviso de clique e junção de vários", () => {
  const link = linkDoContato("contato-1", "local-1");
  assert.equal(link, "https://app.gohighlevel.com/v2/location/local-1/contacts/detail/contato-1");
  const a = avisoDeClique({
    nome: "Cristian",
    botao: "Fazer Pedido",
    campanha: "Último dia da Black VIP",
    quandoMs: brt("2026-10-30T09:12:00"),
    pares: 24,
    etapa: "Negociação",
    vendedor: "Schay",
    respostaDaCami: false,
    link,
  });
  assert.match(a.texto, /^🔔 \*Cliente tocou em Fazer Pedido\*/);
  assert.match(a.texto, /Cristian tocou em Fazer Pedido \(Último dia da Black VIP\) às 09h12/);
  assert.match(a.texto, /Negócio: 24 pares, Negociação, vendedor Schay\./);
  assert.doesNotMatch(a.linha, /\n/);
  const b = avisoDeClique({ ...{ nome: "Ana", botao: "Ver Tabela", campanha: null, quandoMs: brt("2026-10-30T09:15:00") }, pares: null, etapa: null, vendedor: null, respostaDaCami: true, link: null });
  assert.match(b.texto, /Sem negócio aberto\./);
  assert.match(b.texto, /A Cami respondeu, mas ninguém do time\./);
  assert.equal(juntarAvisos([a]), a);
  const dois = juntarAvisos([a, b]);
  assert.match(dois.texto, /^🔔 \*2 clientes aguardando o time\*/);
  assert.match(dois.linha, /^2 clientes aguardando o time\. Cristian tocou.*Ana tocou/);
});

test("avisos da Cami: passagem e espera, sem travessão", () => {
  const p = avisoDePassagem({ nome: "Caio", motivo: "pediu uma pessoa", resumo: "Quer a condição Black — 12 pares", link: null });
  assert.match(p.texto, /A Cami passou um cliente/);
  assert.match(p.texto, /Caio precisa do time \(pediu uma pessoa\)\./);
  assert.doesNotMatch(p.texto, /—/);
  const e = avisoDeEspera({ nome: "Caio", espera: "1h 10min", motivo: "pediu uma pessoa", link: null, owner: true });
  assert.match(e.texto, /Passagem da Cami sem resposta/);
  assert.match(e.texto, /Caio espera há 1h 10min úteis/);
});
