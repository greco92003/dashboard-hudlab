// lib/ghl/sales-agent/agent.ts
//
// Runs the Hud Lab "Agente Comercial" (manual.ts section 8) in its two
// modes: Auditor (final score for a resolved negotiation) and Copiloto
// (coaching for a negotiation still open). Same OpenAI Responses API setup
// as app/api/sellers-v2/training/route.ts (gpt-5.6-terra, json_schema for
// guaranteed structured output) but grounded in the real commercial manual
// instead of generic sales criteria. Migrated off Gemini 2.5 Flash for
// evaluation quality — same model already used for the training chat.
import OpenAI, { toFile } from "openai";
import { MANUAL_COMERCIAL_TEXT, MANUAL_VERSION } from "./manual";
import type {
  NegotiationMessage,
  ResponseGapStats,
} from "@/lib/ghl/negotiation-conversations";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const AGENT_MODEL = "gpt-5.6-terra";

const AGENT_BASE_INSTRUCTION = `Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes descritas no manual abaixo. Avalie ou oriente apenas o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo quando aplicável. Nunca invente condições comerciais (preço, prazo, frete, desconto ou política). Se uma regra estiver marcada como "pendente de decisão" no manual, sinalize a dúvida em vez de decidir por conta própria. Se a conversa não tiver dados suficientes, marque-a como não avaliável em vez de inventar uma nota. Você pode receber imagens (mockups, fotos de produto/defeito) anexadas à conversa, e notas de voz já transcritas em texto — considere o conteúdo real de ambas como faria com qualquer mensagem de texto.`;

function buildSystemPrompt(modeInstructions: string): string {
  return `${AGENT_BASE_INSTRUCTION}

===== MANUAL COMERCIAL HUD LAB (versão ${MANUAL_VERSION}) =====
${MANUAL_COMERCIAL_TEXT}
===== FIM DO MANUAL =====

${modeInstructions}`;
}

function contextBlock(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

function formatResponseGapStats(stats: ResponseGapStats): string {
  const lines: string[] = [];
  lines.push(
    stats.avgSellerResponseMinutes != null
      ? `Tempo médio de resposta do vendedor a mensagens do cliente: ${Math.round(stats.avgSellerResponseMinutes)} min`
      : "Tempo médio de resposta do vendedor: sem dados suficientes",
  );
  lines.push(
    stats.longestSellerSilenceMinutes != null && stats.longestSellerSilenceAt
      ? `Maior silêncio do vendedor após mensagem do cliente: ${Math.round(stats.longestSellerSilenceMinutes / 60)} h (mensagem do cliente em ${stats.longestSellerSilenceAt})`
      : "Maior silêncio do vendedor: sem dados suficientes",
  );
  if (stats.minutesSinceLastMessage != null && stats.lastMessageDirection) {
    const who = stats.lastMessageDirection === "outbound" ? "o vendedor" : "o cliente";
    lines.push(
      `Última mensagem da conversa foi de ${who}, há ${Math.round(stats.minutesSinceLastMessage / 60)} h.`,
    );
  }
  // Left as plain facts here, not advice — how to interpret them (score vs.
  // suggest a pause/follow-up) is mode-specific and lives in each mode's own
  // instructions block below, since "agir agora" doesn't make sense once
  // the Auditor is scoring an already-resolved deal.
  return lines.join("\n");
}

// Only these mimetypes are actually sent to the model as media; anything
// else (video, pdf, vcard, etc.) is left as a text note only — images/audio
// cover what shows up in a Hud Lab sales conversation (mockups, product/
// defect photos, voice notes).
function isSupportedAttachmentMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("audio/");
}

type ImageContentPart = { type: "input_image"; image_url: string; detail: "auto" };
type TextContentPart = { type: "input_text"; text: string };
type ContentPart = TextContentPart | ImageContentPart;

type AttachmentContent =
  | { kind: "image"; part: ImageContentPart }
  | { kind: "audio"; transcript: string };

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const KNOWN_AUDIO_EXTENSIONS = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);

function audioFileNameForMimeType(mimeType: string): string {
  const ext = mimeType.split("/")[1]?.split(";")[0]?.toLowerCase() || "";
  // WhatsApp voice notes (verified live against real GHL attachments) are
  // audio/ogg — default to that extension for anything unrecognized.
  return `audio.${KNOWN_AUDIO_EXTENSIONS.has(ext) ? ext : "ogg"}`;
}

/**
 * Downloads a supported attachment and turns it into model-ready content.
 * Images become an input_image content part (base64 data URL). Audio is
 * transcribed instead of sent as raw bytes: the Responses API's input_audio
 * content type only documents mp3/wav, but real GHL voice notes are
 * audio/ogg (verified live) — transcription (which does accept ogg
 * directly) is the reliable path, and the transcript also doubles as
 * readable evidence text in the report.
 */
async function fetchAttachmentContent(url: string): Promise<AttachmentContent | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!isSupportedAttachmentMimeType(mimeType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());

    if (mimeType.startsWith("image/")) {
      const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      return { kind: "image", part: { type: "input_image", image_url: dataUrl, detail: "auto" } };
    }

    const file = await toFile(buffer, audioFileNameForMimeType(mimeType), { type: mimeType });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: "pt",
    });
    const transcript = transcription.text?.trim();
    return transcript ? { kind: "audio", transcript } : null;
  } catch (err) {
    console.error(`negotiation agent: failed to fetch/process attachment ${url}`, err);
    return null;
  }
}

// Caps how many attachments get downloaded and sent as media per call, so a
// conversation with dozens of photos/voice notes doesn't blow up context
// size, latency, or cost. Shared between images and audio — whichever N are
// most recent wins, since the most recent exchange is what matters most for
// both scoring and coaching.
const MAX_ATTACHMENTS_PER_CALL = 10;

interface AttachmentRef {
  messageIndex: number;
  url: string;
}

/**
 * Walks attachments newest-first and fetches them one at a time, keeping
 * only successfully-downloaded, supported (image/audio) media, until
 * MAX_ATTACHMENTS_PER_CALL real items are collected or attachments run out.
 * Deliberately fetch-then-decide rather than cap-then-fetch: this
 * conversation's real data regularly includes WhatsApp video clips
 * (video/mp4, unsupported), and capping on raw URL order would let those
 * occupy slots and silently crowd out older real images/audio without ever
 * sending fewer than 10 items — walking backward until 10 *usable* items
 * are found instead means the cap always reflects actual included media.
 */
async function selectIncludedAttachments(
  messages: NegotiationMessage[],
): Promise<Map<number, AttachmentContent[]>> {
  const refsNewestFirst: AttachmentRef[] = [];
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    for (const url of messages[messageIndex].attachments) {
      refsNewestFirst.push({ messageIndex, url });
    }
  }

  const includedByMessage = new Map<number, AttachmentContent[]>();
  let includedCount = 0;
  for (const ref of refsNewestFirst) {
    if (includedCount >= MAX_ATTACHMENTS_PER_CALL) break;
    const content = await fetchAttachmentContent(ref.url);
    if (!content) continue; // unsupported type or fetch/transcription failure — doesn't consume a slot
    const list = includedByMessage.get(ref.messageIndex) ?? [];
    list.push(content);
    includedByMessage.set(ref.messageIndex, list);
    includedCount++;
  }
  return includedByMessage;
}

/**
 * Turns the transcript into Responses API content parts: one text part per
 * message (chronological) — with any transcribed audio folded into that
 * same text — followed by the actual downloaded image parts for the most
 * recent MAX_ATTACHMENTS_PER_CALL usable attachments. The per-message note
 * is derived from what actually got included (not just which URLs were in
 * range), so the model is never told media follows when it doesn't.
 */
async function buildTranscriptParts(
  messages: NegotiationMessage[],
): Promise<ContentPart[]> {
  const includedByMessage = await selectIncludedAttachments(messages);

  const parts: ContentPart[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const who = m.direction === "outbound" ? "VENDEDOR" : "CLIENTE";
    const included = includedByMessage.get(i) ?? [];
    const imageParts = included
      .filter((c): c is Extract<AttachmentContent, { kind: "image" }> => c.kind === "image")
      .map((c) => c.part);
    const audioTranscripts = included
      .filter((c): c is Extract<AttachmentContent, { kind: "audio" }> => c.kind === "audio")
      .map((c) => c.transcript);
    const skipped = m.attachments.length - included.length;
    const attachmentNote =
      m.attachments.length === 0
        ? ""
        : included.length > 0
          ? ` [anexo incluído${imageParts.length > 0 ? " abaixo" : ""}${skipped > 0 ? `; +${skipped} anexo(s) desta mensagem não incluído(s)` : ""}]`
          : ` [${m.attachments.length} anexo(s) não incluído(s) — não suportado(s) (ex.: vídeo) ou fora do limite de anexos recentes]`;
    const audioNote = audioTranscripts
      .map((t) => `\n  [Áudio transcrito]: "${t}"`)
      .join("");

    parts.push({
      type: "input_text",
      text: `[${m.dateAdded}] ${who}: ${m.body || "(mensagem sem texto)"}${attachmentNote}${audioNote}`,
    });
    parts.push(...imageParts);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Modo Auditor
// ---------------------------------------------------------------------------

const AUDITOR_MODE_INSTRUCTIONS = `Modo: Auditor de atendimento.

Critérios e pesos (manual, seção 7.1) — a nota de cada critério deve estar
entre 0 e o peso máximo:
- precisaoInformacoes: 0 a 25 (preço, mínimo, prazo, frete, pagamento, personalização, garantia)
- entendimentoNecessidade: 0 a 20 (aplicação, quantidade, data, contexto, decisão)
- construcaoValor: 0 a 20 (conexão entre produto e objetivo do cliente)
- conducaoProximoPasso: 0 a 20 (pergunta útil, microcompromisso, avanço)
- clarezaComunicacao: 0 a 15 (objetividade, tom, português, organização)

Regras de justiça (manual, seção 7.4): não descontar pontos porque o
cliente não respondeu; não descontar pontos só porque a venda não
ocorreu (o outcome é contexto, não input da nota); avalie apenas o que
estava sob controle do vendedor; cite evidência textual para toda perda
relevante de pontos. O "tempo desde a última mensagem" do contexto é
medido no momento desta avaliação (o negócio já está resolvido há um
tempo) — não é um sinal de conduta do vendedor, ignore-o para fins de
nota; os tempos de resposta durante a negociação, esses sim, importam.

Liste em errosCriticos qualquer ocorrência da seção 7.3 do manual (ex.:
desconto >10% sem autorização, pagamento pedido antes da Amostra
Digital, falsa urgência) — não aplique o teto de nota você mesmo, apenas
relate os erros encontrados.

Se a conversa não tiver mensagens suficientes para avaliar com
segurança, defina naoAvaliavel=true e explique o motivo em
motivoNaoAvaliavel; nesse caso os demais campos podem vir vazios/zerados.`;

const AUDITOR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    naoAvaliavel: {
      type: "boolean",
      description: "true se a conversa não tem dados suficientes para avaliar",
    },
    motivoNaoAvaliavel: {
      type: "string",
      description: "Motivo quando naoAvaliavel=true; string vazia caso contrário",
    },
    resumo: { type: "string", description: "Resumo objetivo da conversa" },
    notasPorCriterio: {
      type: "object",
      properties: {
        precisaoInformacoes: { type: "integer", description: "0 a 25" },
        entendimentoNecessidade: { type: "integer", description: "0 a 20" },
        construcaoValor: { type: "integer", description: "0 a 20" },
        conducaoProximoPasso: { type: "integer", description: "0 a 20" },
        clarezaComunicacao: { type: "integer", description: "0 a 15" },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
      additionalProperties: false,
    },
    justificativasPorCriterio: {
      type: "object",
      properties: {
        precisaoInformacoes: { type: "string" },
        entendimentoNecessidade: { type: "string" },
        construcaoValor: { type: "string" },
        conducaoProximoPasso: { type: "string" },
        clarezaComunicacao: { type: "string" },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
      additionalProperties: false,
    },
    evidencias: { type: "array", items: { type: "string" } },
    acertos: { type: "array", items: { type: "string" } },
    falhas: { type: "array", items: { type: "string" } },
    errosCriticos: { type: "array", items: { type: "string" } },
    exemploRespostaMelhor: { type: "string" },
  },
  required: [
    "naoAvaliavel",
    "motivoNaoAvaliavel",
    "resumo",
    "notasPorCriterio",
    "justificativasPorCriterio",
    "evidencias",
    "acertos",
    "falhas",
    "errosCriticos",
    "exemploRespostaMelhor",
  ],
  additionalProperties: false,
} as const;

export interface AuditorContext {
  vendedor: string | null;
  etapaCrm: string | null;
  valorNegociacao: number | null;
  qtyPares: number | null;
  /** Omit for a simulated training session — there's no real deal outcome to report. */
  outcome?: "won" | "lost";
  /** ISO timestamp of when the deal entered "Em Negociação" (or, for a training session, the first message) — informational only. The tag is a trailing marker applied once a conversation already got serious, so it is NOT a scoring boundary: the whole transcript is in scope for the score. */
  negociacaoIniciadaEm: string;
}

export interface AuditorReport {
  naoAvaliavel: boolean;
  motivoNaoAvaliavel: string;
  resumo: string;
  notasPorCriterio: {
    precisaoInformacoes: number;
    entendimentoNecessidade: number;
    construcaoValor: number;
    conducaoProximoPasso: number;
    clarezaComunicacao: number;
  };
  justificativasPorCriterio: {
    precisaoInformacoes: string;
    entendimentoNecessidade: string;
    construcaoValor: string;
    conducaoProximoPasso: string;
    clarezaComunicacao: string;
  };
  evidencias: string[];
  acertos: string[];
  falhas: string[];
  errosCriticos: string[];
  exemploRespostaMelhor: string;
}

export interface AuditorResult {
  report: AuditorReport;
  score: number | null;
  classification: string | null;
  hasCriticalError: boolean;
}

function clampCriterio(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, max));
}

function classify(score: number): string {
  if (score >= 90) return "Excelente";
  if (score >= 80) return "Bom";
  if (score >= 70) return "Atenção";
  if (score >= 60) return "Insuficiente";
  return "Crítico";
}

export async function runAuditor(
  messages: NegotiationMessage[],
  responseGapStats: ResponseGapStats,
  context: AuditorContext,
): Promise<AuditorResult> {
  const introText = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
  Resultado:
    context.outcome === "won"
      ? "venda fechada (won)"
      : context.outcome === "lost"
        ? "negociação perdida (lost)"
        : "não aplicável — sessão de treinamento simulado, sem resultado real",
  "Negociação iniciada em": context.negociacaoIniciadaEm,
})}

${formatResponseGapStats(responseGapStats)}

Avalie a condução do vendedor na conversa inteira, de ponta a ponta (o resultado acima é contexto para o relatório, não deve influenciar a nota por si só, conforme a seção 7.4 do manual). "Negociação iniciada em" é só informativo — na prática a tag costuma ser aplicada depois que a conversa relevante já começou, então NÃO descarte nem trate como "só pano de fundo" as mensagens anteriores a essa data: se fazem parte do atendimento que levou a essa negociação, contam para a nota normalmente. Segue o histórico completo de WhatsApp com esse cliente, do início do relacionamento até agora:`;

  const content: ContentPart[] = [
    { type: "input_text", text: introText },
    ...(await buildTranscriptParts(messages)),
  ];

  const response = await openai.responses.create({
    model: AGENT_MODEL,
    instructions: buildSystemPrompt(AUDITOR_MODE_INSTRUCTIONS),
    input: [{ role: "user", content }],
    // High effort: this runs in the background batch cron, not blocking a
    // user, so the extra reasoning latency is worth it for score quality.
    reasoning: { effort: "high", context: "current_turn" },
    text: {
      format: {
        type: "json_schema",
        name: "auditor_report",
        schema: AUDITOR_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    // Reasoning tokens for a "high" effort call on a full manual + full
    // conversation history + images can be substantial — same truncation
    // risk documented when this ran on Gemini, so keep a generous budget.
    max_output_tokens: 16000,
  });

  const report = JSON.parse(response.output_text || "{}") as AuditorReport;

  if (report.naoAvaliavel) {
    return { report, score: null, classification: null, hasCriticalError: false };
  }

  const notas = report.notasPorCriterio;
  const somaBruta =
    clampCriterio(notas.precisaoInformacoes, 25) +
    clampCriterio(notas.entendimentoNecessidade, 20) +
    clampCriterio(notas.construcaoValor, 20) +
    clampCriterio(notas.conducaoProximoPasso, 20) +
    clampCriterio(notas.clarezaComunicacao, 15);

  const hasCriticalError = (report.errosCriticos || []).length > 0;
  const score = hasCriticalError ? Math.min(somaBruta, 69) : somaBruta;

  return { report, score, classification: classify(score), hasCriticalError };
}

// ---------------------------------------------------------------------------
// Modo Copiloto
// ---------------------------------------------------------------------------

const COPILOTO_MODE_INSTRUCTIONS = `Modo: Copiloto de negociação. A negociação ainda está aberta — não dê
nota, dê orientação (manual, seção 8.5). Não invente probabilidade de
fechamento. Proponha uma única próxima melhor ação.

Use os sinais de tempo de resposta informados no contexto: se o cliente
está demorando a responder, a melhor ação pode ser uma pausa estratégica
(não insistir) ou um follow-up específico (D1/D3/D7, seção 6.5 do manual)
em vez de sempre sugerir uma mensagem imediata. Se for o vendedor que está
demorando a responder o cliente, sinalize isso como o bloqueio principal.`;

const COPILOTO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    situacaoAtual: {
      type: "string",
      enum: [
        "avancando",
        "estagnada",
        "em_risco",
        "aguardando_cliente",
        "aguardando_acao_interna",
      ],
    },
    objetivoProvavelCliente: { type: "string" },
    sinaisCompra: { type: "array", items: { type: "string" } },
    objecoesAbertas: { type: "array", items: { type: "string" } },
    informacoesNecessarias: { type: "array", items: { type: "string" } },
    proximaAcao: { type: "string" },
    mensagemSugerida: { type: "string" },
    evitar: { type: "string" },
  },
  required: [
    "situacaoAtual",
    "objetivoProvavelCliente",
    "sinaisCompra",
    "objecoesAbertas",
    "informacoesNecessarias",
    "proximaAcao",
    "mensagemSugerida",
    "evitar",
  ],
  additionalProperties: false,
} as const;

export interface CopilotoContext {
  vendedor: string | null;
  etapaCrm: string | null;
  valorNegociacao: number | null;
  qtyPares: number | null;
}

export interface CopilotoReport {
  situacaoAtual:
    | "avancando"
    | "estagnada"
    | "em_risco"
    | "aguardando_cliente"
    | "aguardando_acao_interna";
  objetivoProvavelCliente: string;
  sinaisCompra: string[];
  objecoesAbertas: string[];
  informacoesNecessarias: string[];
  proximaAcao: string;
  mensagemSugerida: string;
  evitar: string;
}

export async function runCopiloto(
  messages: NegotiationMessage[],
  responseGapStats: ResponseGapStats,
  context: CopilotoContext,
): Promise<CopilotoReport> {
  const introText = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
})}

${formatResponseGapStats(responseGapStats)}

Analise esta negociação em andamento e diga o próximo passo. Segue o histórico completo de WhatsApp com esse cliente, desde o início do relacionamento:`;

  const content: ContentPart[] = [
    { type: "input_text", text: introText },
    ...(await buildTranscriptParts(messages)),
  ];

  const response = await openai.responses.create({
    model: AGENT_MODEL,
    instructions: buildSystemPrompt(COPILOTO_MODE_INSTRUCTIONS),
    input: [{ role: "user", content }],
    // Medium effort: this is the on-demand "Gerar Insight" click — a user
    // is waiting on the response, so it trades some reasoning depth for
    // latency (unlike the background Auditor cron above).
    reasoning: { effort: "medium", context: "current_turn" },
    text: {
      format: {
        type: "json_schema",
        name: "copiloto_report",
        schema: COPILOTO_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    max_output_tokens: 16000,
  });

  return JSON.parse(response.output_text || "{}") as CopilotoReport;
}
