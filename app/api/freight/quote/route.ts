import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";
import { priceLane } from "@/lib/freight/pricing";
import {
  resolveDestination,
  matchCoverage,
  matchLanesByCity,
  matchNearestLane,
} from "@/lib/freight/resolve";
import { resolveCep } from "@/lib/freight/cep";
import { looksLikeCep, cepMatchKey } from "@/lib/freight/normalize";
import { quoteBraspress, isBraspressEnabled } from "@/lib/freight/carriers/braspress";
import type { FreightLane, FreightCoverage } from "@/lib/freight/types";

interface VolumeSel {
  volume_id: string;
  count: number;
}

// Fixed shipping origin: Nova Hartz-RS (remetente)
const ORIGIN_CEP = "93890000";

function toLane(row: any): FreightLane {
  const brackets = (row.freight_weight_brackets ?? [])
    .map((b: any) => ({ max_weight_kg: Number(b.max_weight_kg), price: Number(b.price) }))
    .sort((a: { max_weight_kg: number }, b: { max_weight_kg: number }) => a.max_weight_kg - b.max_weight_kg);
  return {
    id: row.id,
    table_id: row.table_id,
    origin_city: row.origin_city,
    origin_cep_prefix: row.origin_cep_prefix,
    dest_city: row.dest_city,
    dest_cep_prefix: row.dest_cep_prefix ?? "",
    dest_uf: row.dest_uf,
    brackets,
    excess_per_ton: Number(row.excess_per_ton) || 0,
    advalorem_pct: Number(row.advalorem_pct) || 0,
    toll_per_100kg: Number(row.toll_per_100kg) || 0,
    fee_up_to_50: Number(row.fee_up_to_50) || 0,
    fee_above_50: Number(row.fee_above_50) || 0,
    gris_pct: Number(row.gris_pct) || 0,
    ta_value: Number(row.ta_value) || 0,
    min_price: row.min_price != null ? Number(row.min_price) : null,
    icms_rate: row.icms_rate != null ? Number(row.icms_rate) : null,
    notes: row.notes,
  };
}

// POST /api/freight/quote
// Body: { destino: string, volumes: {volume_id, count}[], valor_nf: number }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const destino = String(body.destino ?? "").trim();
    const volumes = (body.volumes ?? []) as VolumeSel[];
    const valor_nf = Number(body.valor_nf) || 0;

    if (!destino)
      return NextResponse.json({ error: "Informe o destino (CEP ou cidade)" }, { status: 400 });
    if (!Array.isArray(volumes) || volumes.length === 0)
      return NextResponse.json({ error: "Selecione ao menos um volume" }, { status: 400 });

    // ── shipment weight/cube from the volumes registry ──────────────────────
    const volIds = volumes.map((v) => v.volume_id).filter(Boolean);
    const { data: volRows, error: volErr } = await supabase
      .from("freight_volumes")
      .select("*")
      .in("id", volIds);
    if (volErr) throw volErr;

    const warnings: string[] = [];
    let peso_real = 0;
    let volume_m3 = 0;
    let totalVolumes = 0;
    let missingWeight = false;
    const cubagem: { comprimento: number; largura: number; altura: number; volumes: number }[] = [];
    for (const sel of volumes) {
      const v = (volRows ?? []).find((x) => x.id === sel.volume_id);
      const count = Math.max(0, Number(sel.count) || 0);
      if (!v || count === 0) continue;
      totalVolumes += count;
      if (v.weight_kg == null) missingWeight = true;
      peso_real += (Number(v.weight_kg) || 0) * count;
      if (v.width_cm && v.height_cm && v.depth_cm) {
        volume_m3 += ((Number(v.width_cm) * Number(v.height_cm) * Number(v.depth_cm)) / 1_000_000) * count;
        // Braspress cubagem in meters (comprimento=profundidade, largura, altura)
        cubagem.push({
          comprimento: Number(v.depth_cm) / 100,
          largura: Number(v.width_cm) / 100,
          altura: Number(v.height_cm) / 100,
          volumes: count,
        });
      }
    }
    if (missingWeight)
      warnings.push("Alguns volumes não têm peso cadastrado — cadastre o peso para uma cotação precisa.");
    if (peso_real <= 0 && volume_m3 <= 0)
      return NextResponse.json(
        { error: "Os volumes selecionados não têm peso/dimensões cadastrados", warnings },
        { status: 400 },
      );
    if (valor_nf <= 0)
      warnings.push("Valor da NF não informado — advalorem, GRIS e ICMS não serão cobrados corretamente.");

    // ── active tables (+ active carriers) ───────────────────────────────────
    const { data: tables, error: tErr } = await supabase
      .from("freight_carrier_tables")
      .select("*, freight_carriers!inner(id, name, active)")
      .eq("active", true)
      .eq("freight_carriers.active", true);
    if (tErr) throw tErr;
    if (!tables || tables.length === 0)
      return NextResponse.json({
        results: [],
        matched_by: "none",
        ambiguous_city: false,
        shipment: { peso_real, volume_m3, valor_nf },
        warnings: [...warnings, "Nenhuma tabela de frete ativa. Importe uma tabela primeiro."],
      });

    const tableIds = tables.map((t) => t.id);
    const carrierIds = [...new Set(tables.map((t) => t.carrier_id))];

    const { data: laneRows, error: lErr } = await supabase
      .from("freight_lanes")
      .select("*, freight_weight_brackets(*)")
      .in("table_id", tableIds);
    if (lErr) throw lErr;

    const { data: covRows, error: cErr } = await supabase
      .from("freight_coverage")
      .select("*")
      .in("carrier_id", carrierIds);
    if (cErr) throw cErr;

    // ── resolve + price per table ───────────────────────────────────────────
    const lanesByTable = new Map<string, FreightLane[]>();
    for (const row of laneRows ?? []) {
      const lane = toLane(row);
      const arr = lanesByTable.get(lane.table_id) ?? [];
      arr.push(lane);
      lanesByTable.set(lane.table_id, arr);
    }

    // ── resolve the destination CEP → city/UF (for city + nearest matching) ──
    const isCep = looksLikeCep(destino);
    const resolved = isCep ? await resolveCep(destino) : null;
    const destCoords =
      resolved?.lat != null && resolved?.lng != null
        ? { lat: resolved.lat, lng: resolved.lng }
        : null;

    let matchedBy: "cep" | "city" | "nearest" | "api" | "none" = "none";
    let ambiguous = false;
    const rank = { cep: 3, city: 2, nearest: 1, api: 0, none: 0 } as const;
    const results: unknown[] = [];

    for (const table of tables) {
      const lanes = lanesByTable.get(table.id) ?? [];

      // layered matching: (1) exact CEP/city → (2) resolved city → (3) nearest praça
      let matches: FreightLane[] = [];
      let confidence: "cep" | "city" | "nearest" = "city";

      const res = resolveDestination(destino, lanes);
      if (res.laneMatches.length > 0) {
        matches = res.laneMatches;
        confidence = res.matchedBy === "cep" ? "cep" : "city";
        if (res.ambiguous) ambiguous = true;
      } else if (resolved?.city) {
        const byCity = matchLanesByCity(resolved.city, lanes);
        if (byCity.length > 0) {
          matches = byCity;
          confidence = "city";
          if (new Set(byCity.map((l) => l.dest_cep_prefix)).size > 1) ambiguous = true;
        }
      }
      if (matches.length === 0) {
        const near = matchNearestLane(destino, resolved?.uf ?? null, destCoords, lanes);
        if (near) {
          matches = [near.lane];
          confidence = "nearest";
        }
      }

      if (matches.length > 0 && rank[confidence] > rank[matchedBy]) matchedBy = confidence;

      const carrier = table.freight_carriers as { id: string; name: string };
      const carrierCoverage = (covRows ?? []).filter(
        (c) => c.carrier_id === table.carrier_id,
      ) as FreightCoverage[];
      const cov = matchCoverage(destino, carrierCoverage, resolved?.city ?? null);

      for (const lane of matches) {
        const quote = priceLane(
          lane,
          { peso_real_kg: peso_real, volume_m3, valor_nf },
          {
            cubageKgPerM3: Number(table.cubage_kg_per_m3) || 300,
            defaultIcmsRate: Number(table.icms_rate) || 0,
            tda: cov?.tda_value ?? null,
          },
        );
        if (confidence === "nearest")
          quote.avisos.unshift(
            "Praça estimada (mais próxima por CEP). Confirme o valor com a transportadora.",
          );
        results.push({
          carrier: { id: carrier.id, name: carrier.name },
          table: { id: table.id, name: table.name, origin_label: table.origin_label },
          destination: {
            city: lane.dest_city,
            cep_prefix: lane.dest_cep_prefix,
            uf: lane.dest_uf,
          },
          match_confidence: confidence,
          prazo_min: cov?.prazo_min ?? null,
          prazo_max: cov?.prazo_max ?? null,
          frequency: cov?.frequency ?? null,
          quote,
        });
      }
    }

    // ── Braspress (API) — independent carrier, only with a destination CEP ──
    if (isBraspressEnabled() && looksLikeCep(destino)) {
      if (cubagem.length === 0) {
        warnings.push("Braspress (API): cadastre as dimensões dos volumes para cotar.");
      } else {
        const bp = await quoteBraspress({
          cepOrigem: ORIGIN_CEP,
          cepDestino: destino,
          peso: peso_real,
          volumes: totalVolumes,
          vlrMercadoria: valor_nf,
          cubagem,
        });
        if (bp.ok && bp.total != null) {
          const peso_cubado = volume_m3 * 300;
          results.push({
            carrier: { id: "braspress", name: "Braspress" },
            table: { id: "braspress-api", name: "API", origin_label: "NOVA HARTZ-RS" },
            destination: {
              city: resolved?.city ?? "",
              cep_prefix: cepMatchKey(destino),
              uf: resolved?.uf ?? null,
            },
            match_confidence: "api",
            prazo_min: bp.prazo ?? null,
            prazo_max: bp.prazo ?? null,
            frequency: null,
            quote: {
              peso_taxavel_kg: Math.max(peso_real, peso_cubado),
              peso_cubado_kg: peso_cubado,
              peso_real_kg: peso_real,
              usou_cubagem: peso_cubado > peso_real,
              frete_peso: 0,
              advalorem: 0,
              gris: 0,
              pedagio: 0,
              taxa_fixa: 0,
              ta: 0,
              tda: 0,
              subtotal_sem_icms: bp.total,
              min_aplicado: false,
              icms_rate: 0,
              icms: 0,
              total: bp.total,
              lines: [{ key: "api", label: "Frete total (API Braspress)", value: bp.total }],
              avisos: ["Cotação em tempo real via API — impostos e taxas já inclusos no total retornado."],
            },
          });
          if (matchedBy === "none") matchedBy = "api";
        } else if (!bp.ok) {
          warnings.push(`Braspress (API): ${bp.error ?? "indisponível"}.`);
        }
      }
    }

    results.sort((a: any, b: any) => a.quote.total - b.quote.total);

    return NextResponse.json({
      results,
      matched_by: matchedBy,
      ambiguous_city: ambiguous,
      resolved: resolved
        ? { cep: resolved.cep, city: resolved.city, uf: resolved.uf, source: resolved.source }
        : null,
      shipment: {
        peso_real,
        volume_m3,
        peso_cubado: volume_m3 * 300,
        valor_nf,
      },
      warnings,
    });
  } catch (error) {
    console.error("POST freight quote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
