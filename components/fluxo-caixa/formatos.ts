/** Formatação e parsing usados nas telas de fluxo de caixa. */

export function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Aceita "1.234,56" (BR) ou "1234.56" (ponto decimal). */
export function lerValor(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  const n = t.includes(",")
    ? Number(t.replace(/\./g, "").replace(",", "."))
    : Number(t);
  return Number.isFinite(n) ? n : 0;
}

export const CORES = {
  entradas: "#16a34a",
  saidas: "#dc2626",
  fechamento: "#2563eb",
};

const compactoFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function brlCompacto(v: number): string {
  return compactoFmt.format(v);
}
