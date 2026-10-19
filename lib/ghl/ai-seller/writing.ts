// Texto da Cami antes de chegar ao cliente. Módulo puro: sem server-only.

/**
 * Travessão é marca de texto de IA: no WhatsApp ninguém digita "—". A Cami é
 * orientada a não usar, e o que escapar é trocado aqui antes de enviar.
 */
export function semTravessao(texto: string): string {
  return (
    texto
      // Faixa de números: "12–23 pares" vira "12 a 23 pares".
      .replace(/(\d)[ \t]*[—–][ \t]*(?=\d)/g, "$1 a ")
      // Marcador no começo da linha.
      .replace(/^[ \t]*[—–]+[ \t]*/gm, "- ")
      // No meio da frase, vírgula.
      .replace(/[ \t]*[—–]+[ \t]*/g, ", ")
      // Sobras da troca: vírgula antes de outra pontuação, depois dela ou na borda da linha.
      .replace(/,[ \t]*([,.!?;:])/g, "$1")
      .replace(/([.!?;:])[ \t]*,[ \t]*/g, "$1 ")
      .replace(/[ \t]*,[ \t]*$/gm, "")
      .replace(/^[ \t]*,[ \t]*/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}
