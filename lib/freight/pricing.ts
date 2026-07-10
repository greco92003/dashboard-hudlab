import type {
  FreightLane,
  QuoteShipment,
  LaneQuote,
  BreakdownLine,
} from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Chargeable weight = max(real weight, cubed weight). 1 m³ = cubageFactor kg. */
export function chargeableWeight(
  shipment: QuoteShipment,
  cubageKgPerM3: number,
): { peso_real: number; peso_cubado: number; peso_taxavel: number; usou_cubagem: boolean } {
  const peso_real = Math.max(0, shipment.peso_real_kg || 0);
  const peso_cubado = Math.max(0, (shipment.volume_m3 || 0) * cubageKgPerM3);
  const usou_cubagem = peso_cubado > peso_real;
  const peso_taxavel = Math.max(peso_real, peso_cubado);
  return { peso_real, peso_cubado, peso_taxavel, usou_cubagem };
}

/**
 * Frete-peso from weight brackets. For weight up to the largest bracket, uses
 * the smallest bracket whose ceiling >= weight. Above the largest bracket, uses
 * the per-ton excess rate (R$/1000 kg).
 */
export function fretePeso(
  pesoTaxavel: number,
  brackets: { max_weight_kg: number; price: number }[],
  excessPerTon: number,
): { value: number; detail: string } {
  if (pesoTaxavel <= 0) return { value: 0, detail: "sem peso" };
  const sorted = [...brackets].sort((a, b) => a.max_weight_kg - b.max_weight_kg);
  if (sorted.length === 0) {
    // no brackets: fall back to per-ton
    const v = excessPerTon * (pesoTaxavel / 1000);
    return { value: v, detail: `${fmtKg(pesoTaxavel)} × R$/t` };
  }
  const largest = sorted[sorted.length - 1];
  if (pesoTaxavel <= largest.max_weight_kg) {
    const b = sorted.find((x) => pesoTaxavel <= x.max_weight_kg)!;
    return { value: b.price, detail: `faixa até ${fmtKg(b.max_weight_kg)}` };
  }
  // above the last bracket → per ton
  const v = excessPerTon * (pesoTaxavel / 1000);
  return { value: v, detail: `${fmtKg(pesoTaxavel)} × R$ ${fmtBR(excessPerTon)}/t (excedente)` };
}

/**
 * Full fractional-freight price for one lane.
 *
 * Formula (matches TRANSDUARTE-style tables):
 *   frete_peso  → por faixa de peso (ou por tonelada acima do teto)
 *   advalorem   → advalorem_pct × valor_nf
 *   gris        → gris_pct × valor_nf
 *   pedagio     → ceil(peso/100) × toll_per_100kg
 *   taxa_fixa   → fee_up_to_50 (peso ≤ 50) ou fee_above_50 (peso > 50)
 *   ta          → ta_value
 *   subtotal    → soma acima, respeitando min_price
 *   ICMS por fora → total = subtotal / (1 - aliquota); icms = total - subtotal
 *   TDA         → somada por fora (vem da cobertura/praça), se houver
 */
export function priceLane(
  lane: FreightLane,
  shipment: QuoteShipment,
  opts: { cubageKgPerM3: number; defaultIcmsRate: number; tda?: number | null },
): LaneQuote {
  const avisos: string[] = [];
  const { peso_real, peso_cubado, peso_taxavel, usou_cubagem } = chargeableWeight(
    shipment,
    opts.cubageKgPerM3,
  );

  if (usou_cubagem) {
    avisos.push(
      `Peso cubado (${fmtKg(peso_cubado)}) maior que o real (${fmtKg(peso_real)}) — cobrança pela cubagem.`,
    );
  }

  const fp = fretePeso(peso_taxavel, lane.brackets, lane.excess_per_ton);
  const frete_peso = fp.value;

  const valorNf = Math.max(0, shipment.valor_nf || 0);
  const advalorem = lane.advalorem_pct * valorNf;
  const gris = lane.gris_pct * valorNf;
  const pedagio = Math.ceil(peso_taxavel / 100) * lane.toll_per_100kg;
  const taxa_fixa = peso_taxavel <= 50 ? lane.fee_up_to_50 : lane.fee_above_50;
  const ta = lane.ta_value;

  let subtotal = frete_peso + advalorem + gris + pedagio + taxa_fixa + ta;
  let min_aplicado = false;
  if (lane.min_price != null && subtotal < lane.min_price) {
    subtotal = lane.min_price;
    min_aplicado = true;
    avisos.push(`Frete mínimo de R$ ${fmtBR(lane.min_price)} aplicado.`);
  }

  const icms_rate = lane.icms_rate ?? opts.defaultIcmsRate ?? 0;
  // ICMS "por fora": grosses up the freight so the net after tax equals subtotal.
  const base_pos_icms = icms_rate > 0 && icms_rate < 1 ? subtotal / (1 - icms_rate) : subtotal;
  const icms = base_pos_icms - subtotal;

  const tda = Math.max(0, opts.tda ?? 0);
  if (tda > 0) avisos.push(`TDA (dificuldade de acesso) de R$ ${fmtBR(tda)} aplicada.`);

  const total = base_pos_icms + tda;

  const lines: BreakdownLine[] = [
    { key: "frete_peso", label: "Frete-peso", value: round2(frete_peso), detail: fp.detail },
  ];
  if (advalorem > 0)
    lines.push({
      key: "advalorem",
      label: "Advalorem (frete-valor)",
      value: round2(advalorem),
      detail: `${fmtPct(lane.advalorem_pct)} × R$ ${fmtBR(valorNf)}`,
    });
  if (pedagio > 0)
    lines.push({
      key: "pedagio",
      label: "Pedágio",
      value: round2(pedagio),
      detail: `${Math.ceil(peso_taxavel / 100)} × R$ ${fmtBR(lane.toll_per_100kg)}/100kg`,
    });
  if (taxa_fixa > 0)
    lines.push({
      key: "taxa_fixa",
      label: "Taxas",
      value: round2(taxa_fixa),
      detail: peso_taxavel <= 50 ? "até 50 kg" : "+ de 50 kg",
    });
  if (gris > 0)
    lines.push({
      key: "gris",
      label: "GRIS",
      value: round2(gris),
      detail: `${fmtPct(lane.gris_pct)} × R$ ${fmtBR(valorNf)}`,
    });
  if (ta > 0) lines.push({ key: "ta", label: "TA", value: round2(ta) });
  if (min_aplicado)
    lines.push({ key: "min", label: "Ajuste frete mínimo", value: 0, detail: "aplicado ao subtotal" });
  if (icms > 0)
    lines.push({
      key: "icms",
      label: "ICMS (por fora)",
      value: round2(icms),
      detail: fmtPct(icms_rate),
    });
  if (tda > 0) lines.push({ key: "tda", label: "TDA", value: round2(tda) });

  return {
    peso_taxavel_kg: round2(peso_taxavel),
    peso_cubado_kg: round2(peso_cubado),
    peso_real_kg: round2(peso_real),
    usou_cubagem,
    frete_peso: round2(frete_peso),
    advalorem: round2(advalorem),
    gris: round2(gris),
    pedagio: round2(pedagio),
    taxa_fixa: round2(taxa_fixa),
    ta: round2(ta),
    tda: round2(tda),
    subtotal_sem_icms: round2(subtotal),
    min_aplicado,
    icms_rate,
    icms: round2(icms),
    total: round2(total),
    lines,
    avisos,
  };
}

// ─── small formatters (kept local; UI has its own currency formatter) ────────
function fmtBR(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKg(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}
function fmtPct(frac: number): string {
  return `${(frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}
