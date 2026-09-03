import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";
import {
  GHL_FUNNEL_PATHS,
  GHL_FUNNEL_RETIRED,
  GHL_FUNNEL_STAGES,
  GHL_FUNNEL_TITLES,
  GHL_FUNNEL_VARIANT_MARKER,
  GHL_FUNNEL_VARIANT_TAGS,
  GHL_FUNNEL_VARIANTS,
  getGhlFunnelVariant,
  type GhlFunnelStageSlug,
  type GhlFunnelVariant,
} from "@/lib/ghl/funnel";
import { parseGhlFunnelTimestamp } from "@/lib/ghl/funnel-dates";
import {
  mergeSalesIntoFunnelEvents,
  type GhlFunnelEvent,
  type GhlFunnelEventRow,
  type GhlWonDealRow,
} from "@/lib/ghl/funnel-sales";

interface ContactJourney {
  /** Timestamp of each stage's event. GHL tags never fire twice for the same
   * contact, so this is the one and only occurrence -- range filtering
   * happens per-stage in buildFunnel, not here. */
  stageAt: Map<GhlFunnelStageSlug, number>;
  /** Quando o contato entrou em cada braço do teste; o mais antigo vence. */
  variantAt: Map<GhlFunnelVariant, number>;
  /** Whether the contact had at least one event inside the selected range */
  hasEventInRange: boolean;
  /**
   * All-time last *webhook*, used for funnel activity regardless of the
   * range. Venda vinda do `deals_cache` não conta aqui: o selo Ativo e o
   * "último webhook" do painel falam do fluxo de tags do GHL, não do cache.
   */
  lastWebhookAt: number | null;
}

interface DateRangeMs {
  start: number;
  end: number;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
// A página faz poll a cada 30s e monta o funil lendo a tabela de eventos
// inteira. Como a resposta é a mesma para todos os usuários aprovados, um
// cache curto por intervalo faz várias abas dividirem a mesma leitura sem
// que o painel deixe de parecer ao vivo.
const CACHE_TTL_MS = 20_000;
const MAX_CACHE_ENTRIES = 50;
const responseCache = new Map<string, { at: number; body: unknown }>();
// Um funil é considerado desativado após 2 dias seguidos sem receber webhook.
const INACTIVITY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;
// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts the same query contract as the dashboard APIs:
 * `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` or `?period=30|60|90`
 * (30/60/90 => 1/2/3 months back, Brazil time). No params => all time.
 */
function parseRange(searchParams: URLSearchParams): DateRangeMs | null {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (
    startDate &&
    endDate &&
    DATE_PARAM_RE.test(startDate) &&
    DATE_PARAM_RE.test(endDate)
  ) {
    return {
      start: Date.parse(`${startDate}T00:00:00.000-03:00`),
      end: Date.parse(`${endDate}T23:59:59.999-03:00`),
    };
  }

  const periodParam = searchParams.get("period");
  if (!periodParam) return null;

  const period = Number.parseInt(periodParam, 10);
  if (Number.isNaN(period)) return null;

  let months = 1;
  if (period === 60) months = 2;
  else if (period === 90) months = 3;

  // "Today" on Brazil's wall clock.
  const nowBrazil = new Date(Date.now() - BRAZIL_UTC_OFFSET_MS);
  const year = nowBrazil.getUTCFullYear();
  const month = nowBrazil.getUTCMonth();
  const day = nowBrazil.getUTCDate();

  return {
    start:
      Date.UTC(year, month - months, day, 0, 0, 0, 0) + BRAZIL_UTC_OFFSET_MS,
    end: Date.UTC(year, month, day, 23, 59, 59, 999) + BRAZIL_UTC_OFFSET_MS,
  };
}

interface FunnelEventRowComTags extends GhlFunnelEventRow {
  tags: string[] | null;
}

async function fetchAllEvents(): Promise<FunnelEventRowComTags[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows: FunnelEventRowComTags[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("ghl_funnel_events")
      .select("contact_id, stage_slug, received_at, tags")
      .order("received_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as FunnelEventRowComTags[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Contatos marcados com a tag de um braço, segundo o sync de contatos.
 *
 * Fonte complementar ao array `tags` dos eventos: o sync roda uma vez por
 * dia e às vezes vê a tag antes do próximo webhook do contato, às vezes
 * depois. Usar as duas e ficar com a evidência mais antiga é o que dá o
 * retrato completo do braço.
 */
async function fetchVariantTagContacts(): Promise<Map<string, number>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("ghl_contact_tags")
    .select("contact_id, tag, primeiro_visto_em")
    .in("tag", Object.keys(GHL_FUNNEL_VARIANT_TAGS));

  if (error) throw new Error(error.message);

  const primeiroPorContato = new Map<string, number>();
  for (const row of (data ?? []) as {
    contact_id: string;
    tag: string;
    primeiro_visto_em: string;
  }[]) {
    const at = parseGhlFunnelTimestamp(row.primeiro_visto_em);
    if (at === null) continue;
    const atual = primeiroPorContato.get(row.contact_id);
    if (atual === undefined || at < atual) {
      primeiroPorContato.set(row.contact_id, at);
    }
  }

  return primeiroPorContato;
}

/**
 * Evento sintético da etapa marcadora para os braços que só existem como tag.
 *
 * O "Atendimento Lado B" substituiu o "Com Mockup Automático" sem ganhar um
 * webhook próprio, então nenhum evento chega com `stage_slug` dele -- a tag
 * só aparece de carona no array `tags` dos eventos das outras etapas. Sem
 * este evento sintético o braço inteiro seria invisível no funil, mesmo com
 * os leads circulando normalmente.
 *
 * A ÂNCORA É A ENTRADA DO CONTATO NO FUNIL, não a primeira vez que a tag foi
 * vista. O braço é atribuído na mensagem de boas-vindas do WhatsApp, junto
 * com o lead -- é assim que os braços com webhook próprio se comportam, e por
 * isso eles mostram 100% na etapa marcadora. Já a evidência da tag depende do
 * sync diário e do próximo webhook do contato: medido em 02/09/2026, ela
 * chegava em média 5,3 h depois do lead (até 21,8 h) e caía em outro dia do
 * calendário em 26% dos casos. Ancorar nela fazia a etapa marcadora contar
 * gente cujo lead ficou fora do período -- o funil chegou a exibir 57
 * marcadores para 46 leads, 124%, num intervalo de três dias.
 */
function buildVariantTagEvents(
  rows: FunnelEventRowComTags[],
  tagContacts: Map<string, number>,
): GhlFunnelEventRow[] {
  const varianteDoContato = new Map<string, GhlFunnelVariant>();
  // Quando o contato entrou no funil: o evento de lead, ou o mais antigo que
  // ele tiver. É esta a âncora do marcador.
  const entradaDoContato = new Map<string, { at: number; ehLead: boolean }>();
  // Evidência da tag, guardada só como último recurso para contato que não
  // tem nenhum evento de webhook.
  const evidenciaDaTag = new Map<string, number>();

  const registrarEvidencia = (contactId: string, at: number) => {
    const atual = evidenciaDaTag.get(contactId);
    if (atual === undefined || at < atual) evidenciaDaTag.set(contactId, at);
  };

  for (const row of rows) {
    const at = parseGhlFunnelTimestamp(row.received_at);
    if (at === null) continue;

    const ehLead = row.stage_slug === "lead";
    const entrada = entradaDoContato.get(row.contact_id);
    // Evento de lead sempre ganha de qualquer outra etapa; entre dois do
    // mesmo tipo, vale o mais antigo.
    if (
      entrada === undefined ||
      (ehLead && !entrada.ehLead) ||
      (ehLead === entrada.ehLead && at < entrada.at)
    ) {
      entradaDoContato.set(row.contact_id, { at, ehLead });
    }

    for (const tag of row.tags ?? []) {
      const variante = GHL_FUNNEL_VARIANT_TAGS[tag];
      if (variante) {
        varianteDoContato.set(row.contact_id, variante);
        registrarEvidencia(row.contact_id, at);
      }
    }
  }

  // O sync de contatos não guarda qual tag deu origem; como só existe um
  // braço por tag hoje, resolve pela primeira correspondência.
  const [variantePadrao] = Object.values(GHL_FUNNEL_VARIANT_TAGS);
  if (variantePadrao) {
    for (const [contactId, at] of tagContacts) {
      if (!varianteDoContato.has(contactId)) {
        varianteDoContato.set(contactId, variantePadrao);
      }
      registrarEvidencia(contactId, at);
    }
  }

  const eventos: GhlFunnelEventRow[] = [];
  for (const [contact_id, variante] of varianteDoContato) {
    const at = entradaDoContato.get(contact_id)?.at ?? evidenciaDaTag.get(contact_id);
    if (at === undefined) continue;

    eventos.push({
      contact_id,
      stage_slug: GHL_FUNNEL_VARIANT_MARKER[variante],
      received_at: new Date(at).toISOString(),
    });
  }

  return eventos;
}

async function fetchWonSales(): Promise<GhlWonDealRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows: GhlWonDealRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("deals_cache")
      .select("contact_id, closing_date, provider_payload")
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      // `status` já chega normalizado por normalizeGhlDealStatus, então as
      // etapas pós-venda da Fábrica de Mockups entram aqui junto com o
      // pipeline principal -- onde estão 1031 dos 1034 negócios ganhos.
      // Filtrar só pela Fábrica deixava a etapa Negócio Fechado praticamente
      // zerada (3 negócios, nenhum deles com tag de variante).
      .eq("status", "won")
      .not("contact_id", "is", null)
      // Sem ordem estável o .range() pode repetir ou pular linhas entre páginas.
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as GhlWonDealRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildJourneys(events: GhlFunnelEvent[], range: DateRangeMs | null) {
  const journeys = new Map<string, ContactJourney>();

  for (const event of events) {
    const timestamp = parseGhlFunnelTimestamp(event.received_at);
    if (timestamp === null) continue;
    let journey = journeys.get(event.contact_id);
    if (!journey) {
      journey = {
        stageAt: new Map(),
        variantAt: new Map(),
        hasEventInRange: range === null,
        lastWebhookAt: null,
      };
      journeys.set(event.contact_id, journey);
    }

    if (
      event.source === "webhook" &&
      (journey.lastWebhookAt === null || timestamp > journey.lastWebhookAt)
    ) {
      journey.lastWebhookAt = timestamp;
    }

    if (range && timestamp >= range.start && timestamp <= range.end) {
      journey.hasEventInRange = true;
    }

    // The A/B variant identity comes from the first event of each arm,
    // regardless of the selected range.
    const variante = getGhlFunnelVariant(event.stage_slug);
    if (variante && !journey.variantAt.has(variante)) {
      journey.variantAt.set(variante, timestamp);
    }

    // Each GHL tag fires at most once per contact -- record its real
    // timestamp unconditionally. Whether it counts for a given range is
    // decided per-stage in buildFunnel, not here.
    if (!journey.stageAt.has(event.stage_slug)) {
      journey.stageAt.set(event.stage_slug, timestamp);
    }
  }

  return journeys;
}

/**
 * Um contato pertence ao braço em que entrou primeiro. Na prática as tags
 * são exclusivas -- nenhum contato do Lado B carrega com/sem mockup --, mas
 * o desempate por data mantém o funil determinístico se algum dia se
 * sobrepuserem.
 */
function resolveVariant(journey: ContactJourney): GhlFunnelVariant | null {
  let escolhida: GhlFunnelVariant | null = null;
  let maisAntiga = Number.POSITIVE_INFINITY;

  for (const [variante, at] of journey.variantAt) {
    if (at < maisAntiga) {
      maisAntiga = at;
      escolhida = variante;
    }
  }

  return escolhida;
}

function buildFunnel(
  journeys: Map<string, ContactJourney>,
  variant: GhlFunnelVariant,
  range: DateRangeMs | null,
) {
  const path = GHL_FUNNEL_PATHS[variant];
  const variantJourneys = Array.from(journeys.values()).filter(
    (journey) => resolveVariant(journey) === variant,
  );

  return path.map((stage) => {
    const value = variantJourneys.reduce((total, journey) => {
      const at = journey.stageAt.get(stage);
      if (at === undefined) return total;
      // Each stage counts only if its own event happened inside the
      // selected range -- a contact whose mockup request predates the
      // range must not be re-surfaced just because they had unrelated
      // activity (e.g. moving to negotiation) inside it.
      if (range && (at < range.start || at > range.end)) return total;
      return total + 1;
    }, 0);

    return {
      slug: stage,
      label: GHL_FUNNEL_STAGES[stage],
      value,
    };
  });
}

/**
 * A funnel is active "today" (Meta Ads semantics) when any webhook
 * attributable to it arrived within the inactivity threshold — this is
 * independent of the selected range.
 */
function variantActivity(
  journeys: Map<string, ContactJourney>,
  variant: GhlFunnelVariant,
  now: number,
) {
  let lastEventAt: number | null = null;
  for (const journey of journeys.values()) {
    if (resolveVariant(journey) !== variant) continue;
    if (journey.lastWebhookAt === null) continue;
    if (lastEventAt === null || journey.lastWebhookAt > lastEventAt) {
      lastEventAt = journey.lastWebhookAt;
    }
  }

  return {
    active:
      lastEventAt !== null && now - lastEventAt <= INACTIVITY_THRESHOLD_MS,
    lastEventAt: lastEventAt === null ? null : new Date(lastEventAt).toISOString(),
  };
}

export async function GET(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams);

    const cacheKey = range ? `${range.start}:${range.end}` : "all";
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.body, {
        headers: {
          "Cache-Control": "no-store",
          "X-Data-Source": "ghl-webhooks",
          "X-Cache": "hit",
        },
      });
    }

    const [webhookRows, wonDealRows, tagContacts] = await Promise.all([
      fetchAllEvents(),
      fetchWonSales(),
      fetchVariantTagContacts(),
    ]);
    const events = mergeSalesIntoFunnelEvents(
      [...webhookRows, ...buildVariantTagEvents(webhookRows, tagContacts)],
      wonDealRows,
    );
    const journeys = buildJourneys(events, range);
    const journeyList = Array.from(journeys.values());
    const inRangeJourneys = journeyList.filter(
      (journey) => journey.hasEventInRange,
    );
    const now = Date.now();

    // O rodapé conta "webhooks", então as vendas trazidas do deals_cache
    // ficam de fora daqui e do "último evento".
    const webhookEvents = events.filter((event) => event.source === "webhook");
    const eventsInRange = range
      ? webhookEvents.filter((event) => {
          const timestamp = parseGhlFunnelTimestamp(event.received_at);
          return (
            timestamp !== null &&
            timestamp >= range.start &&
            timestamp <= range.end
          );
        }).length
      : webhookEvents.length;

    const funnels = GHL_FUNNEL_VARIANTS.map((variante) => {
      const atividade = variantActivity(journeys, variante, now);
      const aposentadoEm = GHL_FUNNEL_RETIRED[variante] ?? null;
      return {
        id: variante,
        title: GHL_FUNNEL_TITLES[variante],
        stages: buildFunnel(journeys, variante, range),
        // Braço aposentado nunca aparece como ativo, mesmo que o último
        // webhook ainda esteja dentro do limiar de inatividade.
        active: aposentadoEm === null && atividade.active,
        retiredAt: aposentadoEm,
        lastEventAt: atividade.lastEventAt,
      };
    });

    const body = {
      funnels,
      meta: {
        totalEvents: eventsInRange,
        totalContacts: inRangeJourneys.length,
        unassignedContacts: inRangeJourneys.filter(
          (journey) => resolveVariant(journey) === null,
        ).length,
        ambiguousContacts: inRangeJourneys.filter(
          (journey) => journey.variantAt.size > 1,
        ).length,
        lastEventAt: webhookEvents.at(-1)?.received_at ?? null,
        // A página avisa quando o período escolhido começa antes do
        // primeiro webhook -- senão dias sem dado parecem queda.
        firstEventAt: webhookEvents[0]?.received_at ?? null,
        range: range
          ? {
              from: new Date(range.start).toISOString(),
              to: new Date(range.end).toISOString(),
            }
          : null,
        generatedAt: new Date().toISOString(),
      },
    };

    if (responseCache.size >= MAX_CACHE_ENTRIES) responseCache.clear();
    responseCache.set(cacheKey, { at: Date.now(), body });

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store",
        "X-Data-Source": "ghl-webhooks",
        "X-Cache": "miss",
      },
    });
  } catch (error) {
    console.error("[GHL Funnel] Failed to build funnel", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build funnel",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
