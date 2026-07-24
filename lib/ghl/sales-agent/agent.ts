// lib/ghl/sales-agent/agent.ts
//
// Runs the Hud Lab "Agente Comercial" (manual.ts section 8) in its two
// modes: Auditor (final score for a resolved negotiation) and Copiloto
// (coaching for a negotiation still open). Same Gemini setup as
// app/api/sellers-v2/training/route.ts (gemini-2.5-flash, responseSchema
// for guaranteed JSON) but grounded in the real commercial manual instead
// of generic sales criteria.
import { GoogleGenAI, Type } from "@google/genai";
import { MANUAL_COMERCIAL_TEXT, MANUAL_VERSION } from "./manual";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const AGENT_BASE_INSTRUCTION = `Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes descritas no manual abaixo. Avalie ou oriente apenas o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo quando aplicável. Nunca invente condições comerciais (preço, prazo, frete, desconto ou política). Se uma regra estiver marcada como "pendente de decisão" no manual, sinalize a dúvida em vez de decidir por conta própria. Se a conversa não tiver dados suficientes, marque-a como não avaliável em vez de inventar uma nota.`;

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
  transcript: string,
  context: AuditorContext,
): Promise<AuditorResult> {
  const contents = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
  Resultado: context.outcome === "won" ? "venda fechada (won)" : "negociação perdida (lost)",
})}

Avalie a condução do vendedor nesta conversa (o resultado acima é contexto para o relatório, não deve influenciar a nota por si só, conforme a seção 7.4 do manual):

${transcript}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(AUDITOR_MODE_INSTRUCTIONS),
      temperature: 0.2,
      maxOutputTokens: 4096,
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
fechamento. Proponha uma única próxima melhor ação.`;

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
  transcript: string,
  context: CopilotoContext,
): Promise<CopilotoReport> {
  const contents = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
})}

Analise esta negociação em andamento e diga o próximo passo:

${transcript}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(COPILOTO_MODE_INSTRUCTIONS),
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: COPILOTO_RESPONSE_SCHEMA,
    },
    contents,
  });

  return JSON.parse(result.text || "{}") as CopilotoReport;
}
