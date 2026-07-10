import { cepDigits } from "./normalize";

export interface CepResult {
  cep: string; // 8 digits
  city: string;
  uf: string;
  neighborhood?: string;
  street?: string;
  lat?: number;
  lng?: number;
  source: "brasilapi" | "viacep";
}

// simple in-memory cache (per server instance)
const cache = new Map<string, CepResult | null>();

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fromBrasilApi(cep: string): Promise<CepResult | null> {
  const j = (await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`)) as
    | {
        cep?: string;
        state?: string;
        city?: string;
        neighborhood?: string;
        street?: string;
        location?: { coordinates?: { latitude?: string | number; longitude?: string | number } };
      }
    | null;
  if (!j || !j.city || !j.state) return null;
  const coords = j.location?.coordinates;
  const lat = coords?.latitude != null ? Number(coords.latitude) : undefined;
  const lng = coords?.longitude != null ? Number(coords.longitude) : undefined;
  return {
    cep,
    city: j.city,
    uf: j.state,
    neighborhood: j.neighborhood || undefined,
    street: j.street || undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    source: "brasilapi",
  };
}

async function fromViaCep(cep: string): Promise<CepResult | null> {
  const j = (await fetchJson(`https://viacep.com.br/ws/${cep}/json/`)) as
    | { erro?: boolean; localidade?: string; uf?: string; bairro?: string; logradouro?: string }
    | null;
  if (!j || j.erro || !j.localidade || !j.uf) return null;
  return {
    cep,
    city: j.localidade,
    uf: j.uf,
    neighborhood: j.bairro || undefined,
    street: j.logradouro || undefined,
    source: "viacep",
  };
}

/** Resolve a CEP to city/UF (+coords when available). BrasilAPI first, ViaCEP fallback. */
export async function resolveCep(raw: unknown): Promise<CepResult | null> {
  const cep = cepDigits(raw);
  if (cep.length !== 8) return null;
  if (cache.has(cep)) return cache.get(cep) ?? null;
  let r = await fromBrasilApi(cep);
  if (!r) r = await fromViaCep(cep);
  cache.set(cep, r);
  return r;
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
