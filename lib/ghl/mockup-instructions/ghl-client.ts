import "server-only";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const OPPORTUNITIES_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const CONVERSATIONS_VERSION = "v3";

function requireGhlEnv() {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error("GHL credentials are not configured");
  }
  return { token, locationId };
}

async function ghlRequest<T>(
  path: string,
  options: {
    version?: string;
    method?: "GET" | "POST" | "PUT";
    params?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<T> {
  const { token } = requireGhlEnv();
  const url = new URL(path, GHL_BASE_URL);
  Object.entries(options.params ?? {}).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  const method = options.method ?? "GET";
  const attempts = method === "GET" || method === "PUT" ? 3 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: options.version ?? OPPORTUNITIES_VERSION,
        Accept: "application/json",
        ...(options.body == null ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body == null ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < attempts - 1
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Number.isFinite(retryAfter) ? retryAfter * 1000 : 750 * 2 ** attempt,
        ),
      );
      continue;
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GHL API error ${response.status} on ${url.pathname}: ${body.slice(0, 400)}`,
      );
    }
    return (await response.json()) as T;
  }
  throw new Error(`GHL API request failed on ${url.pathname}`);
}

export interface MockupConversationMessage {
  id: string;
  messageType: string;
  direction: "inbound" | "outbound";
  body: string;
  dateAdded: string;
  source: string | null;
  attachments: string[];
}

type MessagesResponse = {
  messages: {
    lastMessageId?: string;
    nextPage?: boolean;
    messages?: Array<Partial<MockupConversationMessage> & { id: string }>;
  };
};

export async function findConversationIdForContact(
  contactId: string,
): Promise<string | null> {
  const { locationId } = requireGhlEnv();
  const response = await ghlRequest<{
    conversations?: Array<{ id: string; type?: string }>;
  }>("/conversations/search", {
    version: CONVERSATIONS_VERSION,
    params: { locationId, contactId, limit: "10" },
  });
  const conversations = response.conversations ?? [];
  return (
    (
      conversations.find(
        (conversation) => conversation.type === "TYPE_PHONE",
      ) ??
      conversations[0] ??
      null
    )?.id ?? null
  );
}

/**
 * Lê do mais recente para o mais antigo e para assim que encontra o watermark.
 * Sem cache, percorre a conversa inteira (máximo de 2.000 mensagens).
 */
export async function fetchMessagesSince(
  conversationId: string,
  watermarkMessageId: string | null,
): Promise<{
  messages: MockupConversationMessage[];
  totalFetched: number;
  watermarkFound: boolean;
}> {
  const collected: MockupConversationMessage[] = [];
  let cursor: string | undefined;
  let totalFetched = 0;
  let watermarkFound = false;

  for (let page = 0; page < 20; page++) {
    const response = await ghlRequest<MessagesResponse>(
      `/conversations/${conversationId}/messages`,
      {
        version: CONVERSATIONS_VERSION,
        params: {
          limit: "100",
          ...(cursor ? { lastMessageId: cursor } : {}),
        },
      },
    );
    const batch = response.messages?.messages ?? [];
    totalFetched += batch.length;

    for (const raw of batch) {
      if (raw.id === watermarkMessageId) {
        watermarkFound = true;
        break;
      }
      collected.push({
        id: raw.id,
        messageType: raw.messageType ?? "",
        direction: raw.direction === "inbound" ? "inbound" : "outbound",
        body: raw.body ?? "",
        dateAdded: raw.dateAdded ?? new Date(0).toISOString(),
        source: raw.source ?? null,
        attachments: raw.attachments ?? [],
      });
    }

    if (watermarkFound || !response.messages?.nextPage || batch.length === 0)
      break;
    cursor = response.messages.lastMessageId;
    if (!cursor) break;
  }

  return {
    messages: collected.sort(
      (left, right) => Date.parse(left.dateAdded) - Date.parse(right.dateAdded),
    ),
    totalFetched,
    watermarkFound,
  };
}

export async function createContactNote(input: {
  contactId: string;
  title: string;
  body: string;
}): Promise<string | null> {
  const response = await ghlRequest<{ note?: { id?: string } }>(
    `/contacts/${input.contactId}/notes`,
    {
      version: CONVERSATIONS_VERSION,
      method: "POST",
      body: { title: input.title, body: input.body, pinned: false },
    },
  );
  return response.note?.id ?? null;
}

export async function findContactNoteByMarker(
  contactId: string,
  marker: string,
): Promise<string | null> {
  const response = await ghlRequest<{
    notes?: Array<{ id?: string; body?: string }>;
  }>(`/contacts/${contactId}/notes`, {
    version: CONVERSATIONS_VERSION,
  });
  return (
    response.notes?.find((note) => note.body?.includes(marker))?.id ?? null
  );
}

export async function downloadGhlMedia(url: string): Promise<{
  bytes: Buffer;
  mimeType: string;
  filename: string;
} | null> {
  const { token } = requireGhlEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    let response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: CONVERSATIONS_VERSION,
        },
        cache: "no-store",
      });
    }
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 15 * 1024 * 1024)
      return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 15 * 1024 * 1024) return null;
    const pathname = new URL(url).pathname;
    return {
      bytes,
      mimeType: (
        response.headers.get("content-type") || "application/octet-stream"
      )
        .split(";")[0]
        .trim(),
      filename: pathname.split("/").pop() || "attachment",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
