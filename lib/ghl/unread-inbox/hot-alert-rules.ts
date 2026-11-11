// Aviso de lead quente para a Schay: quem avisar e o texto. Módulo puro: sem server-only.
import { AI_TAG } from "@/lib/ghl/ai-seller/config";
import { semTravessao } from "@/lib/ghl/ai-seller/writing";
import { botaoDoClique, linhaDeModelo, linkDoContato, montarAviso, type Aviso } from "@/lib/ghl/team-alerts/text";

/** Passagem da Cami mais recente que isso já avisou a Schay: o lead quente não avisa de novo. */
export const PASSAGEM_RECENTE_MS = 2 * 60 * 60 * 1000;
const TRECHO_MAX = 140;

/** Linha da fila de não lidas que o aviso lê. */
export interface HotRow {
  conversation_id: string;
  contact_id: string;
  contact_name: string | null;
  reason: string | null;
  last_message_id: string | null;
  last_message_body: string | null;
  contact_tags: string[] | null;
  hot_notified_message_id: string | null;
}

export type HotDecision = "avisar" | "ja_avisado" | "com_cami" | "passagem_recente" | "clique_de_campanha";

/**
 * Avisa uma vez por mensagem nova do cliente. Fica de fora:
 * - quem a Cami está atendendo (tag ia-atendimento): ela responde;
 * - quem a Cami acabou de passar: o aviso de passagem já foi;
 * - clique em botão de campanha: o aviso de clique (cron avisos-time) já cobre.
 */
export function decidirAvisoQuente(row: HotRow, contatosComPassagemRecente: ReadonlySet<string>): HotDecision {
  if (!row.last_message_id || row.hot_notified_message_id === row.last_message_id) return "ja_avisado";
  if ((row.contact_tags ?? []).includes(AI_TAG)) return "com_cami";
  if (contatosComPassagemRecente.has(row.contact_id)) return "passagem_recente";
  if (row.last_message_body && botaoDoClique(row.last_message_body)) return "clique_de_campanha";
  return "avisar";
}

/** Primeiro nome, minúsculo e sem acento: "Schay Hud" e "schay" batem. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function trecho(texto: string | null): string | null {
  const t = semTravessao(texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > TRECHO_MAX ? `${t.slice(0, TRECHO_MAX - 1).trimEnd()}…` : t;
}

const nomeDe = (r: HotRow) => r.contact_name?.trim() || "Cliente sem nome";
const motivoDe = (r: HotRow) => semTravessao(r.reason?.trim() || "Classificado como quente.");

/** Push (sininho e celular) e WhatsApp da rodada: um lead ou vários juntos. */
export function textoDoAvisoQuente(rows: HotRow[]): { title: string; message: string; aviso: Aviso } {
  if (rows.length === 1) {
    const r = rows[0];
    const ultima = trecho(r.last_message_body);
    return {
      title: `🔥 Lead quente esperando: ${nomeDe(r)}`,
      message: [motivoDe(r), ultima ? `Última mensagem: "${ultima}"` : null].filter(Boolean).join(" "),
      aviso: montarAviso({
        titulo: "Lead quente esperando resposta",
        linhas: [`*${nomeDe(r)}*: ${motivoDe(r)}`, ultima ? `"${ultima}"` : null],
        link: linkDoContato(r.contact_id),
      }),
    };
  }
  const titulo = `${rows.length} leads quentes esperando resposta`;
  const blocos = rows.map((r) => {
    const ultima = trecho(r.last_message_body);
    return [`*${nomeDe(r)}*: ${motivoDe(r)}`, ultima ? `"${ultima}"` : null, linkDoContato(r.contact_id)]
      .filter(Boolean)
      .join("\n");
  });
  return {
    title: `🔥 ${titulo}`,
    message: rows.map(nomeDe).join(", "),
    aviso: {
      texto: semTravessao([`🔔 *${titulo}*`, ...blocos].join("\n\n")),
      linha: linhaDeModelo([titulo, ...rows.map((r) => `${nomeDe(r)}: ${motivoDe(r)}`)].join("\n")),
    },
  };
}
