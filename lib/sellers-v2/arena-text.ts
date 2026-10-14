// Partes puras da Arena usadas pelo servidor: texto do lembrete e média por critério.

export function reminderMessage(streak: number, nome: string): { title: string; message: string } {
  const first = nome.trim().split(/\s+/)[0];
  if (streak >= 1) {
    return {
      title: "Sua sequência na Arena",
      message: `${first}, sua sequência de ${streak} ${streak === 1 ? "dia" : "dias"} termina hoje se você não treinar. 15 minutos resolvem.`,
    };
  }
  return {
    title: "Arena de Vendedores",
    message: `${first}, ainda dá tempo de treinar hoje: 15 minutos valem XP e posição no ranking.`,
  };
}

/** Peso máximo de cada critério da avaliação (manual, seção 7.1). */
export const CRITERIOS: ReadonlyArray<{ id: string; nome: string; max: number }> = [
  { id: "precisaoInformacoes", nome: "Precisão das informações", max: 25 },
  { id: "entendimentoNecessidade", nome: "Entender a necessidade", max: 20 },
  { id: "construcaoValor", nome: "Mostrar valor", max: 20 },
  { id: "conducaoProximoPasso", nome: "Conduzir o próximo passo", max: 20 },
  { id: "clarezaComunicacao", nome: "Clareza", max: 15 },
];

/** % médio de cada critério nas avaliações dadas; null sem avaliação. */
export function criteriaAverages(
  rows: Array<{ evaluation?: { report?: { notasPorCriterio?: Record<string, number> } } | null }>,
): Array<{ id: string; nome: string; pct: number | null }> {
  return CRITERIOS.map((c) => {
    const values = rows
      .map((r) => r.evaluation?.report?.notasPorCriterio?.[c.id])
      .filter((v): v is number => typeof v === "number");
    return {
      id: c.id,
      nome: c.nome,
      pct: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length / c.max) * 100) : null,
    };
  });
}
