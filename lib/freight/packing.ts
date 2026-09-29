export interface PackableVolume {
  id: string;
  pairs_capacity: number;
}

export interface VolumeSelection {
  volume_id: string;
  count: number;
}

/**
 * Converte uma quantidade de pares nas caixas cadastradas em freight_volumes:
 * enquanto sobrar par, usa a menor caixa que comporta o resto; se nenhuma
 * comporta, usa a maior e continua. 20 pares = 18 + 3, não 18 + 1 + 1.
 */
export function packPairsIntoVolumes(
  pares: number,
  volumes: PackableVolume[],
): VolumeSelection[] {
  const boxes = volumes
    .filter((v) => v.pairs_capacity > 0)
    .sort((a, b) => a.pairs_capacity - b.pairs_capacity);
  if (boxes.length === 0 || pares <= 0) return [];

  const largest = boxes[boxes.length - 1];
  const counts = new Map<string, number>();
  let remaining = pares;
  while (remaining > 0) {
    const pick = boxes.find((b) => b.pairs_capacity >= remaining) ?? largest;
    counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
    remaining -= pick.pairs_capacity;
  }
  return [...counts.entries()].map(([volume_id, count]) => ({ volume_id, count }));
}
