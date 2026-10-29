// Regras dos avisos do time no WhatsApp. Módulo puro: sem server-only.
import { isWindowOpen } from "@/lib/ghl/unread-inbox/triage";

/** Folga antes das 24h: a mensagem livre não pode chegar com a janela já fechando. */
export const FOLGA_JANELA_MS = 30 * 60 * 1000;

/** Mensagem livre só com a janela de 24h aberta (com folga); senão, o modelo de utilidade. */
export function escolherVia(
  ultimaEntradaMs: number | null,
  agoraMs: number,
  temWorkflow: boolean,
): "livre" | "modelo" | "sem_modelo" {
  if (ultimaEntradaMs != null && isWindowOpen(ultimaEntradaMs, agoraMs + FOLGA_JANELA_MS)) return "livre";
  return temWorkflow ? "modelo" : "sem_modelo";
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Avisos de clique só das 8h às 21h (Brasília). O que chega à noite sai às 8h, se ninguém respondeu. */
export const HORARIO_DE_AVISO = { inicio: 8, fim: 21 } as const;

export function dentroDoHorarioDeAviso(agoraMs: number): boolean {
  const hora = new Date(agoraMs - BRT_OFFSET_MS).getUTCHours();
  return hora >= HORARIO_DE_AVISO.inicio && hora < HORARIO_DE_AVISO.fim;
}

/** Folga entre execuções do cron, para não perder clique na borda. */
const SOBREPOSICAO_MS = 5 * 60 * 1000;
/** Nunca olha mais para trás que isso (a noite inteira cabe). */
export const BUSCA_MAX_MS = 12 * 60 * 60 * 1000;
const PRIMEIRA_BUSCA_MS = 30 * 60 * 1000;

/** Desde quando procurar cliques: a última execução, com folga, limitada a 12h. */
export function inicioDaBusca(ultimaExecucaoMs: number | null, agoraMs: number): number {
  if (ultimaExecucaoMs == null) return agoraMs - PRIMEIRA_BUSCA_MS;
  return Math.max(ultimaExecucaoMs - SOBREPOSICAO_MS, agoraMs - BUSCA_MAX_MS);
}

export interface MensagemDaConversa {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  dateAdded: string;
  userId: string | null;
  isAutomated: boolean;
}

export interface CliqueNaConversa {
  mensagem: MensagemDaConversa;
  /** Texto do envio do robô logo antes do clique (identifica a campanha). */
  envioAnterior: string | null;
  /** Alguém do time (não robô, não Cami) escreveu depois do clique. */
  atendido: boolean;
  /** A Cami escreveu depois do clique (mesmo usuário dos workflows, mas fora de workflow). */
  respostaDaCami: boolean;
}

/**
 * O último clique de campanha na conversa desde `desdeMs`. Quem é o time: a
 * Cami e os workflows mandam com o mesmo usuário do GHL; qualquer outro
 * usuário escrevendo fora de workflow é alguém do time.
 */
export function ultimoClique(
  mensagens: MensagemDaConversa[],
  desdeMs: number,
  ehClique: (corpo: string) => boolean,
): CliqueNaConversa | null {
  const ordem = [...mensagens].sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));
  const automacao = new Set(ordem.filter((m) => m.isAutomated && m.userId).map((m) => m.userId as string));
  let indice = -1;
  for (let i = ordem.length - 1; i >= 0; i--) {
    const m = ordem[i];
    if (Date.parse(m.dateAdded) < desdeMs) break;
    if (m.direction === "inbound" && ehClique(m.body)) {
      indice = i;
      break;
    }
  }
  if (indice < 0) return null;
  const depois = ordem.slice(indice + 1).filter((m) => m.direction === "outbound" && !m.isAutomated);
  const envioAnterior =
    ordem
      .slice(0, indice)
      .reverse()
      .find((m) => m.direction === "outbound" && m.isAutomated && m.body.trim())?.body ?? null;
  return {
    mensagem: ordem[indice],
    envioAnterior,
    atendido: depois.some((m) => !m.userId || !automacao.has(m.userId)),
    respostaDaCami: depois.some((m) => m.userId != null && automacao.has(m.userId)),
  };
}
