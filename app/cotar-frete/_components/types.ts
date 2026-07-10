import type { LaneQuote } from "@/lib/freight/types";

export interface FreightVolume {
  id: string;
  name: string;
  pairs_capacity: number;
  weight_kg: number | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  active: boolean;
  created_at: string;
}

export interface FreightCarrier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface CarrierTable {
  id: string;
  carrier_id: string;
  name: string;
  origin_label: string | null;
  cubage_kg_per_m3: number;
  icms_rate: number;
  active: boolean;
  lane_count?: number;
  created_at: string;
}

export interface QuoteResult {
  carrier: { id: string; name: string };
  table: { id: string; name: string; origin_label: string | null };
  destination: { city: string; cep_prefix: string; uf: string | null };
  match_confidence: "cep" | "city" | "nearest" | "api";
  prazo_min: number | null;
  prazo_max: number | null;
  frequency: string | null;
  quote: LaneQuote;
}

export interface ResolvedCep {
  cep: string;
  city: string;
  uf: string;
  source: string;
}

export interface QuoteResponse {
  results: QuoteResult[];
  matched_by: "cep" | "city" | "nearest" | "api" | "none";
  ambiguous_city: boolean;
  resolved: ResolvedCep | null;
  shipment: {
    peso_real: number;
    volume_m3: number;
    peso_cubado: number;
    valor_nf: number;
  };
  warnings: string[];
}

export const formatCurrency = (v: number) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
