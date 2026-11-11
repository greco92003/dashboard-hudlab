// Avisos da fila de não lidas: lead quente para a Schay, cliente do pós-venda
// para a Amanda. Quem avisar e o texto. Módulo puro: sem server-only.
import { AI_TAG } from "@/lib/ghl/ai-seller/config";
import { semTravessao } from "@/lib/ghl/ai-seller/writing";
import { botaoDoClique, linhaDeModelo, linkDoContato, montarAviso, type Aviso } from "@/lib/ghl/team-alerts/text";

/** Passagem da Cami mais recente que isso já avisou a Schay: o lead quente não avisa de novo. */
export const PASSAGEM_RECENTE_MS = 2 * 60 * 60 * 1000;
const TRECHO_MAX = 140;

export type TipoDeAviso = "quente" | "pos_venda";

/** Linha da fila de não lidas que o aviso lê. */
export interface HotRow {
  conversation_id: string;
  contact_id: string;
  contact_name: string | null;
  reason: string | null;
  last_message_id: string | null;
  last_message_body: string | null;
  contact_tags: string[] | null;
  assigned_to?: string | null;
  hot_notified_message_id: string | null;
}

export type HotDecision =
  | "avisar"
  | "ja_avisado"
  | "com_cami"
  | "passagem_recente"
  | "clique_de_campanha"
  | "outro_dono";

/**
 * Avisa uma vez por mensagem nova do cliente. Fica de fora:
 * - quem a Cami está atendendo (tag ia-atendimento): ela responde;
 * - quem a Cami acabou de passar: o aviso de passagem já foi;
 * - clique em botão de campanha: o aviso de clique (cron avisos-time) já cobre;
 * - com `dono`, conversa de outro dono (o pós-venda só avisa a Amanda dos
 *   clientes dela; o entregue que ainda é da Schay fica de fora).
 */
export function decidirAviso(
  row: HotRow,
  opts: { passagensRecentes: ReadonlySet<string>; dono?: string | null },
): HotDecision {
  if (!row.last_message_id || row.hot_notified_message_id === row.last_message_id) return "ja_avisado";
  if ((row.contact_tags ?? []).includes(AI_TAG)) return "com_cami";
  if (opts.passagensRecentes.has(row.contact_id)) return "passagem_recente";
  if (row.last_message_body && botaoDoClique(row.last_message_body)) return "clique_de_campanha";
  if (opts.dono !== undefined && (row.assigned_to ?? null) !== opts.dono) return "outro_dono";
  return "avisar";
}

/** Lead quente: qualquer dono. */
export function decidirAvisoQuente(row: HotRow, contatosComPassagemRecente: ReadonlySet<string>): HotDecision {
  return decidirAviso(row, { passagensRecentes: contatosComPassagemRecente });
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
const motivoDe = (r: HotRow, tipo: TipoDeAviso) =>
  semTravessao(r.reason?.trim() || (tipo === "quente" ? "Classificado como quente." : "Cliente do pós-venda."));

const ROTULO: Record<TipoDeAviso, { emoji: string; um: string; varios: (n: number) => string }> = {
  quente: {
    emoji: "🔥",
    um: "Lead quente esperando",
    varios: (n) => `${n} leads quentes esperando resposta`,
  },
  pos_venda: {
    emoji: "📦",
    um: "Cliente do pós-venda esperando",
    varios: (n) => `${n} clientes do pós-venda esperando resposta`,
  },
};

/** Push (sininho e celular) e WhatsApp da rodada: um cliente ou vários juntos. */
export function textoDoAviso(rows: HotRow[], tipo: TipoDeAviso): { title: string; message: string; aviso: Aviso } {
  const rotulo = ROTULO[tipo];
  if (rows.length === 1) {
    const r = rows[0];
    const ultima = trecho(r.last_message_body);
    return {
      title: `${rotulo.emoji} ${rotulo.um}: ${nomeDe(r)}`,
      message: [motivoDe(r, tipo), ultima ? `Última mensagem: "${ultima}"` : null].filter(Boolean).join(" "),
      aviso: montarAviso({
        titulo: `${rotulo.um} resposta`,
        linhas: [`*${nomeDe(r)}*: ${motivoDe(r, tipo)}`, ultima ? `"${ultima}"` : null],
        link: linkDoContato(r.contact_id),
      }),
    };
  }
  const titulo = rotulo.varios(rows.length);
  const blocos = rows.map((r) => {
    const ultima = trecho(r.last_message_body);
    return [`*${nomeDe(r)}*: ${motivoDe(r, tipo)}`, ultima ? `"${ultima}"` : null, linkDoContato(r.contact_id)]
      .filter(Boolean)
      .join("\n");
  });
  return {
    title: `${rotulo.emoji} ${titulo}`,
    message: rows.map(nomeDe).join(", "),
    aviso: {
      texto: semTravessao([`🔔 *${titulo}*`, ...blocos].join("\n\n")),
      linha: linhaDeModelo([titulo, ...rows.map((r) => `${nomeDe(r)}: ${motivoDe(r, tipo)}`)].join("\n")),
    },
  };
}

export function textoDoAvisoQuente(rows: HotRow[]) {
  return textoDoAviso(rows, "quente");
}
