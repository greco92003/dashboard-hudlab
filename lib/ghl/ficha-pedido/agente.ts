import "server-only";

import OpenAI from "openai";
import { fetchOpportunityById } from "@/lib/ghl/api";
import {
  downloadGhlMedia,
  fetchMessagesSince,
  findConversationIdForContact,
} from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  ESQUEMA_RESPOSTA,
  INSTRUCOES_AGENTE,
  montarRascunho,
  recortarConversa,
  type FichaRascunho,
  type MensagemConversa,
  type ReferenciaAnexo,
  type RespostaAgente,
} from "@/lib/ghl/ficha-pedido/regras";

export const FICHA_AGENT_MODEL =
  process.env.FICHA_PEDIDO_AGENT_MODEL ||
  process.env.GHL_MOCKUP_AGENT_MODEL ||
  "gpt-5.6-terra";
export const FICHA_PROMPT_VERSION = "2026-11-18.3";

// Artes aprovadas vêm do vendedor (imagens); comprovantes vêm do cliente
// (imagem ou PDF). Os limites seguram custo e latência em conversa longa.
const MAX_ANEXOS_HUD = 8;
const MAX_ANEXOS_CLIENTE = 6;

export interface ResultadoFicha {
  rascunho: FichaRascunho;
  resposta: RespostaAgente;
  estatisticas: { mensagens: number; imagens: number; pdfs: number; modelo: string };
}

function transcricao(mensagens: MensagemConversa[], refsPorMensagem: Map<string, string[]>) {
  return mensagens
    .map((m) => {
      const autor = m.direction === "inbound" ? "CLIENTE" : "HUD LAB";
      const refs = refsPorMensagem.get(m.id);
      const anexos = refs?.length ? ` [anexos: ${refs.join(", ")}]` : m.attachments.length ? " [anexo não lido]" : "";
      const corpo = m.body.trim();
      if (!corpo && !anexos) return null;
      return `[${m.dateAdded.slice(0, 16)}] msg ${m.id} ${autor}: ${corpo}${anexos}`;
    })
    .filter(Boolean)
    .join("\n");
}

export async function gerarRascunhoFicha(
  opportunityId: string,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoFicha> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const oportunidade = await fetchOpportunityById(opportunityId);
  if (!oportunidade.contactId) throw new Error("Oportunidade sem contato");
  const conversaId = await findConversationIdForContact(oportunidade.contactId);
  const todas = conversaId ? (await fetchMessagesSince(conversaId, null)).messages : [];
  const mensagens = recortarConversa(todas, { criadaEm: oportunidade.createdAt, agora: opcoes.agora });

  // Anexos mais recentes primeiro, separados por quem enviou.
  const candidatos = mensagens.flatMap((m) => m.attachments.map((url) => ({ url, m }))).reverse();
  const anexos = new Map<string, ReferenciaAnexo>();
  const refsPorMensagem = new Map<string, string[]>();
  const conteudoMidia: unknown[] = [];
  let imagens = 0;
  let pdfs = 0;
  let hud = 0;
  let cliente = 0;
  const vistos = new Set<string>();
  for (const { url, m } of candidatos) {
    if (vistos.has(url)) continue;
    vistos.add(url);
    const doCliente = m.direction === "inbound";
    if (doCliente ? cliente >= MAX_ANEXOS_CLIENTE : hud >= MAX_ANEXOS_HUD) continue;
    const midia = await downloadGhlMedia(url);
    if (!midia) continue;
    const ehImagem = midia.mimeType.startsWith("image/");
    const ehPdf = midia.mimeType === "application/pdf";
    if (!ehImagem && !(ehPdf && doCliente)) continue;

    const ref = `anexo-${anexos.size + 1}`;
    anexos.set(ref, { url, mimeType: midia.mimeType });
    refsPorMensagem.set(m.id, [...(refsPorMensagem.get(m.id) ?? []), ref]);
    const dados = `data:${midia.mimeType};base64,${midia.bytes.toString("base64")}`;
    conteudoMidia.push({
      type: "input_text",
      text: `${ref}: ${ehPdf ? "PDF" : "imagem"} enviada pelo ${doCliente ? "CLIENTE" : "HUD LAB"} na msg ${m.id} (${m.dateAdded.slice(0, 16)})`,
    });
    conteudoMidia.push(
      ehPdf
        ? { type: "input_file", filename: midia.filename || `${ref}.pdf`, file_data: dados }
        : { type: "input_image", image_url: dados, detail: "high" },
    );
    if (ehPdf) pdfs++;
    else imagens++;
    if (doCliente) cliente++;
    else hud++;
  }

  const cabecalho = `OPORTUNIDADE: ${oportunidade.name}\nVALOR DO NEGÓCIO NO GHL: ${oportunidade.monetaryValue ?? "não informado"}\n\nCONVERSA (do mais antigo para o mais recente):\n${transcricao(mensagens, refsPorMensagem) || "Sem mensagens no período."}`;

  const client = new OpenAI({ apiKey });
  const resposta = await client.responses.create({
    model: FICHA_AGENT_MODEL,
    reasoning: { effort: "medium" },
    instructions: INSTRUCOES_AGENTE,
    input: [{ role: "user", content: [{ type: "input_text", text: cabecalho }, ...conteudoMidia] as never }],
    text: {
      format: { type: "json_schema", name: "ficha_do_pedido", strict: true, schema: ESQUEMA_RESPOSTA as never },
    },
    max_output_tokens: 6000,
    store: false,
  });
  const bruto = JSON.parse(resposta.output_text) as RespostaAgente;

  return {
    rascunho: montarRascunho(bruto, { anexos, valorNegocio: oportunidade.monetaryValue }),
    resposta: bruto,
    estatisticas: { mensagens: mensagens.length, imagens, pdfs, modelo: FICHA_AGENT_MODEL },
  };
}
