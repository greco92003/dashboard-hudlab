import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Valid stage slugs mapped to display names
const STAGE_SLUGS: Record<string, string> = {
  lead: "Lead",
  emailcoletado: "Email Coletado",
  viumockupautomatico: "Viu Mockup Automático",
  conheceumodeloseprecos: "Conheceu Modelos e Preços",
  solicitouorcamento: "Solicitou Orçamento",
  informouquantidade: "Informou Quantidade",
  informouestado: "Informou Estado",
  orcamentogerado: "Orçamento Gerado",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  negociofechado: "Negócio Fechado",
};

/**
 * Normaliza uma string removendo acentos e mantendo apenas letras a-z.
 * Ex: "SolicitouOrçamento" → "solicitouorcamento"
 */
function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD") // decompõe caracteres acentuados (ç → c + cedilha)
    .replace(/[\u0300-\u036f]/g, "") // remove os diacríticos (acentos, cedilha)
    .replace(/[^a-z]/g, ""); // mantém apenas letras a-z sem acento
}

/**
 * Extrai o subscriber_id do payload do ManyChat.
 * O ManyChat pode enviar o ID em vários campos e como número ou string.
 */
function extractSubscriberId(payload: Record<string, unknown>): string {
  const candidates = [
    payload?.subscriber_id,
    payload?.id,
    payload?.user_id,
    payload?.contact_id,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }

  // Fallback com timestamp para garantir unicidade mesmo sem ID
  return `unknown_${Date.now()}`;
}

interface ContactFields {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  quantidade_pares: number | null;
}

/**
 * Extrai campos de contato do payload do ManyChat.
 */
function extractContactFields(payload: Record<string, unknown>): ContactFields {
  const raw = (key: string) => payload?.[key];
  const str = (key: string): string | null => {
    const v = raw(key);
    if (v === undefined || v === null || v === "") return null;
    return String(v);
  };

  // Nome: tenta campo único ou combina first_name + last_name
  const nome =
    str("nome") ||
    str("name") ||
    str("full_name") ||
    (() => {
      const first = str("first_name");
      const last = str("last_name");
      if (first || last) return [first, last].filter(Boolean).join(" ");
      return null;
    })();

  // Telefone
  const telefone =
    str("telefone") || str("phone") || str("phone_number") || str("whatsapp");

  // Email
  const email = str("email") || str("email_address");

  // Quantidade de pares
  const rawQtd =
    raw("quantidade_pares") ?? raw("pares") ?? raw("quantity") ?? raw("qtd");
  const quantidade_pares =
    rawQtd !== undefined && rawQtd !== null && rawQtd !== ""
      ? Number(rawQtd) || null
      : null;

  return { nome, telefone, email, quantidade_pares };
}

export async function POST(request: NextRequest) {
  try {
    // Parse body first — ManyChat may send stage inside the body
    let payload: Record<string, unknown> = {};
    try {
      payload = await request.json();
    } catch {
      // ManyChat may send empty body on some webhook types
    }

    // Resolve stage: body field takes priority, then URL param
    const { searchParams } = new URL(request.url);
    const rawStage =
      (payload?.stage as string) ||
      (payload?.tag as string) ||
      searchParams.get("stage") ||
      "";

    // Normaliza slug removendo acentos/cedilha antes de comparar
    const stageParam = normalizeSlug(rawStage);

    if (!stageParam || !STAGE_SLUGS[stageParam]) {
      console.warn(
        "[ManyChat Webhook] Unknown stage:",
        JSON.stringify({
          rawStage,
          stageParam,
          payloadKeys: Object.keys(payload),
        }),
      );
      // Always 200 so ManyChat doesn't retry
      return NextResponse.json({
        received: true,
        warning: "Unknown stage",
        raw: rawStage,
        normalized: stageParam,
      });
    }

    const stageName = STAGE_SLUGS[stageParam];
    const subscriberId = extractSubscriberId(payload);
    const contactFields = extractContactFields(payload);

    console.log(
      `[ManyChat Webhook] Stage="${stageName}" subscriber_id="${subscriberId}" contact=${JSON.stringify(contactFields)} payload_keys=${JSON.stringify(Object.keys(payload))}`,
    );

    // Persist to Supabase if configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = getSupabaseSecretKey();

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase.from("manychat_tag_events").insert({
        stage_slug: stageParam,
        stage_name: stageName,
        subscriber_id: subscriberId,
        nome: contactFields.nome,
        telefone: contactFields.telefone,
        email: contactFields.email,
        quantidade_pares: contactFields.quantidade_pares,
        payload: payload,
        occurred_at: new Date().toISOString(),
      });

      if (error) {
        // Log the full error — ManyChat must still receive 200
        console.error(
          "[ManyChat Webhook] Supabase insert error:",
          JSON.stringify({
            message: error.message,
            code: error.code,
            details: error.details,
          }),
        );
      } else {
        console.log(
          `[ManyChat Webhook] Inserted OK: stage="${stageName}" subscriber="${subscriberId}"`,
        );
      }
    } else {
      console.warn(
        "[ManyChat Webhook] Supabase not configured — event not persisted",
      );
    }

    return NextResponse.json({
      received: true,
      stage: stageName,
      subscriber_id: subscriberId,
    });
  } catch (error) {
    console.error("[ManyChat Webhook] Unexpected error:", error);
    // Always 200 to avoid ManyChat retries flooding the server
    return NextResponse.json({ received: true, error: "internal" });
  }
}

// ManyChat may send a GET to verify the endpoint — return 200
export async function GET() {
  return NextResponse.json({ status: "ok", service: "manychat-webhook" });
}
