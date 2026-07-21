// Supabase Edge Function: sync-ghl (v4 — foco em oportunidades)
// Fluxo padrão: opportunities -> contacts (SOMENTE os vinculados às
// oportunidades, via GET /contacts/{id}) -> snapshot (SQL via RPC).
// A base completa de contatos (24k+) NÃO é re-sincronizada no fluxo
// diário; use {"phase":"contacts-all"} manualmente se precisar.
//
// Cada invocação processa até TIME_BUDGET_MS e, se não terminou,
// dispara a si mesma com o cursor (EdgeRuntime.waitUntil).
// Body: {} inicia do zero; {"phase",...,"hop"} é uso interno.
//
// Secrets necessários:
//   GHL_API_TOKEN   - token de Private Integration (API v2)
//   GHL_LOCATION_ID - id da subconta (location)
//   SYNC_SECRET     - opcional; se setado, exige header x-sync-secret
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const BASE = "https://services.leadconnectorhq.com";
const TIME_BUDGET_MS = 40_000; // margem folgada sob o limite do runtime
const MAX_HOPS = 30; // trava de segurança contra encadeamento infinito

// Escopo do BI (definido em 2026-07-21): apenas o pipeline
// "Atendimento" (Fábrica de Mockups é passagem dos mesmos clientes)
// e apenas oportunidades criadas a partir de 01/07/2026, quando os
// campos passaram a ser bem preenchidos.
const TARGET_PIPELINE_NAME = "Atendimento";
const MIN_OPP_CREATED_MS = Date.parse("2026-07-01T00:00:00-03:00");

// Oportunidades de teste identificadas manualmente — nunca sincronizar.
const EXCLUDED_OPPORTUNITY_IDS = new Set<string>(["5NxRNIoZI9NQpMflY3r7"]);

interface ChainState {
  phase: "opportunities" | "contacts" | "contacts-all" | "snapshot";
  startAfterId?: string;
  startAfter?: number;
  page?: number;
  offset?: number;
  hop?: number;
}

function ghlHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
}

async function ghlGet(url: string, token: string): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers: ghlHeaders(token) });
    if (res.status === 429 && attempt < 3) {
      attempt++;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 2000));
      continue;
    }
    return res;
  }
}

// deno-lint-ignore no-explicit-any
async function logSync(supabase: any, source: string, startedAt: Date, rows: number, status: string, error?: string) {
  await supabase.from("sync_log").insert({
    source,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    rows_upserted: rows,
    status,
    error: error ?? null,
  });
}

// Dispara a próxima invocação sem esperar a resposta
function chainNext(state: ChainState) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-ghl`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret) headers["x-sync-secret"] = secret;
  EdgeRuntime.waitUntil(
    fetch(url, { method: "POST", headers, body: JSON.stringify(state) }).catch(
      (e) => console.error("chainNext falhou:", e),
    ),
  );
}

// Definições de custom fields da location: fieldKey (sem o prefixo
// "contact.") -> id. Na Hud Lab os UTMs vivem em custom fields do
// CONTATO: Utm Source/Medium/Campaign/Term/Content, Estado, Cidade,
// Qntd Pares. O payload da listagem só traz {id, value}, então o
// mapa de definições é obrigatório para resolver por nome.
async function fetchFieldMap(token: string, locationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // fieldKey -> id
  const res = await ghlGet(`${BASE}/locations/${locationId}/customFields`, token);
  if (!res.ok) return map;
  const data = await res.json();
  for (const f of data.customFields ?? []) {
    const key = String(f.fieldKey ?? "").replace(/^(contact|opportunity)\./, "");
    if (key) map.set(key, f.id);
  }
  return map;
}

// Valor de um custom field do contato, resolvido por fieldKey
// deno-lint-ignore no-explicit-any
function cfValue(contact: any, fieldMap: Map<string, string>, fieldKey: string): string | null {
  const id = fieldMap.get(fieldKey);
  if (!id) return null;
  const cfs: { id?: string; value?: unknown; fieldValue?: unknown }[] =
    contact.customFields ?? contact.customField ?? [];
  const cf = cfs.find((x) => x.id === id);
  const raw = cf?.value ?? cf?.fieldValue;
  return raw != null && String(raw) !== "" ? String(raw) : null;
}

// Extrai UTMs: attributionSource -> lastAttributionSource -> custom fields
// deno-lint-ignore no-explicit-any
function extractUtms(contact: any, fieldMap: Map<string, string>) {
  const out: Record<string, string | null> = {
    utm_source: null, utm_medium: null, utm_campaign: null,
    utm_term: null, utm_content: null, fbclid: null,
  };
  const sources = [contact.attributionSource, contact.lastAttributionSource];
  for (const s of sources) {
    if (!s) continue;
    out.utm_source ??= s.utmSource ?? null;
    out.utm_medium ??= s.utmMedium ?? null;
    out.utm_campaign ??= s.utmCampaign ?? s.campaign ?? null;
    out.utm_term ??= s.utmTerm ?? null;
    out.utm_content ??= s.utmContent ?? null;
    out.fbclid ??= s.fbclid ?? null;
  }
  out.utm_source ??= cfValue(contact, fieldMap, "utm_source");
  out.utm_medium ??= cfValue(contact, fieldMap, "utm_medium");
  out.utm_campaign ??= cfValue(contact, fieldMap, "utm_campaign");
  out.utm_term ??= cfValue(contact, fieldMap, "utm_term");
  out.utm_content ??= cfValue(contact, fieldMap, "utm_content");
  out.fbclid ??= cfValue(contact, fieldMap, "fbclid");
  return out;
}

// qty_pares: custom field da oportunidade cujo id/nome contém
// "pares" ou "quantidade" (nomes resolvidos via /locations/{id}/customFields)
// deno-lint-ignore no-explicit-any
function extractQtyPares(opp: any, paresFieldIds: Set<string>): number | null {
  const cfs: { id?: string; fieldValue?: unknown; value?: unknown; key?: string; name?: string }[] =
    opp.customFields ?? [];
  for (const cf of cfs) {
    const byId = cf.id && paresFieldIds.has(cf.id);
    const key = (cf.key ?? cf.name ?? "").toLowerCase();
    const byName = key.includes("pares") || key.includes("quantidade");
    if (!byId && !byName) continue;
    const raw = cf.fieldValue ?? cf.value;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

// Mapeia um contato (payload da API) para a linha de ghl_contacts
// deno-lint-ignore no-explicit-any
function mapContact(c: any, fieldMap: Map<string, string>) {
  const utms = extractUtms(c, fieldMap);
  const paresRaw = cfValue(c, fieldMap, "qntd_pares");
  const pares = paresRaw != null ? Number(paresRaw) : NaN;
  return {
    id: c.id,
    created_at: c.dateAdded ?? null,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    city: c.city ?? cfValue(c, fieldMap, "cidade"),
    state: (c.state && String(c.state).trim() !== "" ? c.state : null) ??
      cfValue(c, fieldMap, "estado"),
    source: c.source ?? null,
    qty_pares: Number.isFinite(pares) && pares > 0 ? Math.round(pares) : null,
    ...utms,
    raw: c,
    synced_at: new Date().toISOString(),
  };
}

// Fase contacts (padrão): busca APENAS os contatos vinculados a
// oportunidades, um a um via GET /contacts/{id} (o detalhe traz
// customFields completos). Cursor = offset na lista ordenada de ids.
// deno-lint-ignore no-explicit-any
async function runLinkedContacts(supabase: any, token: string, locationId: string, state: ChainState, deadline: number) {
  const startedAt = new Date();
  let rows = 0;
  let errMsg: string | undefined;
  const offset = state.offset ?? 0;
  try {
    const fieldMap = await fetchFieldMap(token, locationId);
    const { data, error } = await supabase
      .from("ghl_opportunities")
      .select("contact_id")
      .not("contact_id", "is", null);
    if (error) throw new Error(`Lista de contact_ids: ${error.message}`);
    const ids = [...new Set((data as { contact_id: string }[]).map((r) => r.contact_id))].sort();

    let i = offset;
    let batch: ReturnType<typeof mapContact>[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const { error: upErr } = await supabase.from("ghl_contacts").upsert(batch, { onConflict: "id" });
      if (upErr) throw new Error(`Upsert contacts: ${upErr.message}`);
      rows += batch.length;
      batch = [];
    };

    for (; i < ids.length && Date.now() < deadline; i++) {
      const res = await ghlGet(`${BASE}/contacts/${ids[i]}`, token);
      if (res.status === 404) continue; // contato apagado no GHL
      if (!res.ok) throw new Error(`GHL contact ${ids[i]} ${res.status}: ${await res.text()}`);
      const body = await res.json();
      const c = body.contact ?? body;
      if (c?.id) batch.push(mapContact(c, fieldMap));
      if (batch.length >= 25) await flush();
    }
    await flush();
    return { rows, next: i < ids.length ? { offset: i } : null };
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await logSync(supabase, "ghl_contacts", startedAt, rows, errMsg ? "error" : "success", errMsg);
  }
}

// Fase contacts-all (manual): pagina a base completa de contatos.
// deno-lint-ignore no-explicit-any
async function runContactsAll(supabase: any, token: string, locationId: string, state: ChainState, deadline: number) {
  const startedAt = new Date();
  let rows = 0;
  let errMsg: string | undefined;
  let startAfterId = state.startAfterId;
  let startAfter = state.startAfter;
  try {
    const fieldMap = await fetchFieldMap(token, locationId);
    while (Date.now() < deadline) {
      const params = new URLSearchParams({ locationId, limit: "100" });
      if (startAfterId) params.set("startAfterId", startAfterId);
      if (startAfter) params.set("startAfter", String(startAfter));
      const res = await ghlGet(`${BASE}/contacts/?${params}`, token);
      if (!res.ok) throw new Error(`GHL contacts ${res.status}: ${await res.text()}`);
      const page = await res.json();
      const contacts = page.contacts ?? [];
      if (contacts.length === 0) return { rows, next: null };

      // deno-lint-ignore no-explicit-any
      const mapped = contacts.map((c: any) => mapContact(c, fieldMap));
      const { error } = await supabase.from("ghl_contacts").upsert(mapped, { onConflict: "id" });
      if (error) throw new Error(`Upsert contacts: ${error.message}`);
      rows += mapped.length;

      const meta = page.meta ?? {};
      const nextId = meta.startAfterId ?? contacts[contacts.length - 1]?.id;
      // trava anti-loop: cursor não avançou
      if (nextId === startAfterId) return { rows, next: null };
      startAfterId = nextId;
      startAfter = meta.startAfter;
      if (contacts.length < 100) return { rows, next: null };
    }
    return { rows, next: { startAfterId, startAfter } };
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await logSync(supabase, "ghl_contacts", startedAt, rows, errMsg ? "error" : "success", errMsg);
  }
}

// deno-lint-ignore no-explicit-any
async function syncPipelines(supabase: any, token: string, locationId: string) {
  const pipelineNames = new Map<string, string>();
  const stageNames = new Map<string, string>();
  let targetPipelineId: string | null = null;
  const res = await ghlGet(`${BASE}/opportunities/pipelines?locationId=${locationId}`, token);
  if (!res.ok) return { pipelineNames, stageNames, targetPipelineId };
  const pd = await res.json();
  const dimRows: { pipeline_id: string; stage_id: string; stage_name: string; stage_order: number }[] = [];
  for (const p of pd.pipelines ?? []) {
    pipelineNames.set(p.id, p.name);
    const isTarget = p.name === TARGET_PIPELINE_NAME;
    if (isTarget) targetPipelineId = p.id;
    (p.stages ?? []).forEach((s: { id: string; name: string }, i: number) => {
      stageNames.set(s.id, s.name);
      // dim só guarda as etapas do pipeline do escopo
      if (isTarget) {
        dimRows.push({ pipeline_id: p.id, stage_id: s.id, stage_name: s.name, stage_order: i });
      }
    });
  }
  if (dimRows.length > 0) {
    const { error } = await supabase
      .from("dim_pipeline_stages")
      .upsert(dimRows, { onConflict: "stage_id" });
    if (error) throw new Error(`Upsert dim_pipeline_stages: ${error.message}`);
  }
  return { pipelineNames, stageNames, targetPipelineId };
}

async function fetchParesFieldIds(token: string, locationId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const res = await ghlGet(`${BASE}/locations/${locationId}/customFields`, token);
  if (!res.ok) return ids;
  const data = await res.json();
  for (const f of data.customFields ?? []) {
    const name = (f.name ?? "").toLowerCase();
    if (name.includes("pares") || name.includes("quantidade")) ids.add(f.id);
  }
  return ids;
}

// Fase opportunities: idem contacts, com paginação por page/startAfterId
// deno-lint-ignore no-explicit-any
async function runOpportunities(supabase: any, token: string, locationId: string, state: ChainState, deadline: number) {
  const startedAt = new Date();
  let rows = 0;
  let errMsg: string | undefined;
  let page = state.page ?? 1;
  let startAfterId = state.startAfterId;
  let startAfter = state.startAfter;
  try {
    const { pipelineNames, stageNames, targetPipelineId } =
      await syncPipelines(supabase, token, locationId);
    const paresFieldIds = await fetchParesFieldIds(token, locationId);

    while (Date.now() < deadline) {
      // status=all: sem isso a API retorna apenas oportunidades "open"
      const params = new URLSearchParams({ location_id: locationId, limit: "100", status: "all" });
      if (startAfterId) params.set("startAfterId", startAfterId);
      if (startAfter) params.set("startAfter", String(startAfter));
      if (!startAfterId) params.set("page", String(page));
      const res = await ghlGet(`${BASE}/opportunities/search?${params}`, token);
      if (!res.ok) throw new Error(`GHL opportunities ${res.status}: ${await res.text()}`);
      const body = await res.json();
      const allOpps = body.opportunities ?? [];
      if (allOpps.length === 0) return { rows, next: null };

      // Escopo: só pipeline Atendimento, criadas a partir de 01/07/2026,
      // excluindo oportunidades de teste conhecidas
      // deno-lint-ignore no-explicit-any
      const opps = allOpps.filter((o: any) =>
        (!targetPipelineId || o.pipelineId === targetPipelineId) &&
        (!o.createdAt || Date.parse(o.createdAt) >= MIN_OPP_CREATED_MS) &&
        !EXCLUDED_OPPORTUNITY_IDS.has(o.id)
      );

      // deno-lint-ignore no-explicit-any
      const mapped = opps.map((o: any) => {
        const status = (o.status ?? "").toLowerCase();
        return {
          id: o.id,
          contact_id: o.contactId ?? o.contact?.id ?? null,
          pipeline_id: o.pipelineId ?? null,
          pipeline_name: pipelineNames.get(o.pipelineId) ?? null,
          stage_id: o.pipelineStageId ?? null,
          stage_name: stageNames.get(o.pipelineStageId) ?? null,
          status,
          monetary_value: o.monetaryValue != null ? Number(o.monetaryValue) : null,
          qty_pares: extractQtyPares(o, paresFieldIds),
          created_at: o.createdAt ?? null,
          updated_at: o.updatedAt ?? null,
          stage_changed_at: o.lastStageChangeAt ?? null,
          won_at: status === "won" ? (o.lastStatusChangeAt ?? o.updatedAt ?? null) : null,
          raw: o,
          synced_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from("ghl_opportunities").upsert(mapped, { onConflict: "id" });
      if (error) throw new Error(`Upsert opportunities: ${error.message}`);
      rows += mapped.length;

      const meta = body.meta ?? {};
      const nextId = meta.startAfterId;
      if (nextId && nextId === startAfterId) return { rows, next: null };
      startAfterId = nextId;
      startAfter = meta.startAfter;
      page++;
      if (allOpps.length < 100) return { rows, next: null };
    }
    return { rows, next: { startAfterId, startAfter, page } };
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await logSync(supabase, "ghl_opportunities", startedAt, rows, errMsg ? "error" : "success", errMsg);
  }
}

Deno.serve(async (req: Request) => {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let state: ChainState = { phase: "opportunities", hop: 0 };
  let debug: string | undefined;
  try {
    const body = await req.json();
    if (body?.phase) state = body as ChainState;
    debug = body?.debug;
  } catch {
    /* body vazio = começa do zero */
  }

  // Diagnóstico: lista as definições de custom fields da location
  // (id, nome, modelo) para mapear onde o GHL guarda UTMs/estado.
  if (debug === "customFields") {
    const token = Deno.env.get("GHL_API_TOKEN");
    const locationId = Deno.env.get("GHL_LOCATION_ID");
    if (!token || !locationId) {
      return new Response(JSON.stringify({ error: "secrets ausentes" }), { status: 500 });
    }
    const res = await ghlGet(`${BASE}/locations/${locationId}/customFields`, token);
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const fields = (data.customFields ?? []).map((f: any) => ({
      id: f.id, name: f.name, fieldKey: f.fieldKey, model: f.model, dataType: f.dataType,
    }));
    return new Response(JSON.stringify({ fields }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const hop = (state.hop ?? 0) + 1;
  if (hop > MAX_HOPS) {
    return new Response(JSON.stringify({ error: "max hops excedido" }), { status: 500 });
  }

  const json = (obj: unknown) =>
    new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });

  try {
    const token = Deno.env.get("GHL_API_TOKEN");
    const locationId = Deno.env.get("GHL_LOCATION_ID");
    if (!token || !locationId) throw new Error("GHL_API_TOKEN / GHL_LOCATION_ID não configurados");

    if (state.phase === "opportunities") {
      const r = await runOpportunities(supabase, token, locationId, state, deadline);
      if (r.next) {
        chainNext({ phase: "opportunities", ...r.next, hop });
        return json({ phase: "opportunities", rows: r.rows, continua: true, hop });
      }
      chainNext({ phase: "contacts", hop });
      return json({ phase: "opportunities", rows: r.rows, continua: false, proxima: "contacts", hop });
    }

    // contatos vinculados às oportunidades (fluxo padrão)
    if (state.phase === "contacts") {
      const r = await runLinkedContacts(supabase, token, locationId, state, deadline);
      if (r.next) {
        chainNext({ phase: "contacts", ...r.next, hop });
        return json({ phase: "contacts", rows: r.rows, continua: true, hop });
      }
      chainNext({ phase: "snapshot", hop });
      return json({ phase: "contacts", rows: r.rows, continua: false, proxima: "snapshot", hop });
    }

    // base completa de contatos (somente execução manual)
    if (state.phase === "contacts-all") {
      const r = await runContactsAll(supabase, token, locationId, state, deadline);
      if (r.next) {
        chainNext({ phase: "contacts-all", ...r.next, hop });
        return json({ phase: "contacts-all", rows: r.rows, continua: true, hop });
      }
      return json({ phase: "contacts-all", rows: r.rows, continua: false, hop });
    }

    // snapshot: uma chamada SQL, sem dados trafegando pela função
    const startedAt = new Date();
    const { data, error } = await supabase.rpc("fn_snapshot_stages");
    if (error) {
      await logSync(supabase, "ghl_snapshots", startedAt, 0, "error", error.message);
      throw new Error(`fn_snapshot_stages: ${error.message}`);
    }
    await logSync(supabase, "ghl_snapshots", startedAt, data ?? 0, "success");
    return json({ phase: "snapshot", rows: data ?? 0, continua: false, hop });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
