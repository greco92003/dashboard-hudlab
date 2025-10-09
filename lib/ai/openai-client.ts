import OpenAI from "openai";

// Inicializar cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Envia mensagem para o ChatGPT com contexto de negócios
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  context?: string
): Promise<string> {
  try {
    // Criar mensagem de sistema com contexto
    const systemMessage: ChatMessage = {
      role: "system",
      content: `Você é um analista de dados especializado em e-commerce e vendas, trabalhando para a HUDLAB.

Suas responsabilidades:
- Analisar dados de vendas, negócios (deals), produtos e performance de equipe
- Fornecer insights acionáveis e recomendações estratégicas
- Responder perguntas sobre métricas, tendências e performance
- Ser objetivo, claro e usar dados para embasar suas respostas
- Sempre que possível, incluir números e percentuais nas análises
- Sugerir ações práticas baseadas nos dados

IMPORTANTE - Como Usar os Dados:
1. **MÉTRICAS PRÉ-CALCULADAS**: Eu já calculei várias métricas para você, incluindo:
   - Ticket médio por par (valor total ÷ total de pares)
   - Total de pares vendidos
   - Receita total
   - Taxa de conversão

2. **SEMPRE USE OS VALORES PRÉ-CALCULADOS** quando disponíveis. NÃO tente recalcular!

3. **Lista Detalhada de Negócios**: Use apenas quando precisar de:
   - Análises específicas por negócio
   - Identificar maiores/menores negócios
   - Agrupar por vendedor, estado, designer
   - Análises de UTM

4. **Seja DIRETO e OBJETIVO**:
   - Responda com os números que já foram calculados
   - Não diga "vou calcular" - os cálculos já foram feitos
   - Cite os valores exatos fornecidos

Formato de resposta:
- Use markdown para formatação
- Seja conciso mas completo
- Use emojis quando apropriado para melhor visualização
- Destaque insights importantes com **negrito**
- Sempre cite os dados específicos que você usou na análise

${context ? `\n## Dados Disponíveis:\n${context}` : ""}`,
    };

    // Combinar mensagens
    const allMessages = [systemMessage, ...messages];

    // Chamar API do OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // GPT-4 Turbo para análises mais precisas e inteligentes
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 2000, // Aumentado para permitir respostas mais detalhadas
    });

    return (
      completion.choices[0].message.content ||
      "Desculpe, não consegui gerar uma resposta."
    );
  } catch (error: any) {
    console.error("Erro ao chamar OpenAI:", error);

    if (error?.status === 401) {
      throw new Error(
        "Chave da API OpenAI inválida. Verifique a configuração."
      );
    }

    if (error?.status === 429) {
      throw new Error(
        "Limite de requisições atingido. Tente novamente em alguns instantes."
      );
    }

    throw new Error("Erro ao processar sua mensagem. Tente novamente.");
  }
}

/**
 * Gera sugestões de perguntas baseadas no contexto
 */
export function generateSuggestedQuestions(context: any): string[] {
  const suggestions = [
    "📊 Como está a performance de vendas este mês?",
    "🎯 Qual vendedor teve melhor desempenho?",
    "💰 Qual é o ticket médio dos negócios?",
    "📈 A taxa de conversão está boa?",
    "🏆 Quais são os produtos mais vendidos?",
  ];

  // Adicionar sugestões específicas baseadas no contexto
  if (context?.deals?.conversionRate < 30) {
    suggestions.push("⚠️ Por que a taxa de conversão está baixa?");
  }

  if (context?.goals?.length > 0) {
    suggestions.push("🎯 Como estamos em relação às metas?");
  }

  return suggestions;
}
