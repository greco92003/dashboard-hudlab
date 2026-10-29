// Texto dos avisos do time no WhatsApp (Schay e owner). Módulo puro: sem server-only.
import { semTravessao } from "@/lib/ghl/ai-seller/writing";

/** Tamanho do resumo que vai no modelo da Meta quando a janela de 24h está fechada. */
export const AVISO_LINHA_MAX = 600;

export interface Aviso {
  /** Mensagem livre, com quebras de linha: vai quando a janela de 24h está aberta. */
  texto: string;
  /** Uma linha só: vai no {{2}} do modelo `aviso_time_hud` quando a janela está fechada. */
  linha: string;
}

/**
 * Parâmetro de modelo do WhatsApp. A Meta recusa quebra de linha, tab e mais
 * de 4 espaços seguidos dentro de variável; o resumo vira uma linha só.
 */
export function linhaDeModelo(texto: string, max = AVISO_LINHA_MAX): string {
  const linha = semTravessao(texto)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return linha.length > max ? `${linha.slice(0, max - 1).trimEnd()}…` : linha;
}

export function montarAviso(input: { titulo: string; linhas: Array<string | null | undefined>; link?: string | null }): Aviso {
  const linhas = input.linhas.map((l) => l?.trim()).filter((l): l is string => Boolean(l));
  const texto = semTravessao([`🔔 *${input.titulo}*`, ...linhas, input.link ?? ""].filter(Boolean).join("\n"));
  return { texto, linha: linhaDeModelo([input.titulo, ...linhas, input.link ?? ""].join("\n")) };
}

/** Botões dos disparos da Black VIP e da Black November que pedem alguém do time. */
const BOTOES: Array<{ padrao: RegExp; rotulo: string }> = [
  { padrao: /^quero aproveitar$/i, rotulo: "Quero Aproveitar" },
  { padrao: /^consultar prazo$/i, rotulo: "Consultar Prazo" },
  { padrao: /^ver tabela$/i, rotulo: "Ver Tabela" },
  { padrao: /^fazer pedido$/i, rotulo: "Fazer Pedido" },
  { padrao: /^(sim, quero acesso vip|quero meu acesso|black)$/i, rotulo: "Entrou na Lista VIP" },
];

/** Rótulo do botão quando a mensagem do cliente é um clique de campanha; null se não é. */
export function botaoDoClique(corpo: string): string | null {
  const limpo = corpo.trim();
  return BOTOES.find((b) => b.padrao.test(limpo))?.rotulo ?? null;
}

/** De qual envio veio o clique, pelo texto do robô que veio antes dele. */
export function campanhaDoEnvio(corpoDoEnvio: string): string | null {
  const t = corpoDoEnvio.toUpperCase();
  if (t.includes("ACABA AMANHÃ") || t.includes("ÚLTIMO DIA")) return "Último dia da Black VIP";
  if (t.includes("RETA FINAL")) return "Reta final da Black VIP";
  if (t.includes("BLACK VIP ESTÁ LIBERADA")) return "abertura da Black VIP";
  if (t.includes("CONVITE VIP")) return "convite da Black VIP";
  if (t.includes("TABELA VIP")) return "tabela da Black VIP";
  if (t.includes("BLACK NOVEMBER")) return "Black November";
  return null;
}

/** Ficha do contato no GHL, com a conversa ao lado. */
export function linkDoContato(contactId: string, locationId = process.env.GHL_LOCATION_ID ?? ""): string | null {
  return locationId ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}` : null;
}

/**
 * Vários avisos da mesma rodada viram um só: menos mensagens no celular e um
 * envio por destino (o modelo lê um campo do contato, que dois envios seguidos
 * sobrescreveriam).
 */
export function juntarAvisos(avisos: Aviso[]): Aviso {
  if (avisos.length === 1) return avisos[0];
  const corpo = (a: Aviso) => a.texto.split("\n").slice(1).join("\n");
  return {
    texto: [`🔔 *${avisos.length} clientes aguardando o time*`, ...avisos.map(corpo)].join("\n\n"),
    linha: linhaDeModelo(
      [`${avisos.length} clientes aguardando o time`, ...avisos.map((a) => a.texto.split("\n")[1] ?? "")].join("\n"),
    ),
  };
}

/** A Cami passou o cliente para o time (aviso na hora). */
export function avisoDePassagem(input: { nome: string | null; motivo: string; resumo: string | null; link: string | null }): Aviso {
  const resumo = (input.resumo ?? "").replace(/\s+/g, " ").trim();
  return montarAviso({
    titulo: "A Cami passou um cliente",
    linhas: [`${input.nome?.trim() || "Um cliente"} precisa do time (${input.motivo}).`, resumo ? `Resumo: ${resumo}` : null],
    link: input.link,
  });
}

/** Passagem da Cami ainda sem resposta (lembrete a quem recebe e, depois, ao owner). */
export function avisoDeEspera(input: { nome: string | null; espera: string; motivo: string; link: string | null; owner: boolean }): Aviso {
  return montarAviso({
    titulo: input.owner ? "Passagem da Cami sem resposta" : "Cliente esperando resposta",
    linhas: [
      `${input.nome?.trim() || "Um cliente"} espera há ${input.espera} úteis (${input.motivo}).`,
      input.owner ? "Ninguém do time respondeu ainda." : "A Cami passou o atendimento e ninguém respondeu ainda.",
    ],
    link: input.link,
  });
}

export function avisoDoResumo(input: { title: string; message: string }): Aviso {
  return montarAviso({ titulo: input.title, linhas: [input.message], link: null });
}

const hora = (ms: number) =>
  new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(11, 16).replace(":", "h");

export function avisoDeClique(input: {
  nome: string | null;
  botao: string;
  campanha: string | null;
  quandoMs: number;
  pares: number | null;
  etapa: string | null;
  vendedor: string | null;
  respostaDaCami: boolean;
  link: string | null;
}): Aviso {
  const nome = input.nome?.trim() || "Um cliente";
  const onde = input.campanha ? ` (${input.campanha})` : "";
  const negocio = [
    input.pares ? `${input.pares} pares` : null,
    input.etapa,
    input.vendedor ? `vendedor ${input.vendedor}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return montarAviso({
    titulo: input.botao === "Entrou na Lista VIP" ? "Novo na Lista VIP" : `Cliente tocou em ${input.botao}`,
    linhas: [
      `${nome} tocou em ${input.botao}${onde} às ${hora(input.quandoMs)} e ainda não teve resposta do time.`,
      negocio ? `Negócio: ${negocio}.` : "Sem negócio aberto.",
      input.respostaDaCami ? "A Cami respondeu, mas ninguém do time." : null,
    ],
    link: input.link,
  });
}
