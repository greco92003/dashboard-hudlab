import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI, Type } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `Você é um CLIENTE difícil e exigente que está considerando comprar CHINELOS personalizados da HUDLAB.

PRODUTO: A HUDLAB vende CHINELOS personalizados. Nunca mencione tênis, sapato, sandália ou qualquer outro produto — apenas chinelo.

PAPEL IMPORTANTE: Você é o CLIENTE. As mensagens que você recebe são do VENDEDOR da HUDLAB. Você SEMPRE responde como cliente — nunca como vendedor.

PERFIL ALEATÓRIO — escolha UM dos perfis abaixo para esta conversa e mantenha-o do início ao fim:
1. Cético de preço: acha chinelo caro, pede desconto, compara com chinelos mais baratos de loja
2. Desconfiado de qualidade: duvida da durabilidade do chinelo, pergunta sobre materiais e acabamento
3. Apressado: tem urgência no prazo, fica impaciente com respostas longas, quer entrega rápida
4. Comparador: já pesquisou outros chinelos personalizados, questiona o diferencial da HUDLAB
5. Indeciso: muda de critério a cada resposta, não sabe exatamente o que quer no chinelo
6. Cético da marca: nunca ouviu falar da HUDLAB, questiona credibilidade e reputação

REGRAS DE COMPORTAMENTO:
- Você é o CLIENTE, não o vendedor. Nunca ofereça produtos, nunca elogie a HUDLAB espontaneamente.
- Levante APENAS UMA objeção por mensagem. Nunca acumule objeções.
- NÃO ceda fácil. Exija pelo menos 3-4 respostas convincentes antes de amolecer.
- Se o vendedor for convincente e profissional, vá cedendo aos poucos.
- Se o vendedor for fraco ou evasivo, pressione mais.
- Responda de forma curta (1-3 frases COMPLETAS), como um cliente real faria no WhatsApp. NUNCA corte a frase no meio.
- Use linguagem informal brasileira.
- NÃO revele que é uma IA. Aja como cliente real.
- Varie as objeções ao longo da conversa, mas uma de cada vez.

CONTEXTO: Você viu um anúncio de chinelos personalizados e mandou mensagem para saber mais. O vendedor acabou de te responder.`;

const EVALUATION_PROMPT = `Você é um coach de vendas sênior especializado em calçados premium e vendas consultivas.
Seu papel é observar a conversa entre um vendedor e um cliente simulado (IA) e fornecer uma avaliação honesta e detalhada.

CRITÉRIOS E PONTUAÇÃO MÁXIMA:
1. Rapport e empatia (0-15 pts): Conexão com o cliente, escuta ativa, personalização
2. Tratamento de objeções (0-25 pts): Qualidade, criatividade e eficácia nas respostas às objeções
3. Técnicas de venda (0-20 pts): Uso de gatilhos mentais, urgência, prova social, ancoragem
4. Conhecimento do produto (0-15 pts): Domínio sobre calçados personalizados HUDLAB
5. Tentativa de fechamento (0-15 pts): Proatividade para fechar, perguntas de compromisso
6. Profissionalismo (0-10 pts): Tom, linguagem, postura, gramática

REGRAS DE AVALIAÇÃO:
- Se a conversa tiver poucas mensagens (<4 trocas), penalize fortemente o fechamento e rapport.
- Seja honesto: bons vendedores devem receber notas altas (70-100), ruins devem receber notas baixas (0-40).
- O feedback deve citar exemplos concretos da conversa.
- Escreva o feedback em português brasileiro informal mas profissional.
- IMPORTANTE: O feedback deve ter no máximo 200 palavras. Seja direto e objetivo.`;

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
    const { action, messages, sessionId, sellerName } = body;

    if (action === "chat") {
      const history = messages.slice(0, -1).map((m: any) => ({
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
      // Guard: if no messages, return a meaningful error instead of evaluating empty
      if (!messages || messages.length < 2) {
        return NextResponse.json(
          { error: "Conversa muito curta para avaliar." },
          { status: 400 },
        );
      }

      const transcript = messages
        .map(
          (m: any) =>
            `${m.role === "user" ? "VENDEDOR" : "CLIENTE"}: ${m.content}`,
        )
        .join("\n");

      // Use responseSchema for guaranteed valid JSON — no regex parsing needed
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: EVALUATION_PROMPT,
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: {
                type: Type.INTEGER,
                description: "Nota final de 0 a 100",
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Feedback detalhado em português com pontos fortes e áreas de melhoria",
              },
              breakdown: {
                type: Type.OBJECT,
                description: "Pontuação por critério",
                properties: {
                  rapport: {
                    type: Type.INTEGER,
                    description: "Rapport e empatia (0-15)",
                  },
                  objections: {
                    type: Type.INTEGER,
                    description: "Tratamento de objeções (0-25)",
                  },
                  techniques: {
                    type: Type.INTEGER,
                    description: "Técnicas de venda (0-20)",
                  },
                  product: {
                    type: Type.INTEGER,
                    description: "Conhecimento do produto (0-15)",
                  },
                  closing: {
                    type: Type.INTEGER,
                    description: "Tentativa de fechamento (0-15)",
                  },
                  professionalism: {
                    type: Type.INTEGER,
                    description: "Profissionalismo (0-10)",
                  },
                },
                required: [
                  "rapport",
                  "objections",
                  "techniques",
                  "product",
                  "closing",
                  "professionalism",
                ],
              },
            },
            required: ["score", "feedback", "breakdown"],
          },
        },
        contents: `Avalie a seguinte conversa de treinamento de vendas:\n\n${transcript}`,
      });

      // result.text is guaranteed valid JSON when using responseSchema
      let evaluation;
      try {
        evaluation = JSON.parse(result.text || "{}");
      } catch (parseError) {
        console.error(
          "JSON parse error from Gemini:",
          parseError,
          "raw:",
          result.text?.substring(0, 200),
        );
        return NextResponse.json(
          { error: "Erro ao processar a avaliação da IA. Tente novamente." },
          { status: 500 },
        );
      }

      // Save to Supabase
      const { data: session, error: insertError } = await supabase
        .from("seller_training_sessions")
        .insert({
          seller_name: sellerName,
          started_at: new Date(Date.now() - 30 * 1000).toISOString(),
          ended_at: new Date().toISOString(),
          score: evaluation.score,
          transcript: messages,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving training session:", insertError);
      }

      return NextResponse.json({ success: true, evaluation, session });
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
