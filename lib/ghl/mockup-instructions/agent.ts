import "server-only";

import OpenAI, { toFile } from "openai";
import { z } from "zod";
import {
  downloadGhlMedia,
  type MockupConversationMessage,
} from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  formatBriefing,
  previousBriefingReferences,
  type BriefingParagraph,
  type BriefingReference,
} from "@/lib/ghl/mockup-instructions/briefing";

export const MOCKUP_AGENT_MODEL =
  process.env.GHL_MOCKUP_AGENT_MODEL || "gpt-5.6-terra";
export const MOCKUP_TRANSCRIPTION_MODEL =
  process.env.GHL_MOCKUP_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
export const MOCKUP_PROMPT_VERSION = "2026-09-03.1";

const resultSchema = z.object({
  resumo: z.string().min(20).max(5000),
  pedidoAtual: z.string().min(10).max(3000),
  alteracoesDestaRodada: z.array(z.string().max(500)).max(20),
  elementosVisuais: z.array(z.string().max(500)).max(20),
  textosObrigatorios: z.array(z.string().max(300)).max(20),
  coresEAcabamentos: z.array(z.string().max(300)).max(20),
  restricoes: z.array(z.string().max(500)).max(20),
  referencias: z.array(z.string().max(1000)).max(30),
  duvidasParaDesigner: z.array(z.string().max(500)).max(20),
  narrativa: z.array(z.object({
    texto: z.string().min(10).max(900),
    referencias: z.array(z.object({
      id: z.string().max(80),
      legenda: z.string().max(160),
    })).max(4),
  })).min(1).max(5),
});

export type MockupAgentResult = z.infer<typeof resultSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    resumo: { type: "string" },
    pedidoAtual: { type: "string" },
    alteracoesDestaRodada: { type: "array", items: { type: "string" } },
    elementosVisuais: { type: "array", items: { type: "string" } },
    textosObrigatorios: { type: "array", items: { type: "string" } },
    coresEAcabamentos: { type: "array", items: { type: "string" } },
    restricoes: { type: "array", items: { type: "string" } },
    referencias: { type: "array", items: { type: "string" } },
    duvidasParaDesigner: { type: "array", items: { type: "string" } },
    narrativa: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          texto: { type: "string" },
          referencias: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { id: { type: "string" }, legenda: { type: "string" } },
              required: ["id", "legenda"],
            },
          },
        },
        required: ["texto", "referencias"],
      },
    },
  },
  required: [
    "resumo",
    "pedidoAtual",
    "alteracoesDestaRodada",
    "elementosVisuais",
    "textosObrigatorios",
    "coresEAcabamentos",
    "restricoes",
    "referencias",
    "duvidasParaDesigner",
    "narrativa",
  ],
} as const;

type SourceFields = {
  mockupLogotipo: string[];
  linkMockup: string[];
  linkAlteracaoMockup: string[];
};

type MediaStats = { images: number; audios: number };

function transcriptText(messages: MockupConversationMessage[]) {
  return messages
    .filter((message) => message.body.trim())
    .map((message) => {
      const author = message.direction === "inbound" ? "CLIENTE" : "HUD LAB";
      return `[${message.dateAdded}] ${author}: ${message.body.trim()}`;
    })
    .join("\n");
}

function uniqueUrls(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

async function buildMediaContent(
  client: OpenAI,
  messages: MockupConversationMessage[],
  sourceFields: SourceFields,
): Promise<{ content: any[]; stats: MediaStats; references: BriefingReference[] }> {
  const content: any[] = [];
  const stats = { images: 0, audios: 0 };
  const references: BriefingReference[] = [];
  const messageAttachments = messages.flatMap((message) =>
    message.attachments.map((url) => ({ url, message })),
  );
  const directFieldUrls = uniqueUrls([
    ...sourceFields.mockupLogotipo,
    ...sourceFields.linkMockup,
    ...sourceFields.linkAlteracaoMockup,
  ]).map((url) => ({ url, message: null }));

  // Mais recentes primeiro. O limite evita que conversas longas explodam
  // latência/custo sem perder as referências relevantes da rodada atual.
  const candidates = [...messageAttachments, ...directFieldUrls]
    .reverse()
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.url === candidate.url) === index,
    );
  for (const candidate of candidates) {
    if (stats.images >= 12 && stats.audios >= 8 && candidate.message) continue;
    const media = await downloadGhlMedia(candidate.url);
    const referenceId = `ref-${references.length + 1}`;
    if (!media) {
      if (!candidate.message) {
        references.push({ id: referenceId, url: candidate.url, isImage: false });
      }
      continue;
    }

    if (media.mimeType.startsWith("image/") && stats.images < 12) {
      references.push({ id: referenceId, url: candidate.url, isImage: true });
      content.push({
        type: "input_text",
        text: candidate.message
          ? `Imagem de referência ${referenceId}, anexada à mensagem ${candidate.message.id} (${candidate.message.dateAdded}):`
          : `Imagem de referência ${referenceId}, obtida de um campo do GHL:`,
      });
      content.push({
        type: "input_image",
        image_url: `data:${media.mimeType};base64,${media.bytes.toString("base64")}`,
        detail: "high",
      });
      stats.images++;
      continue;
    }

    if (media.mimeType.startsWith("audio/") && stats.audios < 8) {
      try {
        const transcription = await client.audio.transcriptions.create({
          model: MOCKUP_TRANSCRIPTION_MODEL,
          file: await toFile(media.bytes, media.filename, {
            type: media.mimeType,
          }),
          language: "pt",
        });
        content.push({
          type: "input_text",
          text: `Áudio do cliente/Hud Lab em ${candidate.message?.dateAdded ?? "campo GHL"}, transcrito: ${transcription.text}`,
        });
        stats.audios++;
      } catch (error) {
        console.error("Mockup agent audio transcription failed", {
          messageId: candidate.message?.id,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }

    if (!candidate.message && !media.mimeType.startsWith("image/")) {
      references.push({ id: referenceId, url: candidate.url, isImage: false });
    }
  }

  return { content, stats, references };
}

export async function runMockupInstructionAgent(input: {
  opportunityName: string;
  stageName: string;
  instructionType: "initial" | "alteration";
  previousSummary: string | null;
  messages: MockupConversationMessage[];
  sourceFields: SourceFields;
}): Promise<{ result: MockupAgentResult; stats: MediaStats }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const client = new OpenAI({ apiKey });
  const media = await buildMediaContent(
    client,
    input.messages,
    input.sourceFields,
  );
  const references = [
    ...media.references,
    ...previousBriefingReferences(input.previousSummary).filter(
      (previous) => !media.references.some((item) => item.url === previous.url),
    ),
  ];
  const links = uniqueUrls([
    ...input.sourceFields.mockupLogotipo,
    ...input.sourceFields.linkMockup,
    ...input.sourceFields.linkAlteracaoMockup,
  ]);

  const content: any[] = [
    {
      type: "input_text",
      text: `NEGÓCIO: ${input.opportunityName}\nETAPA: ${input.stageName}\nTIPO: ${input.instructionType === "initial" ? "criação inicial" : "alteração"}\n\nRESUMO ANTERIOR (pode estar vazio):\n${input.previousSummary || "Sem resumo anterior."}\n\nCATÁLOGO DE REFERÊNCIAS PERMITIDAS (use somente estes IDs em narrativa.referencias):\n${references.length ? references.map((item) => `${item.id}: ${item.isImage ? "imagem" : "link"}`).join("\n") : "Nenhuma referência disponível."}\n\nLINKS/CAMPOS GHL:\n${links.length ? links.join("\n") : "Nenhum link preenchido."}\n\nMENSAGENS NOVAS DESDE O CACHE/INÍCIO DAS INSTRUÇÕES:\n${transcriptText(input.messages) || "Nenhuma mensagem textual nova; use as imagens e o contexto anterior."}`,
    },
    ...media.content,
  ];

  const response = await client.responses.create({
    model: MOCKUP_AGENT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Você é o briefing agent do time de design da Hud Lab. Leia a conversa, imagens, transcrições e links fornecidos e escreva em português do Brasil um briefing operacional, claro e sem floreios para o designer produzir um chinelo slide personalizado.

Regras:
- O pedido mais recente do cliente prevalece quando houver conflito.
- Em alteração, produza o estado FINAL desejado, incorporando o resumo anterior e substituindo o que mudou; não entregue só uma lista de diferenças.
- Diferencie com precisão texto impresso, logotipo, etiqueta física e outros elementos.
- Nunca invente cor, material, técnica, posição ou texto. Coloque ambiguidades em duvidasParaDesigner.
- Considere apenas a parte da conversa a partir da escolha sobre dar instruções. Mensagens de automação anteriores não são briefing.
- Mantenha resumo para compatibilidade, mas escreva narrativa como o briefing principal: texto corrido, natural, conciso, em estilo de pequeno texto de blog, sem títulos, tópicos ou seções. Use entre 1 e 5 parágrafos e no máximo 220 palavras no total.
- Em cada parágrafo de narrativa, associe as imagens ou links que comprovam aquele trecho usando seus IDs no catálogo. Dê a cada referência uma legenda curta e específica, como "Logo enviado pelo cliente". Não invente IDs e não repita uma referência.
- Inclua apenas detalhes úteis à execução. Se houver uma dúvida indispensável, incorpore-a brevemente ao fim do texto.
- Links de pastas do Google Drive podem não abrir como imagem no modelo; trate-os como referências e use as imagens anexadas/conteúdo visual realmente recebido para descrever o visual.`,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "mockup_instruction_summary",
        strict: true,
        schema: jsonSchema,
      },
    },
    max_output_tokens: 5000,
    store: false,
  });

  const parsed = resultSchema.parse(JSON.parse(response.output_text));
  parsed.resumo = formatBriefing(
    parsed.narrativa as BriefingParagraph[],
    references,
  );
  return { result: parsed, stats: media.stats };
}
