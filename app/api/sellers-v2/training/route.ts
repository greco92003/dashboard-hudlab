import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import {
  computeResponseGapStats,
  type NegotiationMessage,
} from "@/lib/ghl/negotiation-conversations";
import { runAuditor } from "@/lib/ghl/sales-agent/agent";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Grounded in the real Manual Comercial Hud Lab (lib/ghl/sales-agent/manual.ts,
// seções 1-2) — kept as a short, chat-latency-friendly excerpt here rather
// than the full manual (which the Auditor uses for the one-shot evaluation
// call), since this prompt runs on every single back-and-forth turn.
const SYSTEM_PROMPT = `Você é um CLIENTE difícil e exigente que está considerando comprar CHINELOS SLIDE personalizados da HUD LAB.

PRODUTO: A Hud Lab vende Chinelo Slide personalizado. Nunca mencione tênis, sapato, sandália ou qualquer outro produto — apenas chinelo.

REGRAS COMERCIAIS REAIS (use exatamente estes números ao perguntar ou fazer objeção — nunca invente outros valores):
- Pedido mínimo: 12 pares.
- Preço por par: 12 a 23 pares R$ 67,90 | 24 a 99 pares R$ 59,90 | 100 a 499 pares R$ 54,90 | 500 a 999 pares R$ 52,90 | 1.000 pares ou mais R$ 49,90.
- Frete grátis a partir de 36 pares para todo o Brasil; abaixo disso o frete é calculado por CEP.
- Personalização: Hud Lab Start (12 pares, Silk 1 cor), Silk (24 pares, até 3 cores), Silk Relevo (60 pares), 3D (132 pares), Sola colorida (adicional de R$ 5,00/par, mín. 100 pares). O preço não muda pela técnica escolhida, só pela quantidade total.
- Pagamento: PIX à vista (5% de desconto), cartão até 3x sem juros ou até 6x com juros da operadora, ou 50% para liberar a produção + 50% antes do envio.
- Prazo de produção: 15 dias úteis a partir do pagamento. A Amostra Digital é entregue antes do pagamento, em até 24h úteis.

PAPEL IMPORTANTE: Você é o CLIENTE. As mensagens que você recebe são do VENDEDOR da Hud Lab. Você SEMPRE responde como cliente — nunca como vendedor.

PERFIL ALEATÓRIO — escolha UM dos perfis abaixo para esta conversa e mantenha-o do início ao fim:
1. Cético de preço: acha caro, pede desconto, compara com chinelo de loja — usa os números reais acima como referência (ex.: "R$ 67,90 por par é muito").
2. Desconfiado de qualidade: duvida da durabilidade, pergunta sobre materiais e acabamento.
3. Apressado: tem urgência real de prazo (ex.: evento em poucos dias), fica impaciente com respostas longas.
4. Comparador: já pesquisou outro fornecedor, questiona o diferencial da Hud Lab — pode citar "outro orçamento" pra testar se o vendedor sabe comparar direito.
5. Indeciso sobre quantidade: em cima do muro entre 12, 24 ou 36 pares — testa se o vendedor explica bem os saltos de preço e o frete grátis.
6. Cético da marca: nunca ouviu falar da Hud Lab, questiona credibilidade e reputação.

REGRAS DE COMPORTAMENTO:
- Você é o CLIENTE, não o vendedor. Nunca ofereça produtos, nunca elogie a Hud Lab espontaneamente.
- Levante APENAS UMA objeção por mensagem. Nunca acumule objeções.
- NÃO ceda fácil. Exija pelo menos 3-4 respostas convincentes antes de amolecer.
- Se o vendedor errar um número (preço, mínimo, frete, prazo), NÃO corrija o erro — apenas reaja como um cliente real reagiria (confuso, desconfiado, ou aproveitando a informação errada a seu favor). A avaliação de desempenho depois é que vai identificar esse erro, você não deve sinalizar nada.
- Se o vendedor for convincente e profissional, vá cedendo aos poucos.
- Se o vendedor for fraco ou evasivo, pressione mais.
- Responda de forma curta (1-3 frases COMPLETAS), como um cliente real faria no WhatsApp. NUNCA corte a frase no meio.
- Use linguagem informal brasileira.
- NÃO revele que é uma IA. Aja como cliente real.
- Varie as objeções ao longo da conversa, mas uma de cada vez.

CONTEXTO: Você viu um anúncio de chinelos personalizados e mandou mensagem para saber mais. O vendedor acabou de te responder.`;

const MIN_MESSAGES_TO_EVALUATE = 2;

interface TrainingChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { action, messages } = body as {
      action: string;
      messages: TrainingChatMessage[];
    };

    if (action === "chat") {
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));

      const lastMessage = messages[messages.length - 1];
      const chat = genAI.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.9,
          maxOutputTokens: 1024,
        },
        history,
      });
      const result = await chat.sendMessage({ message: lastMessage.content });

      return NextResponse.json({
        success: true,
        response: result.text,
      });
    }

    if (action === "evaluate") {
      if (!messages || messages.length < MIN_MESSAGES_TO_EVALUATE) {
        return NextResponse.json(
          { error: "Conversa muito curta para avaliar." },
          { status: 400 },
        );
      }

      // The frontend never actually sent `sellerName` (confirmed: it's not
      // referenced anywhere in app/sellers_v2/page.tsx) — the only real data
      // in seller_training_sessions is 6 rows from a single manual test in
      // Feb 2026. Deriving it from the authenticated user's own profile is
      // the correct source: it can't be forgotten/spoofed client-side, and
      // it's the exact same identity used everywhere else in the app.
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();
      const resolvedSellerName =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "Vendedor";

      // Reuses the exact same scoring function as real negotiations
      // (lib/ghl/sales-agent/agent.ts) so a training score and a real
      // Auditor score are genuinely comparable, not just similarly shaped.
      const negotiationMessages: NegotiationMessage[] = messages.map(
        (m, i) => ({
          id: `training-${i}`,
          direction: m.role === "user" ? "outbound" : "inbound",
          body: m.content,
          dateAdded: m.timestamp || new Date().toISOString(),
          userId: null,
          attachments: [],
        }),
      );

      const result = await runAuditor(
        negotiationMessages,
        computeResponseGapStats(negotiationMessages),
        {
          vendedor: resolvedSellerName,
          etapaCrm: "Treinamento simulado",
          valorNegociacao: null,
          qtyPares: null,
          // No real "Em Negociação" boundary here — the whole exercise is
          // the scored conversation, so the boundary is its first message.
          negociacaoIniciadaEm: negotiationMessages[0].dateAdded,
        },
      );

      // Save to Supabase
      const { data: session, error: insertError } = await supabase
        .from("seller_training_sessions")
        .insert({
          seller_name: resolvedSellerName,
          started_at: negotiationMessages[0].dateAdded,
          ended_at: new Date().toISOString(),
          score: result.score,
          transcript: messages,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving training session:", insertError);
      }

      return NextResponse.json({ success: true, evaluation: result, session });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    console.error("Training API error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      geminiKey: process.env.GEMINI_API_KEY
        ? `${process.env.GEMINI_API_KEY.substring(0, 6)}...configurada`
        : "NOT SET",
    });

    // Handle quota/rate limit errors
    if (error?.status === 429 || error?.message?.includes("quota")) {
      return NextResponse.json(
        {
          error: "Cota da API de IA excedida. Tente novamente mais tarde.",
          code: "QUOTA_EXCEEDED",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: error.message || "Erro interno" },
      { status: 500 },
    );
  }
}
