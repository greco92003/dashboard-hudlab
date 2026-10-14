// Recorte da conversa de treino para o "Você × Cami". Módulo puro.

export interface TrainingTurn {
  id?: string;
  /** "assistant" = cliente simulado; "user" = vendedor. */
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/**
 * Dada a resposta do vendedor escolhida, devolve a conversa até a mensagem do
 * cliente que ela respondia (é o que a Cami vê), a mensagem do cliente e a
 * resposta do vendedor. null se o índice não é de uma resposta do vendedor
 * precedida por fala do cliente.
 */
export function pickTurnForComparison(
  turns: TrainingTurn[],
  sellerIndex: number,
): { history: TrainingTurn[]; cliente: string; vendedor: string } | null {
  if (sellerIndex <= 0 || sellerIndex >= turns.length || turns[sellerIndex].role !== "user") return null;
  let clientIndex = sellerIndex - 1;
  while (clientIndex >= 0 && turns[clientIndex].role !== "assistant") clientIndex--;
  if (clientIndex < 0) return null;
  return {
    history: turns.slice(0, clientIndex + 1),
    cliente: turns[clientIndex].content,
    vendedor: turns[sellerIndex].content,
  };
}
