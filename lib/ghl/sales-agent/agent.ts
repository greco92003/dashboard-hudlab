// lib/ghl/sales-agent/agent.ts
//
// Runs the Hud Lab "Agente Comercial" (manual.ts section 8) in its two
// modes: Auditor (final score for a resolved negotiation) and Copiloto
// (coaching for a negotiation still open). Same Gemini setup as
// app/api/sellers-v2/training/route.ts (gemini-2.5-flash, responseSchema
// for guaranteed JSON) but grounded in the real commercial manual instead
// of generic sales criteria.
import { GoogleGenAI, Type, type Part } from "@google/genai";
import { MANUAL_COMERCIAL_TEXT, MANUAL_VERSION } from "./manual";
import type {
  NegotiationMessage,
  ResponseGapStats,
} from "@/lib/ghl/negotiation-conversations";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const AGENT_BASE_INSTRUCTION = `Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes descritas no manual abaixo. Avalie ou oriente apenas o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo quando aplicável. Nunca invente condições comerciais (preço, prazo, frete, desconto ou política). Se uma regra estiver marcada como "pendente de decisão" no manual, sinalize a dúvida em vez de decidir por conta própria. Se a conversa não tiver dados suficientes, marque-a como não avaliável em vez de inventar uma nota. Você pode receber imagens (mockups, fotos de produto/defeito) e áudios (notas de voz) anexados à conversa — considere o conteúdo real deles como faria com qualquer mensagem de texto.`;

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
      `Última mensagem da conversa foi de ${who}, há ${Math.round(stats.minutesSinceLastMessage / 60)} h — use isso pra avaliar se faz mais sentido esperar, mandar um follow-up (D1/D3/D7 do manual) ou agir agora.`,
    );
  }
  return lines.join("\n");
}

// Only these mimetypes are actually sent to the model as media; anything
// else (video, pdf, vcard, etc.) is left as a text note only — Gemini
// supports more than this, but images/audio cover what shows up in a Hud
// Lab sales conversation (mockups, product/defect photos, voice notes).
function isSupportedAttachmentMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("audio/");
}

async function fetchAttachmentPart(url: string): Promise<Part | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!isSupportedAttachmentMimeType(mimeType)) return null;
    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch (err) {
    console.error(`negotiation agent: failed to fetch attachment ${url}`, err);
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

function collectRecentAttachmentRefs(
  messages: NegotiationMessage[],
): AttachmentRef[] {
  const refs: AttachmentRef[] = [];
  messages.forEach((m, messageIndex) => {
    for (const url of m.attachments) refs.push({ messageIndex, url });
  });
  // Messages are already chronological, so the tail of this list is also
  // the most recent attachments — no re-sort needed.
  return refs.slice(-MAX_ATTACHMENTS_PER_CALL);
}

/**
 * Turns the transcript into Gemini `contents` parts: one text part per
 * message (chronological), with the actual image/audio bytes for the most
 * recent MAX_ATTACHMENTS_PER_CALL attachments inlined right after the
 * message that carries them. Older attachments beyond the cap are noted as
 * text only, not fetched.
 */
async function buildTranscriptParts(
  messages: NegotiationMessage[],
): Promise<Part[]> {
  const includedRefs = collectRecentAttachmentRefs(messages);
  const includedUrlsByMessage = new Map<number, string[]>();
  for (const ref of includedRefs) {
    const list = includedUrlsByMessage.get(ref.messageIndex) ?? [];
    list.push(ref.url);
    includedUrlsByMessage.set(ref.messageIndex, list);
  }

  const parts: Part[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const who = m.direction === "outbound" ? "VENDEDOR" : "CLIENTE";
    const includedUrls = includedUrlsByMessage.get(i) ?? [];
    const skipped = m.attachments.length - includedUrls.length;
    const attachmentNote =
      m.attachments.length === 0
        ? ""
        : includedUrls.length > 0
          ? ` [anexo incluído abaixo${skipped > 0 ? `; +${skipped} anexo(s) mais antigo(s) desta mensagem não incluído(s)` : ""}]`
          : ` [${m.attachments.length} anexo(s) não incluído(s) — fora do limite de anexos recentes desta conversa]`;

    parts.push({
      text: `[${m.dateAdded}] ${who}: ${m.body || "(mensagem sem texto)"}${attachmentNote}`,
    });

    for (const url of includedUrls) {
      const mediaPart = await fetchAttachmentPart(url);
      if (mediaPart) parts.push(mediaPart);
    }
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
relevante de pontos.

Liste em errosCriticos qualquer ocorrência da seção 7.3 do manual (ex.:
desconto >10% sem autorização, pagamento pedido antes da Amostra
Digital, falsa urgência) — não aplique o teto de nota você mesmo, apenas
relate os erros encontrados.

Se a conversa não tiver mensagens suficientes para avaliar com
segurança, defina naoAvaliavel=true e explique o motivo em
motivoNaoAvaliavel; nesse caso os demais campos podem vir vazios/zerados.`;

const AUDITOR_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    naoAvaliavel: {
      type: Type.BOOLEAN,
      description: "true se a conversa não tem dados suficientes para avaliar",
    },
    motivoNaoAvaliavel: {
      type: Type.STRING,
      description: "Motivo quando naoAvaliavel=true; string vazia caso contrário",
    },
    resumo: { type: Type.STRING, description: "Resumo objetivo da conversa" },
    notasPorCriterio: {
      type: Type.OBJECT,
      properties: {
        precisaoInformacoes: { type: Type.INTEGER, description: "0 a 25" },
        entendimentoNecessidade: { type: Type.INTEGER, description: "0 a 20" },
        construcaoValor: { type: Type.INTEGER, description: "0 a 20" },
        conducaoProximoPasso: { type: Type.INTEGER, description: "0 a 20" },
        clarezaComunicacao: { type: Type.INTEGER, description: "0 a 15" },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
    },
    justificativasPorCriterio: {
      type: Type.OBJECT,
      properties: {
        precisaoInformacoes: { type: Type.STRING },
        entendimentoNecessidade: { type: Type.STRING },
        construcaoValor: { type: Type.STRING },
        conducaoProximoPasso: { type: Type.STRING },
        clarezaComunicacao: { type: Type.STRING },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
    },
    evidencias: { type: Type.ARRAY, items: { type: Type.STRING } },
    acertos: { type: Type.ARRAY, items: { type: Type.STRING } },
    falhas: { type: Type.ARRAY, items: { type: Type.STRING } },
    errosCriticos: { type: Type.ARRAY, items: { type: Type.STRING } },
    exemploRespostaMelhor: { type: Type.STRING },
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
};

export interface AuditorContext {
  vendedor: string | null;
  etapaCrm: string | null;
  valorNegociacao: number | null;
  qtyPares: number | null;
  outcome: "won" | "lost";
  /** ISO timestamp of when this contact entered "Em Negociação" — the transcript now includes the full history, so the model needs this boundary to know which part of the conversation is actually under evaluation. */
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
  Resultado: context.outcome === "won" ? "venda fechada (won)" : "negociação perdida (lost)",
  "Negociação iniciada em": context.negociacaoIniciadaEm,
})}

${formatResponseGapStats(responseGapStats)}

Avalie a condução do vendedor nesta conversa (o resultado acima é contexto para o relatório, não deve influenciar a nota por si só, conforme a seção 7.4 do manual). Segue o histórico completo de WhatsApp com esse cliente, do início do relacionamento até agora — mas a NOTA deve considerar apenas a condução do vendedor a partir de "Negociação iniciada em" (informado acima). Mensagens anteriores a essa data são só contexto (o que já foi combinado, orçamento, mockup etc.), não devem pesar na avaliação — trate-as como pano de fundo, não como parte do desempenho avaliado:`;

  const contents: Part[] = [
    { text: introText },
    ...(await buildTranscriptParts(messages)),
  ];

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(AUDITOR_MODE_INSTRUCTIONS),
      temperature: 0.2,
      // gemini-2.5-flash spends a variable, sometimes large chunk of this
      // budget on internal "thinking" tokens before writing the actual JSON
      // (observed 1200-2000 thinking tokens once the full manual + a full
      // conversation history + images are in context) — too tight a limit
      // here causes MAX_TOKENS truncation mid-JSON, not just a short answer.
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: AUDITOR_RESPONSE_SCHEMA,
    },
    contents,
  });

  const report = JSON.parse(result.text || "{}") as AuditorReport;

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
  type: Type.OBJECT,
  properties: {
    situacaoAtual: {
      type: Type.STRING,
      format: "enum",
      enum: [
        "avancando",
        "estagnada",
        "em_risco",
        "aguardando_cliente",
        "aguardando_acao_interna",
      ],
    },
    objetivoProvavelCliente: { type: Type.STRING },
    sinaisCompra: { type: Type.ARRAY, items: { type: Type.STRING } },
    objecoesAbertas: { type: Type.ARRAY, items: { type: Type.STRING } },
    informacoesNecessarias: { type: Type.ARRAY, items: { type: Type.STRING } },
    proximaAcao: { type: Type.STRING },
    mensagemSugerida: { type: Type.STRING },
    evitar: { type: Type.STRING },
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
};

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

  const contents: Part[] = [
    { text: introText },
    ...(await buildTranscriptParts(messages)),
  ];

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(COPILOTO_MODE_INSTRUCTIONS),
      temperature: 0.3,
      // See the comment on runAuditor's maxOutputTokens — same
      // thinking-token headroom issue, reproduced live: MAX_TOKENS
      // truncation mid-JSON in 2 of 3 real calls at the old 2048 limit
      // once the full manual + full history + images were in context.
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: COPILOTO_RESPONSE_SCHEMA,
    },
    contents,
  });

  return JSON.parse(result.text || "{}") as CopilotoReport;
}
