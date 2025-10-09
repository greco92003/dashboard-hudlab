import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendChatMessage, ChatMessage } from "@/lib/ai/openai-client";
import {
  getBusinessContext,
  formatContextForPrompt,
} from "@/lib/ai/context-builder";

/**
 * ⚠️ ENDPOINT DISPONÍVEL APENAS EM DESENVOLVIMENTO
 * O Analista IA está desabilitado em produção até testes completos
 */
export async function POST(request: NextRequest) {
  // Bloquear em produção
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error: "Analista IA disponível apenas em desenvolvimento",
        message:
          "Esta funcionalidade está em fase de testes e não está disponível em produção.",
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Obter dados da requisição
    const body = await request.json();
    const { message, conversationHistory = [], periodDays = 30 } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
    }

    // Buscar contexto de negócios com o período especificado
    const context = await getBusinessContext(supabase, user.id, periodDays);
    const contextText = formatContextForPrompt(context);

    // Preparar histórico de mensagens
    const messages: ChatMessage[] = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: message,
      },
    ];

    // Enviar para ChatGPT
    const response = await sendChatMessage(messages, contextText);

    // Retornar resposta
    return NextResponse.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Erro no chat AI:", error);

    return NextResponse.json(
      {
        error: error.message || "Erro ao processar mensagem",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET - Obter contexto inicial
export async function GET(request: NextRequest) {
  // Bloquear em produção
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error: "Analista IA disponível apenas em desenvolvimento",
        message:
          "Esta funcionalidade está em fase de testes e não está disponível em produção.",
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar contexto de negócios
    const context = await getBusinessContext(supabase, user.id);

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error: any) {
    console.error("Erro ao buscar contexto:", error);

    return NextResponse.json(
      { error: "Erro ao buscar contexto" },
      { status: 500 }
    );
  }
}
