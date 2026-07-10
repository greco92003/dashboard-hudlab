import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

/**
 * POST /api/freight/import
 * Body: { text: string }
 * Uses OpenAI to extract a freight rate table from unstructured text (pasted from PDF/email/spreadsheet).
 * Returns structured rate rows ready for preview and bulk save.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { text } = body as { text: string };

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "Texto muito curto para análise" }, { status: 400 });
    }

    const prompt = `Você é um especialista em logística e transportadoras brasileiras.
Analise o texto abaixo (pode ser uma tabela de frete copiada de PDF, planilha ou email) e extraia os dados de tarifas de frete.

TEXTO:
${text}

Retorne APENAS um JSON válido (sem markdown, sem explicações) no seguinte formato:
{
  "rates": [
    {
      "destination_state": "SP",
      "price_per_volume": 45.00,
      "min_price": 80.00,
      "delivery_days_min": 3,
      "delivery_days_max": 5,
      "notes": ""
    }
  ]
}

Regras:
- destination_state: sigla do estado brasileiro em maiúsculas (AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO)
- price_per_volume: preço por volume/caixa/embalagem (número decimal)
- min_price: frete mínimo se houver, null se não especificado
- delivery_days_min: dias úteis mínimos de entrega, null se não especificado
- delivery_days_max: dias úteis máximos de entrega, null se não especificado
- notes: observações relevantes ou ""
- Inclua TODOS os estados encontrados no texto
- Se encontrar preços por kg ou por peso, tente converter para preço por volume quando possível
- Se não encontrar dados suficientes, retorne rates como array vazio`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0].message.content || "{}";
    let parsed: { rates?: any[] };

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return NextResponse.json({ error: "IA não retornou JSON válido" }, { status: 500 });
    }

    const rates = (parsed.rates || []).map((r: any) => ({
      destination_state: String(r.destination_state || "").toUpperCase(),
      price_per_volume: parseFloat(r.price_per_volume) || 0,
      min_price: r.min_price != null ? parseFloat(r.min_price) : null,
      delivery_days_min: r.delivery_days_min != null ? parseInt(r.delivery_days_min) : null,
      delivery_days_max: r.delivery_days_max != null ? parseInt(r.delivery_days_max) : null,
      notes: r.notes || "",
      valid: BR_STATES.includes(String(r.destination_state || "").toUpperCase()),
    }));

    return NextResponse.json({ rates });
  } catch (error: any) {
    console.error("Import AI parse error:", error);
    if (error?.status === 401) {
      return NextResponse.json({ error: "Chave OpenAI inválida" }, { status: 500 });
    }
    return NextResponse.json({ error: "Erro ao processar texto com IA" }, { status: 500 });
  }
}
