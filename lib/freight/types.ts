// ─── Freight fractional-quotation shared types ──────────────────────────────

export interface WeightBracket {
  max_weight_kg: number; // teto da faixa (10, 20, 30, 50, 70, 100…)
  price: number; // frete-peso nessa faixa
}

export interface FreightLane {
  id: string;
  table_id: string;
  origin_city: string | null;
  origin_cep_prefix: string | null;
  dest_city: string;
  dest_cep_prefix: string; // normalized (digits, left-padded to 5), "" if unknown
  dest_uf: string | null;

  brackets: WeightBracket[];
  excess_per_ton: number; // p/Tonelada acima da última faixa
  advalorem_pct: number; // fração (0.004 = 0,40%)
  toll_per_100kg: number; // pedágio p/ cada 100 kg
  fee_up_to_50: number; // taxa fixa até 50 kg
  fee_above_50: number; // taxa fixa acima de 50 kg
  gris_pct: number; // fração (0.00002 = 0,0020%)
  ta_value: number; // TA fixo

  min_price: number | null;
  icms_rate: number | null; // override por rota
  notes: string | null;
}

export interface CarrierTableMeta {
  id: string;
  carrier_id: string;
  name: string;
  origin_label: string | null;
  cubage_kg_per_m3: number;
  icms_rate: number; // alíquota padrão da tabela
}

export interface FreightCoverage {
  id: string;
  carrier_id: string;
  city: string;
  uf: string | null;
  cep_prefix: string | null;
  filial: string | null;
  km: number | null;
  frequency: string | null;
  prazo_min: number | null;
  prazo_max: number | null;
  tda_value: number | null;
}

// ─── Quotation ──────────────────────────────────────────────────────────────

export interface QuoteShipment {
  peso_real_kg: number; // peso bruto real total
  volume_m3: number; // cubagem total em m³
  valor_nf: number; // valor da nota fiscal (base advalorem/GRIS)
}

export interface BreakdownLine {
  key: string;
  label: string;
  value: number;
  detail?: string; // ex: "0,40% × R$ 2.000,00"
}

export interface LaneQuote {
  peso_taxavel_kg: number;
  peso_cubado_kg: number;
  peso_real_kg: number;
  usou_cubagem: boolean; // cubado > real
  frete_peso: number;
  advalorem: number;
  gris: number;
  pedagio: number;
  taxa_fixa: number;
  ta: number;
  tda: number;
  subtotal_sem_icms: number; // antes do gross-up de ICMS
  min_aplicado: boolean;
  icms_rate: number;
  icms: number;
  total: number;
  lines: BreakdownLine[];
  avisos: string[];
}
