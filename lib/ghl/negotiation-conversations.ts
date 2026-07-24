/**
 * GHL Conversations API client for the negotiation sales agent.
 *
 * Reads the real WhatsApp thread of a negotiation (both the client's and
 * the seller's messages) so the Auditor/Copiloto agent (lib/ghl/sales-agent)
 * has full context. Separate from lib/ghl/api.ts because the Conversations
 * endpoints require a different API `Version` header (2021-04-15) than
 * opportunities/contacts (2021-07-28), and because the response shapes are
 * unrelated.
 */
import {
  extractOpportunityFieldValue,
  fetchCustomFieldDefs,
} from "@/lib/ghl/api";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
// Conversations endpoints pin this specific version — confirmed via the
// public OpenAPI spec (github.com/GoHighLevel/highlevel-api-docs). Do not
// swap in GHL_API_VERSION (2021-07-28), it 404s/behaves differently here.
const CONVERSATIONS_API_VERSION = "2021-04-15";

function requireGhlEnv(): { token: string; locationId: string } {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error(
      "GHL credentials missing: set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID",
    );
  }
  return { token, locationId };
}

async function ghlConversationsFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const { token } = requireGhlEnv();
  const url = new URL(path, GHL_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  // Single retry on rate limit, same policy as lib/ghl/api.ts (PIT burst
  // limit: 100 requests / 10s).
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: CONVERSATIONS_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GHL Conversations API error ${response.status} on ${url.pathname}: ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`GHL Conversations API rate limited on ${url.pathname}`);
}

interface GhlConversationSearchResult {
  conversations: Array<{ id: string; type: string; contactId: string }>;
  total: number;
}

/** Find the WhatsApp/SMS/Call conversation thread for a contact (GHL groups them under type TYPE_PHONE). */
async function findPhoneConversationId(
  contactId: string,
): Promise<string | null> {
  const { locationId } = requireGhlEnv();
  const result = await ghlConversationsFetch<GhlConversationSearchResult>(
    "/conversations/search",
    { locationId, contactId, limit: "10" },
  );
  if (!result.conversations || result.conversations.length === 0) return null;
  const phoneConversation = result.conversations.find(
    (c) => c.type === "TYPE_PHONE",
  );
  return (phoneConversation ?? result.conversations[0]).id;
}

interface GhlRawMessage {
  id: string;
  messageType: string;
  direction: "inbound" | "outbound";
  body?: string;
  dateAdded: string;
  userId?: string;
  attachments?: string[];
}

interface GhlMessagesPage {
  lastMessageId: string;
  nextPage: boolean;
  messages: GhlRawMessage[];
}

/** GET .../messages nests an extra "messages" layer that the public docs don't show. */
interface GhlMessagesResponse {
  messages: GhlMessagesPage;
}

const MAX_MESSAGE_PAGES = 20; // safety cap: 20 * 100 = 2000 messages per conversation

async function fetchAllMessages(
  conversationId: string,
): Promise<GhlRawMessage[]> {
  const all: GhlRawMessage[] = [];
  let lastMessageId: string | undefined;

  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    const params: Record<string, string> = { limit: "100" };
    if (lastMessageId) params.lastMessageId = lastMessageId;

    const raw = await ghlConversationsFetch<GhlMessagesResponse>(
      `/conversations/${conversationId}/messages`,
      params,
    );
    const page_ = raw.messages;
    all.push(...page_.messages);

    if (!page_.nextPage || page_.messages.length === 0) break;
    lastMessageId = page_.lastMessageId;
  }

  return all;
}

export interface NegotiationMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  dateAdded: string;
  userId: string | null;
  attachments: string[];
}

export interface NegotiationTranscript {
  conversationId: string | null;
  messages: NegotiationMessage[];
}

/**
 * Full WhatsApp history for a contact, both directions (client + seller),
 * oldest first. Deliberately NOT filtered by negotiation-start date: the
 * `emnegociacao` tag is only used upstream to decide WHICH contacts get
 * processed at all (keeps the system light — see NEGOTIATION_TRACKING_START_ISO
 * below), not to trim the conversation itself. Once a contact qualifies,
 * the agent needs the real context that led to the negotiation (what was
 * discussed, images/audio already exchanged), not just messages that
 * happen to land after the tag fired — in practice the tag usually fires
 * with no new message yet, which made the agent context-blind right when
 * it mattered most. Returns an empty message array (not an error) when
 * there's no conversation yet — callers decide how to handle "not enough
 * data".
 */
export async function getNegotiationTranscript(
  contactId: string,
): Promise<NegotiationTranscript> {
  const conversationId = await findPhoneConversationId(contactId);
  if (!conversationId) return { conversationId: null, messages: [] };

  const rawMessages = await fetchAllMessages(conversationId);

  const messages = rawMessages
    .filter((m) => m.messageType === "TYPE_WHATSAPP")
    .map(
      (m): NegotiationMessage => ({
        id: m.id,
        direction: m.direction,
        body: m.body ?? "",
        dateAdded: m.dateAdded,
        userId: m.userId ? m.userId : null,
        attachments: m.attachments ?? [],
      }),
    )
    // API returns newest-first; the agent needs a chronological transcript.
    .sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));

  return { conversationId, messages };
}

export interface ResponseGapStats {
  /** Average minutes between a client message and the seller's next reply. Null if no pairs found. */
  avgSellerResponseMinutes: number | null;
  /** Longest single gap between a client message and the seller's next reply. */
  longestSellerSilenceMinutes: number | null;
  longestSellerSilenceAt: string | null;
  /** How long ago the most recent message was sent, and who sent it — tells the agent whether it's currently waiting on the client or on the seller. */
  minutesSinceLastMessage: number | null;
  lastMessageDirection: "inbound" | "outbound" | null;
}

/**
 * Computes seller response-time signals from a chronological message list,
 * so the agent can reason about pacing (e.g. suggest a follow-up instead of
 * an immediate message when the client has gone quiet, or flag that the
 * seller is sitting on an unanswered message) instead of only reading text.
 */
export function computeResponseGapStats(
  messages: NegotiationMessage[],
): ResponseGapStats {
  const responseTimesMinutes: number[] = [];
  let longestMinutes: number | null = null;
  let longestAt: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].direction !== "inbound") continue;
    const clientAt = Date.parse(messages[i].dateAdded);
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].direction === "outbound") {
        const sellerAt = Date.parse(messages[j].dateAdded);
        const minutes = (sellerAt - clientAt) / 60000;
        responseTimesMinutes.push(minutes);
        if (longestMinutes === null || minutes > longestMinutes) {
          longestMinutes = minutes;
          longestAt = messages[i].dateAdded;
        }
        break;
      }
    }
  }

  const avg =
    responseTimesMinutes.length > 0
      ? responseTimesMinutes.reduce((a, b) => a + b, 0) /
        responseTimesMinutes.length
      : null;

  const last = messages[messages.length - 1] ?? null;
  const minutesSinceLastMessage = last
    ? (Date.now() - Date.parse(last.dateAdded)) / 60000
    : null;

  return {
    avgSellerResponseMinutes: avg,
    longestSellerSilenceMinutes: longestMinutes,
    longestSellerSilenceAt: longestAt,
    minutesSinceLastMessage,
    lastMessageDirection: last ? last.direction : null,
  };
}

/**
 * Scope decision from the design spec: no backfill. Only contacts whose
 * `ghl_funnel_events` row (stage_slug='emnegociacao') has `received_at` on
 * or after this date are ever picked up by either agent mode — this is
 * purely a "which contacts to process" gate (keeps the system light,
 * ignores clients who never reached negotiation). It does NOT trim which
 * messages get read once a contact qualifies — see getNegotiationTranscript,
 * which intentionally fetches the full history. Update this only if the
 * launch date actually changes; do not move it forward casually, it
 * defines what "no backfill" means operationally.
 */
export const NEGOTIATION_TRACKING_START_ISO = "2026-07-23T00:00:00.000Z";

let vendedorFieldIdCache: { id: string | null; fetchedAt: number } | null =
  null;
const FIELD_ID_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, field defs rarely change

async function fetchVendedorFieldId(): Promise<string | null> {
  const now = Date.now();
  if (
    vendedorFieldIdCache &&
    now - vendedorFieldIdCache.fetchedAt < FIELD_ID_CACHE_TTL_MS
  ) {
    return vendedorFieldIdCache.id;
  }

  // Opportunity custom fields use the 2021-07-28 API version, not the
  // Conversations one — fetchCustomFieldDefs (lib/ghl/api.ts) already
  // targets the right endpoint/version and retries once on 429, same
  // policy as ghlConversationsFetch above.
  const customFieldDefs = await fetchCustomFieldDefs("opportunity");
  const field = customFieldDefs.find(
    (f) => (f.name || "").trim().toLowerCase() === "vendedor",
  );
  vendedorFieldIdCache = { id: field ? field.id : null, fetchedAt: now };
  return vendedorFieldIdCache.id;
}

/**
 * Seller name for an opportunity, read from the "Vendedor" custom field
 * already cached in `ghl_opportunities.raw` (no extra GHL API call for the
 * opportunity itself — only the field-id lookup is cached/fetched).
 */
export async function getVendedorForOpportunity(
  raw: unknown,
): Promise<string | null> {
  const fieldId = await fetchVendedorFieldId();
  if (!fieldId) return null;
  const customFields = (raw as { customFields?: Array<Record<string, unknown> & { id: string }> })
    ?.customFields;
  if (!customFields) return null;
  const entry = customFields.find((f) => f.id === fieldId);
  if (!entry) return null;
  return extractOpportunityFieldValue(entry);
}
