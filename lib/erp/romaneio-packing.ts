/**
 * Distribuição dos pares nas caixas de despacho.
 *
 * Critério: primeiro o menor espaço vazio somado; no empate, o menor número de
 * caixas. Como todas as capacidades são múltiplas de 3, a sobra nunca passa de
 * 2 pares e fica concentrada na última caixa (a menor).
 */

export const BOX_CAPACITIES = [18, 12, 6, 3] as const;

export type PackingLine = {
  reference: string;
  size: string;
  quantity: number;
};

export type PackedVolume = {
  capacity: number;
  pairs: number;
  lines: PackingLine[];
};

/** Capacidades escolhidas, da maior para a menor. */
export function chooseBoxes(totalPairs: number, capacities: readonly number[] = BOX_CAPACITIES): number[] {
  if (!Number.isInteger(totalPairs) || totalPairs <= 0) return [];
  const smallest = Math.min(...capacities);
  const limit = totalPairs + smallest;
  // best[c] = menor quantidade de caixas cuja soma de capacidades é exatamente c.
  const best: Array<number[] | null> = Array.from({ length: limit + 1 }, () => null);
  best[0] = [];
  for (let total = 1; total <= limit; total += 1) {
    for (const capacity of capacities) {
      const previous = total >= capacity ? best[total - capacity] : null;
      if (previous && (!best[total] || previous.length + 1 < best[total]!.length)) {
        best[total] = [...previous, capacity];
      }
    }
  }
  for (let total = totalPairs; total <= limit; total += 1) {
    const boxes = best[total];
    if (boxes) return [...boxes].sort((a, b) => b - a);
  }
  throw new Error("Não há combinação de caixas para esta quantidade.");
}

/**
 * Preenche as caixas na ordem das linhas recebidas, mantendo cada referência
 * junta sempre que possível. Quantidades fracionadas não existem em pares.
 */
export function packVolumes(lines: PackingLine[], capacities: readonly number[] = BOX_CAPACITIES): PackedVolume[] {
  const queue = lines
    .map((line) => ({ ...line, quantity: Math.round(line.quantity) }))
    .filter((line) => line.quantity > 0);
  const totalPairs = queue.reduce((sum, line) => sum + line.quantity, 0);
  const volumes: PackedVolume[] = chooseBoxes(totalPairs, capacities).map((capacity) => ({ capacity, pairs: 0, lines: [] }));

  let cursor = 0;
  for (const volume of volumes) {
    while (volume.pairs < volume.capacity && cursor < queue.length) {
      const line = queue[cursor];
      const take = Math.min(line.quantity, volume.capacity - volume.pairs);
      volume.lines.push({ reference: line.reference, size: line.size, quantity: take });
      volume.pairs += take;
      line.quantity -= take;
      if (line.quantity === 0) cursor += 1;
    }
  }
  return volumes;
}
