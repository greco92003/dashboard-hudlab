import { NextResponse } from "next/server";
import { z } from "zod";
import { onlyDigits } from "@/lib/erp/contact-rules";
import { getTinyContactFiscalData } from "@/lib/erp/tiny-contact-v2";
import { requireAdmin } from "@/lib/security/route-guards";

const schema = z.object({
  cnpj: z.string().min(1),
  state: z.string().length(2),
  name: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || onlyDigits(parsed.data.cnpj).length !== 14) {
    return NextResponse.json({ error: "Informe um CNPJ e uma UF válidos." }, { status: 400 });
  }

  try {
    const tinyData = await getTinyContactFiscalData(parsed.data.cnpj);
    if (tinyData?.hasFiscalData) {
      return NextResponse.json({
        stateRegistration: tinyData.stateRegistration,
        municipalRegistration: tinyData.municipalRegistration,
        contributor: null,
        type: "Cadastro existente no Tiny",
        active: true,
        cached: false,
        source: "tiny",
        tinyContactId: tinyData.tinyContactId,
      });
    }
  } catch (error) {
    // A indisponibilidade da leitura no Tiny não impede o fallback fiscal.
    console.error("Tiny fiscal lookup failed; using SintegrAPI fallback", error);
  }

  const apiKey = process.env.SINTEGRAPI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SINTEGRAPI_API_KEY não configurada." }, { status: 503 });

  const url = new URL(`https://api.sintegrapi.com.br/consultas/v2/sintegra/${onlyDigits(parsed.data.cnpj)}`);
  url.searchParams.set("uf", parsed.data.state.toUpperCase());
  url.searchParams.set("cache_strategy", "CACHE_PREFERENCIAL");
  url.searchParams.set("cache", "30");
  url.searchParams.set("error_fallback", "true");

  try {
    const response = await fetch(url, { headers: { "x-api-key": apiKey }, cache: "no-store" });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof body.message === "string" ? body.message : "Consulta fiscal indisponível.";
      const exhausted = response.status === 402 || response.status === 429 || /saldo|cr[eé]dito|limite/i.test(message);
      return NextResponse.json(
        { error: exhausted ? "Saldo da SintegrAPI esgotado. Consulte o Sintegra manualmente e preencha os campos." : message, exhausted },
        { status: response.status },
      );
    }

    const registrations = Array.isArray(body.inscricoes_estaduais)
      ? body.inscricoes_estaduais as Array<Record<string, unknown>>
      : [];
    const state = parsed.data.state.toUpperCase();
    const selected = registrations.find((item) => item.uf === state && item.ativa === true)
      ?? registrations.find((item) => item.ativa === true)
      ?? registrations[0];
    const type = String(selected?.tipo_ie ?? "");
    const registration = String(selected?.inscricao_estadual ?? "");
    const contributor = /n[aã]o contribuinte/i.test(type) ? "9" : registration ? "1" : "9";
    return NextResponse.json({
      stateRegistration: registration,
      municipalRegistration: "",
      contributor,
      type,
      active: selected?.ativa === true,
      cached: body.is_cache === true,
      source: "sintegrapi",
    });
  } catch (error) {
    console.error("SintegrAPI request failed", error);
    return NextResponse.json({ error: "Não foi possível consultar a SintegrAPI agora." }, { status: 502 });
  }
}
