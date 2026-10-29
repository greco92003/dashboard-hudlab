// Regras comerciais vigentes (Controle): promoção com prazo e avisos com prazo.
// Não mudam o jeito de atender da Cami; valem só no período. Módulo puro.
import { unitPriceForPares } from "./pricing";

export interface FaixaPromocao {
  /** A faixa vale a partir de quantos pares. */
  minPares: number;
  descontoPct: number;
}

export interface Promocao {
  nome: string;
  /** ISO com fuso (horário de Brasília quando vem do Controle). */
  inicio: string;
  fim: string;
  /** % de desconto sobre o valor dos pares na primeira faixa. Sempre acumula com os 5% do PIX (forma de pagamento). */
  descontoPct: number;
  /** A primeira faixa vale a partir de quantos pares. */
  minPares: number;
  /**
   * Faixas acima da primeira, cada uma com o próprio %. A Black November dá 5%
   * a partir de 12 pares, 7% a partir de 36, 10% a partir de 100 e 15% a
   * partir de 500. Sem faixas, a promoção tem um % só.
   */
  faixas?: FaixaPromocao[];
  /** Como a Cami apresenta a promoção ao cliente (opcional). */
  texto: string;
}

/** Desconto do PIX à vista, que sempre soma ao da promoção (forma de pagamento). */
export const PIX_DESCONTO_PCT = 5;

/** Todas as faixas da promoção, a primeira incluída, em ordem. */
export function faixasDaPromocao(promo: Promocao): FaixaPromocao[] {
  return [{ minPares: promo.minPares, descontoPct: promo.descontoPct }, ...(promo.faixas ?? [])];
}

/** "5%", ou "5% a 15%" quando há faixas. */
export function resumoDesconto(promo: Promocao): string {
  const pcts = faixasDaPromocao(promo).map((f) => f.descontoPct);
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  return min === max ? `${min}%` : `${min}% a ${max}%`;
}

/** % da promoção para essa quantidade: a faixa mais alta que o pedido alcança. 0 abaixo do mínimo. */
export function descontoDaFaixa(pares: number, promo: Promocao | null): number {
  if (!promo || pares < promo.minPares) return 0;
  let pct = promo.descontoPct;
  for (const f of promo.faixas ?? []) if (pares >= f.minPares) pct = f.descontoPct;
  return pct > 0 ? pct : 0;
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
  /** % da promoção que valeu para essa quantidade (0 sem promoção). */
  descontoPct: number;
  /** PIX à vista: o % da promoção mais os 5% do PIX, os dois sobre a tabela. */
  pixDescontoPct: number;
  pixUnitario: number;
  pixSubtotal: number;
}

/**
 * Preço com a promoção, em centavos para não errar o arredondamento:
 * R$ 59,90 com 5% = R$ 56,91 o par; o subtotal é o par já com desconto vezes
 * os pares (como fica gravado no orçamento). O PIX soma os percentuais sobre
 * a tabela, como a arte da Black mostra: 5% da faixa + 5% do PIX = 10%, ou
 * R$ 53,91. Abaixo do mínimo da promoção, preço cheio (e só os 5% do PIX).
 * null abaixo do pedido mínimo.
 */
export function precoComPromocao(pares: number, promo: Promocao | null): PrecoPromocao | null {
  const unit = unitPriceForPares(pares);
  if (unit == null) return null;
  const cheioCents = Math.round(unit * 100);
  const comDesconto = (pct: number) => Math.round((cheioCents * (100 - pct)) / 100);
  const pct = descontoDaFaixa(pares, promo);
  const unitCents = pct > 0 ? comDesconto(pct) : cheioCents;
  const pixPct = pct + PIX_DESCONTO_PCT;
  const pixCents = comDesconto(pixPct);
  return {
    unitario: unitCents / 100,
    subtotal: (unitCents * pares) / 100,
    unitarioCheio: cheioCents / 100,
    subtotalCheio: (cheioCents * pares) / 100,
    aplicada: pct > 0,
    descontoPct: pct,
    pixDescontoPct: pixPct,
    pixUnitario: pixCents / 100,
    pixSubtotal: (pixCents * pares) / 100,
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
    const faixas = faixasDaPromocao(promo);
    const desconto =
      faixas.length > 1
        ? `desconto no valor dos pares por faixa (${faixas.map((f) => `${f.descontoPct}% a partir de ${f.minPares} pares`).join(", ")})`
        : `${promo.descontoPct}% de desconto no valor dos pares, a partir de ${promo.minPares} pares`;
    linhas.push(
      `- Promoção vigente "${promo.nome}": ${desconto}, até ${fmtVigencia(promo.fim)} (horário de Brasília). A ferramenta atualizar_orcamento já aplica o desconto da faixa e devolve também o valor no PIX à vista (mais ${PIX_DESCONTO_PCT}% sobre a tabela); cite os valores que ela devolver e a validade. Se o orçamento do robô veio sem a promoção, diga que ela baixa o valor.${promo.texto ? ` Como apresentar: ${promo.texto}` : ""}`,
    );
  }
  for (const a of avisos) linhas.push(`- Aviso até ${fmtVigencia(a.fim)}: ${a.texto}`);
  return linhas.length
    ? `\n\nRegras comerciais vigentes agora. Enquanto valerem, prevalecem sobre o manual e sobre as regras comerciais acima quando conflitarem (por exemplo, forma de pagamento e prazo):\n${linhas.join("\n")}`
    : "";
}
