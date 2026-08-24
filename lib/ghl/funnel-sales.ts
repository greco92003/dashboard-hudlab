import type { GhlFunnelStageSlug } from "./funnel";
import { parseGhlFunnelTimestamp, toGhlFunnelIso } from "./funnel-dates";

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GhlFunnelEventSource = "webhook" | "sale";

/** Linha crua de `ghl_funnel_events`. */
export interface GhlFunnelEventRow {
  contact_id: string;
  stage_slug: GhlFunnelStageSlug;
  received_at: string;
}

/** Linha crua de `deals_cache` para um negócio ganho. */
export interface GhlWonDealRow {
  contact_id: string | null;
  closing_date: string | null;
  provider_payload: Record<string, unknown> | null;
}

export interface GhlFunnelEvent extends GhlFunnelEventRow {
  source: GhlFunnelEventSource;
}

/**
 * `closing_date` é TIMESTAMPTZ, mas é sempre gravado à meia-noite UTC: ele
 * marca o DIA do fechamento, não um instante. Converter esse instante para o
 * fuso de São Paulo jogaria a venda para as 21h do dia anterior, então vale a
 * parte de data do próprio valor -- mesma convenção de /api/live-dashboard.
 *
 * Aceita tanto o ISO do PostgREST ("2026-08-21T00:00:00+00:00") quanto a
 * forma com espaço do Postgres ("2026-08-21 00:00:00+00").
 */
export function closingDateToFunnelDay(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const calendarDay = value.trim().slice(0, 10);
  return DATE_ONLY_RE.test(calendarDay) ? calendarDay : null;
}

/**
 * Para valores que são instante real (`received_at` do webhook,
 * `ghl_last_status_change_at` do GHL), o dia do funil é o dia do calendário
 * de São Paulo daquele instante.
 */
export function instantToFunnelDay(value: unknown): string | null {
  const timestamp = parseGhlFunnelTimestamp(value);
  if (timestamp === null) return null;

  return new Date(timestamp - BRAZIL_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Dia do fechamento de uma venda do cache, ou null se a linha não serve. */
export function wonDealFunnelDay(row: GhlWonDealRow): string | null {
  return (
    closingDateToFunnelDay(row.closing_date) ??
    instantToFunnelDay(row.provider_payload?.ghl_last_status_change_at)
  );
}

/** Dia em que cada contato entrou no funil (primeiro webhook recebido). */
function entryDayByContact(rows: GhlFunnelEventRow[]): Map<string, string> {
  const entryDay = new Map<string, string>();

  for (const row of rows) {
    const day = instantToFunnelDay(row.received_at);
    if (day === null) continue;

    const current = entryDay.get(row.contact_id);
    if (!current || day < current) entryDay.set(row.contact_id, day);
  }

  return entryDay;
}

/**
 * Monta a linha do tempo do funil a partir dos webhooks de tag mais as vendas
 * do `deals_cache`, sob duas regras que existem por causa da migração do CRM
 * antigo (números medidos em 2026-08-21):
 *
 * 1. A tag `negociofechado` do GHL é ignorada. Ela só existe em dois dias
 *    (24/07 e 03/08 -- aplicação em massa durante a migração do AC, mesma
 *    data do `GHL_AC_IMPORT_ARTIFACT_DATE`) e nunca mais disparou. Dos 465
 *    contatos marcados, 236 nem venda ganha têm, e nos 229 que têm a data da
 *    tag diverge do fechamento real em 100% dos casos. O `closing_date` do
 *    cache é a data canônica, a mesma que os outros dashboards usam.
 *
 * 2. Uma venda só conta a partir do dia em que o contato entrou no funil.
 *    A importação trouxe 990 negócios ganhos históricos (971 fechados antes
 *    de o funil existir); 331 deles pertencem a contatos que depois entraram
 *    no funil. Sem esse piso, 232 contatos teriam a etapa Negócio Fechado
 *    ancorada numa venda de outro ciclo comercial -- e, pior, a venda nova de
 *    verdade seria descartada, porque vale a primeira de cada contato.
 *
 * A comparação é por dia de calendário, não por instante: a venda fechada no
 * mesmo dia em que o lead entrou é uma conversão válida do funil.
 *
 * Vendas de contatos que nunca apareceram em um webhook ficam de fora -- sem
 * tag de variante elas jamais entrariam em um dos braços do teste A/B, e só
 * inflariam os contadores de `meta`.
 */
export function mergeSalesIntoFunnelEvents(
  webhookRows: GhlFunnelEventRow[],
  wonDealRows: GhlWonDealRow[],
): GhlFunnelEvent[] {
  // `received_at` é TIMESTAMPTZ gerado pelo banco, mas ignorar uma linha
  // legada/importada ruim evita que um registro derrube a página inteira.
  const webhookEvents: GhlFunnelEvent[] = webhookRows
    .filter(
      (row) =>
        row.stage_slug !== "negociofechado" &&
        parseGhlFunnelTimestamp(row.received_at) !== null,
    )
    .map((row) => ({ ...row, source: "webhook" }));

  const entryDay = entryDayByContact(webhookRows);

  const firstSaleByContact = new Map<string, string>();
  for (const row of wonDealRows) {
    if (!row.contact_id) continue;

    const entry = entryDay.get(row.contact_id);
    if (!entry) continue;

    const day = wonDealFunnelDay(row);
    if (day === null || day < entry) continue;

    const current = firstSaleByContact.get(row.contact_id);
    if (!current || day < current) firstSaleByContact.set(row.contact_id, day);
  }

  const saleEvents: GhlFunnelEvent[] = [];
  for (const [contact_id, day] of firstSaleByContact) {
    // A conversão só acontece depois da validação, então valor malformado
    // nunca vira RangeError: Invalid time value.
    const received_at = toGhlFunnelIso(day);
    if (!received_at) continue;

    saleEvents.push({
      contact_id,
      stage_slug: "negociofechado",
      received_at,
      source: "sale",
    });
  }

  return [...webhookEvents, ...saleEvents].sort(
    (left, right) =>
      (parseGhlFunnelTimestamp(left.received_at) ?? 0) -
      (parseGhlFunnelTimestamp(right.received_at) ?? 0),
  );
}
