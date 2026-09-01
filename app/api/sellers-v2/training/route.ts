import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  computeResponseGapStats,
  type NegotiationMessage,
} from "@/lib/ghl/negotiation-conversations";
import {
  runAuditor,
  type AuditorResult,
} from "@/lib/ghl/sales-agent/agent";
import { TRAINING_CUSTOMER_KNOWLEDGE } from "@/lib/ghl/sales-agent/training-knowledge";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const TRAINING_MODEL = "gpt-5.6-terra";

// Grounded in the real Manual Comercial Hud Lab (lib/ghl/sales-agent/manual.ts,
// seções 1-3) — kept as a short, chat-latency-friendly excerpt here rather
// than the full manual (which the Auditor uses for the one-shot evaluation
// call), since this prompt runs on every single back-and-forth turn.
const SYSTEM_PROMPT = `Você é um CLIENTE difícil e exigente que está considerando comprar CHINELOS SLIDE personalizados da HUD LAB.

${TRAINING_CUSTOMER_KNOWLEDGE}

PRODUTO: A Hud Lab vende Chinelo Slide personalizado. Nunca mencione tênis, sapato, sandália ou qualquer outro produto — apenas chinelo.

REGRAS COMERCIAIS REAIS (use exatamente estes números ao perguntar ou fazer objeção — nunca invente outros valores):
- Pedido mínimo: 12 pares.
- Preço por par: 12 a 23 pares R$ 67,90 | 24 a 99 pares R$ 59,90 | 100 a 499 pares R$ 54,90 | 500 a 999 pares R$ 52,90 | 1.000 pares ou mais R$ 49,90.
- Frete grátis a partir de 36 pares para todo o Brasil; abaixo disso o frete é calculado por CEP.
- Personalização: Hud Lab Start (12 pares, Silk 1 cor); Silk a partir de 24 pares (até 3 cores entre 24 e 35 pares; até 4 cores a partir de 36 pares); Silk Relevo (60 pares); 3D (132 pares); Sola colorida (adicional de R$ 5,00/par, mín. 100 pares). O preço não muda pela técnica escolhida, só pela quantidade total.
- Pagamento: PIX à vista (5% de desconto), cartão até 3x sem juros ou até 6x com juros da operadora, ou 50% para liberar a produção + 50% antes do envio.
- Prazo de produção: 15 dias úteis a partir do pagamento. A Amostra Digital é entregue antes do pagamento, em até 24h úteis.
- Materiais: sola Micro Expandida Comfort, gáspea em Napa Way de aproximadamente 3,5 mm, etiqueta lateral externa em TPU, caixa personalizada, cola base d'água e acabamento de fábrica.
- Numerações: infantil 28/29, 30/31 e 32/33; adulto 34/35, 36/37, 38/39, 40/41, 42/43 e 44/45. A grade é livre entre as numerações disponíveis.
- Fluxo: entender a necessidade, receber logo, criar a Amostra Digital, ajustar e aprovar, definir quantidade/grade/endereço/pagamento, receber pagamento ou entrada, produzir e expedir. Nunca existe pagamento antes da Amostra Digital.
- Garantia: garantia de fábrica contra defeitos de fabricação, sujeita à análise de fotos ou vídeos, quantidade afetada, numerações, pedido e data de recebimento.

PAPEL IMPORTANTE: Você é o CLIENTE. As mensagens que você recebe são do VENDEDOR da Hud Lab. Você SEMPRE responde como cliente — nunca como vendedor.

CENÁRIO DO CLIENTE:
- Na primeira resposta, escolha uma aplicação realista: marca/collab, time/CT, empresa, evento ou revenda.
- Defina silenciosamente um contexto coerente (objetivo, quantidade aproximada, data e quem decide). Revele essas informações aos poucos, somente quando a conversa pedir.
- Mantenha os fatos desse cliente consistentes até o fim. Não troque de empresa, evento, quantidade ou prazo sem motivo.
- O perfil define a personalidade do cliente, não um único assunto. Um mesmo cliente pode ter dúvidas de produto, processo, confiança, prazo, pagamento e preço.

REGRAS DE COMPORTAMENTO:
- Você é o CLIENTE, não o vendedor. Nunca ofereça produtos, nunca elogie a Hud Lab espontaneamente.
- Levante APENAS UMA dúvida ou objeção por mensagem. Nunca acumule assuntos.
- NÃO ceda fácil. Exija pelo menos 3-4 respostas convincentes antes de amolecer.
- Se o vendedor errar um número (preço, mínimo, frete, prazo), NÃO corrija o erro — apenas reaja como um cliente real reagiria (confuso, desconfiado, ou aproveitando a informação errada a seu favor). A avaliação de desempenho depois é que vai identificar esse erro, você não deve sinalizar nada.
- Se o vendedor for convincente e profissional, vá cedendo aos poucos.
- Se o vendedor for fraco ou evasivo, pressione mais.
- Responda de forma curta (1-3 frases COMPLETAS), como um cliente real faria no WhatsApp. NUNCA corte a frase no meio.
- Use linguagem informal brasileira.
- NÃO revele que é uma IA. Aja como cliente real.
- Não repita uma dúvida que o vendedor já respondeu corretamente. Se ele for evasivo, pressione o mesmo assunto no máximo uma vez antes de avançar.
- Preço não é a objeção padrão: só o torne o assunto principal quando o foco da rodada mandar. Se o vendedor falar de preço antes, reaja brevemente e continue a conversa.
- Faça perguntas naturais, não recite as regras comerciais e não transforme a conversa em questionário.

CONTEXTO: Você viu um anúncio de chinelos personalizados e mandou mensagem para saber mais. O vendedor acabou de te responder.`;

// The server chooses the next dimension instead of asking the model to be
// "random". This makes a 15-minute session cover the whole sales process and
// prevents a price persona from monopolizing every turn.
const TRAINING_FOCUS_CYCLE = [
  "aplicação e objetivo real da compra",
  "quantidade, grade e numerações necessárias",
  "possibilidades e limites da personalização",
  "qualidade, materiais, conforto e durabilidade",
  "envio do logo, Amostra Digital, ajustes e aprovação",
  "prazo de produção versus prazo de transporte",
  "credibilidade da HUD LAB e segurança para comprar",
  "comparação com outro fornecedor e diferenciais relevantes",
  "frete, CEP e impacto da quantidade no envio",
  "formas de pagamento e aprovação interna da compra",
  "preço, valor percebido e eventual pedido de desconto",
  "garantia, defeitos e risco de o produto final não corresponder à expectativa",
] as const;

function getRoundFocus(messages: TrainingChatMessage[]): string {
  const clientReplies = messages.filter((message) => message.role === "assistant").length;
  return TRAINING_FOCUS_CYCLE[clientReplies % TRAINING_FOCUS_CYCLE.length];
}

function buildTurnInstructions(messages: TrainingChatMessage[]): string {
  return `${SYSTEM_PROMPT}

FOCO DESTA RODADA: ${getRoundFocus(messages)}.
Use esse foco para formular a próxima fala de maneira natural e coerente com o histórico. Não mencione que existe um foco ou uma sequência de treinamento.`;
}

const TRAINING_DURATION_MS = 15 * 60 * 1000;
const MIN_MESSAGES_TO_EVALUATE = 4;

const CLIENT_OPENING_QUESTIONS = [
  "Oi! Vocês fazem chinelos personalizados para um evento de empresa? Como funciona para criar um modelo com a nossa marca?",
  "Olá! Estou procurando um brinde diferente para a minha equipe. Vocês conseguem personalizar os chinelos com a identidade da empresa?",
  "Oi! Vi os slides personalizados de vocês e queria entender se funcionam bem para uma collab de marca. Como começa o projeto?",
  "Boa tarde! Vocês atendem pedidos para times e centros de treinamento? Queria saber como fazemos uma arte exclusiva.",
  "Oi! Estou organizando um evento e pensei em chinelos personalizados. O que vocês precisam para montar uma proposta?",
  "Olá! Tenho uma loja e estou avaliando uma coleção de slides para revenda. Vocês trabalham com esse tipo de projeto?",
] as const;

interface TrainingChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface TrainingSessionRow {
  id: string;
  user_id: string | null;
  seller_name: string;
  started_at: string;
  deadline_at: string;
  ended_at: string | null;
  score: number | null;
  transcript: TrainingChatMessage[] | null;
  status: "active" | "evaluating" | "completed" | "expired" | "failed";
  evaluation: AuditorResult | null;
  completion_reason: string | null;
  model: string | null;
  token_usage: Record<string, number> | null;
  updated_at: string;
}

type TrainingSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function classify(score: number): string {
  if (score >= 90) return "Excelente";
  if (score >= 80) return "Bom";
  if (score >= 70) return "Atenção";
  if (score >= 60) return "Insuficiente";
  return "Crítico";
}

function buildIncompleteEvaluation(reason: string): AuditorResult {
  return {
    score: 0,
    classification: "Crítico",
    hasCriticalError: false,
    report: {
      naoAvaliavel: false,
      motivoNaoAvaliavel: "",
      resumo: reason,
      notasPorCriterio: {
        precisaoInformacoes: 0,
        entendimentoNecessidade: 0,
        construcaoValor: 0,
        conducaoProximoPasso: 0,
        clarezaComunicacao: 0,
      },
      justificativasPorCriterio: {
        precisaoInformacoes: reason,
        entendimentoNecessidade: reason,
        construcaoValor: reason,
        conducaoProximoPasso: reason,
        clarezaComunicacao: reason,
      },
      evidencias: [],
      acertos: [],
      falhas: [reason],
      errosCriticos: [],
      exemploRespostaMelhor:
        "Conclua os 15 minutos e mantenha a conversa ativa para que todas as competências possam ser avaliadas.",
    },
  };
}

function serializeSession(session: TrainingSessionRow) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.started_at,
    deadlineAt: session.deadline_at,
    endedAt: session.ended_at,
    messages: session.transcript ?? [],
    evaluation: session.evaluation,
    score: session.score,
    completionReason: session.completion_reason,
  };
}

async function resolveSellerName(
  supabase: TrainingSupabaseClient,
  user: { id: string; email?: string },
): Promise<string> {
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("Failed to load profile for training seller name:", error);
  }
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Vendedor"
  );
}

async function generateClientReply(
  messages: TrainingChatMessage[],
  userId: string,
) {
  const response = await openai.responses.create({
    model: TRAINING_MODEL,
    instructions: buildTurnInstructions(messages),
    input: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    reasoning: {
      effort: "medium",
      context: "current_turn",
    },
    text: { verbosity: "low" },
    max_output_tokens: 1200,
    store: false,
    safety_identifier: createHash("sha256").update(userId).digest("hex"),
  });

  const reply = response.output_text.trim();
  if (!reply) {
    throw new Error("A OpenAI não retornou uma resposta de texto.");
  }

  return {
    reply,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

function accumulateUsage(
  current: Record<string, number> | null,
  added: Record<string, number>,
) {
  return Object.fromEntries(
    Object.keys(added).map((key) => [key, (current?.[key] ?? 0) + added[key]]),
  );
}

function toNegotiationMessages(messages: TrainingChatMessage[]): NegotiationMessage[] {
  return messages.map((message, index) => ({
    id: message.id ?? `training-${index}`,
    direction: message.role === "user" ? "outbound" : "inbound",
    body: message.content,
    dateAdded: message.timestamp || new Date().toISOString(),
    userId: null,
    attachments: [],
  }));
}

async function getOwnedSession(
  supabase: TrainingSupabaseClient,
  userId: string,
  sessionId: string,
): Promise<TrainingSessionRow | null> {
  const { data, error } = await supabase
    .from("seller_training_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as TrainingSessionRow | null;
}

async function waitForFinalizedSession(
  supabase: TrainingSupabaseClient,
  userId: string,
  sessionId: string,
  fallback: TrainingSessionRow,
): Promise<TrainingSessionRow> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const latest = await getOwnedSession(supabase, userId, sessionId);
    if (latest && latest.status !== "evaluating") return latest;
  }
  return (await getOwnedSession(supabase, userId, sessionId)) ?? fallback;
}

async function finishSession(
  supabase: TrainingSupabaseClient,
  session: TrainingSessionRow,
  reason: "manual" | "timer" | "timeout",
): Promise<TrainingSessionRow> {
  if (session.status !== "active") return session;

  // Claim the session before running the auditor. GET restoration, the timer
  // and the rankings refresh may all notice the same deadline; only one of
  // them is allowed to evaluate and persist the result.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("seller_training_sessions")
    .update({ status: "evaluating", updated_at: claimedAt })
    .eq("id", session.id)
    .eq("user_id", session.user_id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    return waitForFinalizedSession(
      supabase,
      session.user_id!,
      session.id,
      session,
    );
  }
  session = claimed as TrainingSessionRow;

  try {
    const messages = session.transcript ?? [];
    let result: AuditorResult;
    if (messages.length < MIN_MESSAGES_TO_EVALUATE) {
      result = buildIncompleteEvaluation(
        "Treinamento encerrado sem trocas suficientes para avaliar a condução do vendedor.",
      );
    } else {
      const negotiationMessages = toNegotiationMessages(messages);
      result = await runAuditor(
        negotiationMessages,
        computeResponseGapStats(negotiationMessages),
        {
          vendedor: session.seller_name,
          etapaCrm: "Treinamento simulado",
          valorNegociacao: null,
          qtyPares: null,
          negociacaoIniciadaEm: session.started_at,
        },
      );

      if (result.score == null) {
        result = buildIncompleteEvaluation(
          "A conversa não forneceu evidências suficientes para concluir o treinamento.",
        );
      } else if (
        reason === "manual" &&
        Date.now() < new Date(session.deadline_at).getTime()
      ) {
        const cappedScore = Math.min(result.score, 49);
        const earlyFinishReason =
          "O treinamento foi encerrado antes dos 15 minutos obrigatórios; por isso a nota foi limitada a 49.";
        result = {
          ...result,
          score: cappedScore,
          classification: classify(cappedScore),
          report: {
            ...result.report,
            resumo: `${earlyFinishReason} ${result.report.resumo}`,
            falhas: [earlyFinishReason, ...(result.report.falhas ?? [])],
          },
        };
      }
    }

    const endedAt = new Date().toISOString();
    const status = reason === "timeout" ? "expired" : "completed";
    const { data, error } = await supabase
      .from("seller_training_sessions")
      .update({
        ended_at: endedAt,
        score: result.score,
        evaluation: result,
        status,
        completion_reason: reason,
        updated_at: endedAt,
      })
      .eq("id", session.id)
      .eq("user_id", session.user_id)
      .eq("status", "evaluating")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) return data as TrainingSessionRow;
    return (
      (await getOwnedSession(supabase, session.user_id!, session.id)) ?? session
    );
  } catch (error) {
    await supabase
      .from("seller_training_sessions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("user_id", session.user_id)
      .eq("status", "evaluating");
    throw error;
  }
}

async function authenticateTrainingRequest() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

function trainingErrorResponse(error: any) {
  console.error("Training API error:", {
    message: error?.message,
    status: error?.status,
    code: error?.code,
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
  });

  if (
    error?.status === 429 ||
    error?.code === "rate_limit_exceeded" ||
    error?.code === "insufficient_quota" ||
    error?.message?.toLowerCase().includes("quota")
  ) {
    return NextResponse.json(
      {
        error: "Cota da API de IA excedida. Tente novamente mais tarde.",
        code: "QUOTA_EXCEEDED",
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { error: error?.message || "Erro interno" },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await authenticateTrainingRequest();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const requestedId = request.nextUrl.searchParams.get("sessionId");
    const latestFeedback = request.nextUrl.searchParams.get("latestFeedback") === "1";
    const feedbackHistory = request.nextUrl.searchParams.get("feedbackHistory") === "1";

    if (feedbackHistory) {
      const { data, error } = await supabase
        .from("seller_training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["completed", "expired"])
        .not("evaluation", "is", null)
        .order("ended_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return NextResponse.json({
        success: true,
        sessions: (data ?? []).map((item) =>
          serializeSession(item as TrainingSessionRow),
        ),
      });
    }

    let session: TrainingSessionRow | null = null;
    if (latestFeedback) {
      const { data, error } = await supabase
        .from("seller_training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["completed", "expired"])
        .not("evaluation", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      session = data as TrainingSessionRow | null;
    } else if (requestedId) {
      session = await getOwnedSession(supabase, user.id, requestedId);
    } else {
      // Keep today's latest result visible after a refresh so the seller can
      // revisit the feedback. Brazil currently uses UTC-3 year-round.
      const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const todayStartUtc = new Date(
        Date.UTC(
          nowBRT.getUTCFullYear(),
          nowBRT.getUTCMonth(),
          nowBRT.getUTCDate(),
          3,
        ),
      );
      const { data, error } = await supabase
        .from("seller_training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "evaluating", "completed", "expired"])
        .gte("started_at", todayStartUtc.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      session = data as TrainingSessionRow | null;
    }

    if (session?.status === "active" && new Date(session.deadline_at).getTime() <= Date.now()) {
      session = await finishSession(supabase, session, "timeout");
    } else if (session?.status === "evaluating") {
      session = await waitForFinalizedSession(
        supabase,
        user.id,
        session.id,
        session,
      );
    }

    return NextResponse.json({
      success: true,
      session: session ? serializeSession(session) : null,
    });
  } catch (error: any) {
    return trainingErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await authenticateTrainingRequest();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action: "start" | "chat" | "evaluate";
      sessionId?: string;
      message?: TrainingChatMessage;
      completionReason?: "manual" | "timer";
    };

    if (body.action === "start") {
      const { data: activeData, error: activeError } = await supabase
        .from("seller_training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeError) throw activeError;

      let activeSession = activeData as TrainingSessionRow | null;
      if (activeSession) {
        if (new Date(activeSession.deadline_at).getTime() <= Date.now()) {
          activeSession = await finishSession(supabase, activeSession, "timeout");
        } else {
          return NextResponse.json({
            success: true,
            session: serializeSession(activeSession),
          });
        }
      }

      const sellerName = await resolveSellerName(supabase, user);
      const startedAt = new Date();
      const deadlineAt = new Date(startedAt.getTime() + TRAINING_DURATION_MS);
      const { data: inserted, error: insertError } = await supabase
        .from("seller_training_sessions")
        .insert({
          user_id: user.id,
          seller_name: sellerName,
          started_at: startedAt.toISOString(),
          deadline_at: deadlineAt.toISOString(),
          status: "active",
          transcript: [],
          model: TRAINING_MODEL,
          token_usage: {},
          updated_at: startedAt.toISOString(),
        })
        .select("*")
        .single();
      if (insertError) throw insertError;

      const session = inserted as TrainingSessionRow;
      const opener: TrainingChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content:
          CLIENT_OPENING_QUESTIONS[
            Math.floor(Math.random() * CLIENT_OPENING_QUESTIONS.length)
          ],
        timestamp: startedAt.toISOString(),
      };

      const updatedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("seller_training_sessions")
        .update({ transcript: [opener], updated_at: updatedAt })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return NextResponse.json({
        success: true,
        session: serializeSession(updated as TrainingSessionRow),
      });
    }

    if (!body.sessionId) {
      return NextResponse.json(
        { error: "Sessão de treinamento não informada." },
        { status: 400 },
      );
    }

    let session = await getOwnedSession(supabase, user.id, body.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    if (body.action === "chat") {
      if (session.status !== "active") {
        return NextResponse.json(
          {
            error: "Esta sessão já foi finalizada.",
            code: "SESSION_FINISHED",
            session: serializeSession(session),
          },
          { status: 409 },
        );
      }
      if (new Date(session.deadline_at).getTime() <= Date.now()) {
        session = await finishSession(supabase, session, "timeout");
        return NextResponse.json(
          {
            error: "O tempo do treinamento terminou.",
            code: "SESSION_FINISHED",
            session: serializeSession(session),
          },
          { status: 409 },
        );
      }

      const incoming = body.message;
      if (!incoming?.content?.trim() || incoming.role !== "user") {
        return NextResponse.json(
          { error: "Envie uma mensagem válida do vendedor." },
          { status: 400 },
        );
      }

      const messages = [...(session.transcript ?? [])];
      const messageId = incoming.id ?? randomUUID();
      if (!messages.some((message) => message.id === messageId)) {
        messages.push({
          id: messageId,
          role: "user",
          content: incoming.content.trim(),
          timestamp: incoming.timestamp ?? new Date().toISOString(),
        });
        const persistedAt = new Date().toISOString();
        const { error: persistError } = await supabase
          .from("seller_training_sessions")
          .update({ transcript: messages, updated_at: persistedAt })
          .eq("id", session.id)
          .eq("user_id", user.id)
          .eq("status", "active");
        if (persistError) throw persistError;
      }

      const generated = await generateClientReply(messages, user.id);
      messages.push({
        id: randomUUID(),
        role: "assistant",
        content: generated.reply,
        timestamp: new Date().toISOString(),
      });
      const updatedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("seller_training_sessions")
        .update({
          transcript: messages,
          token_usage: accumulateUsage(session.token_usage, generated.usage),
          updated_at: updatedAt,
        })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .select("*")
        .single();
      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        session: serializeSession(updated as TrainingSessionRow),
      });
    }

    if (body.action === "evaluate") {
      if (session.status === "active") {
        session = await finishSession(
          supabase,
          session,
          body.completionReason === "timer" ? "timer" : "manual",
        );
      }
      return NextResponse.json({
        success: true,
        evaluation: session.evaluation,
        session: serializeSession(session),
      });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    return trainingErrorResponse(error);
  }
}
