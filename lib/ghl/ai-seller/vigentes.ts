// Regras comerciais vigentes (Controle): promoção com prazo e avisos com prazo.
// Não mudam o jeito de atender da Cami; valem só no período. Módulo puro.
import { unitPriceForPares } from "./pricing";

export interface Promocao {
  nome: string;
  /** ISO com fuso (horário de Brasília quando vem do Controle). */
  inicio: string;
  fim: string;
  /** % de desconto sobre o valor dos pares. Sempre acumula com os 5% do PIX (forma de pagamento). */
  descontoPct: number;
  /** Vale a partir de quantos pares. */
  minPares: number;
  /** Como a Cami apresenta a promoção ao cliente (opcional). */
  texto: string;
}

export interface Aviso {
  texto: string;
  inicio: string;
  fim: string;
}

export type Vigencia = "agendada" | "ativa" | "encerrada";

export function vigencia(item: { inicio: string; fim: string }, nowMs: number): Vigencia {
  if (nowMs < Date.parse(item.inicio)) return "agendada";
  if (nowMs >= Date.parse(item.fim)) return "encerrada";
  return "ativa";
}

export const promocaoAtiva = (p: Promocao | null | undefined, nowMs: number): Promocao | null =>
  p && vigencia(p, nowMs) === "ativa" ? p : null;

export const avisosAtivos = (avisos: readonly Aviso[] | null | undefined, nowMs: number): Aviso[] =>
  (avisos ?? []).filter((a) => vigencia(a, nowMs) === "ativa");

export interface PrecoPromocao {
  unitario: number;
  subtotal: number;
  unitarioCheio: number;
  subtotalCheio: number;
  aplicada: boolean;
}

/**
 * Preço com a promoção, em centavos para não errar o arredondamento:
 * R$ 59,90 com 5% = R$ 56,91 o par; o subtotal é o par já com desconto vezes
 * os pares (como fica gravado no orçamento). Abaixo do mínimo da promoção,
 * preço cheio. null abaixo do pedido mínimo.
 */
export function precoComPromocao(pares: number, promo: Promocao | null): PrecoPromocao | null {
  const unit = unitPriceForPares(pares);
  if (unit == null) return null;
  const cheioCents = Math.round(unit * 100);
  const aplicada = !!promo && pares >= promo.minPares && promo.descontoPct > 0;
  const unitCents = aplicada ? Math.round((cheioCents * (100 - promo!.descontoPct)) / 100) : cheioCents;
  return {
    unitario: unitCents / 100,
    subtotal: (unitCents * pares) / 100,
    unitarioCheio: cheioCents / 100,
    subtotalCheio: (cheioCents * pares) / 100,
    aplicada,
  };
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "25/10 00:00", horário de Brasília. */
export function fmtVigencia(iso: string): string {
  const d = new Date(Date.parse(iso) - BRT_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Campo datetime-local do Controle ("2026-10-25T00:00", Brasília) → ISO com fuso. null se inválido. */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** ISO → valor do campo datetime-local, em Brasília. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(Date.parse(iso) - BRT_OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

/**
 * O que entra no contexto de cada resposta da Cami: só o que vale agora.
 * Vazio sem promoção nem aviso ativos.
 */
export function contextoVigentes(promo: Promocao | null, avisos: readonly Aviso[]): string {
  const linhas: string[] = [];
  if (promo) {
    linhas.push(
      `- Promoção vigente "${promo.nome}": ${promo.descontoPct}% de desconto no valor dos pares, a partir de ${promo.minPares} pares, até ${fmtVigencia(promo.fim)} (horário de Brasília). A ferramenta atualizar_orcamento já aplica o desconto; cite o valor que ela devolver e a validade. Acumula com os 5% do PIX. Se o orçamento do robô veio sem a promoção, diga que ela baixa o valor.${promo.texto ? ` Como apresentar: ${promo.texto}` : ""}`,
    );
  }
  for (const a of avisos) linhas.push(`- Aviso até ${fmtVigencia(a.fim)}: ${a.texto}`);
  return linhas.length ? `\n\nRegras comerciais vigentes agora:\n${linhas.join("\n")}` : "";
}
