import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isValidCpfCnpj,
  TINY_CONTACT_LIMITS,
  TINY_CONTRIBUTOR_VALUES,
} from "@/lib/erp/contact-rules";
import { saveTinyContact } from "@/lib/erp/tiny-contact-v2";
import { requireApprovedUser } from "@/lib/security/route-guards";

const schema = z.object({
  ghlContactId: z.string().min(1),
  name: z.string().trim().min(1).max(TINY_CONTACT_LIMITS.name),
  fantasy: z.string().trim().max(TINY_CONTACT_LIMITS.fantasy),
  personType: z.enum(["F", "J"]),
  document: z.string().trim().min(1).max(TINY_CONTACT_LIMITS.document),
  stateRegistration: z.string().trim().max(TINY_CONTACT_LIMITS.stateRegistration),
  municipalRegistration: z.string().trim().max(TINY_CONTACT_LIMITS.municipalRegistration),
  contributor: z.enum(TINY_CONTRIBUTOR_VALUES),
  address: z.string().trim().max(TINY_CONTACT_LIMITS.address),
  number: z.string().trim().max(TINY_CONTACT_LIMITS.number),
  complement: z.string().trim().max(TINY_CONTACT_LIMITS.complement).optional().default(""),
  neighborhood: z.string().trim().max(TINY_CONTACT_LIMITS.neighborhood),
  postalCode: z.string().trim().max(TINY_CONTACT_LIMITS.postalCode),
  city: z.string().trim().max(TINY_CONTACT_LIMITS.city),
  state: z.string().trim().max(TINY_CONTACT_LIMITS.state),
  country: z.string().trim().max(TINY_CONTACT_LIMITS.country),
  phone: z.string().trim().max(TINY_CONTACT_LIMITS.phone),
  email: z.string().trim().email().max(TINY_CONTACT_LIMITS.email).or(z.literal("")),
  emailNfe: z.string().trim().email().max(TINY_CONTACT_LIMITS.emailNfe).or(z.literal("")),
});

const FIELD_LABELS: Record<string, string> = {
  ghlContactId: "Contato do GHL",
  name: "Razão social/nome",
  fantasy: "Nome fantasia",
  personType: "Tipo de pessoa",
  document: "CNPJ/CPF",
  stateRegistration: "Inscrição estadual",
  municipalRegistration: "Inscrição municipal",
  contributor: "Contribuinte",
  address: "Endereço",
  number: "Número",
  complement: "Complemento",
  neighborhood: "Bairro",
  postalCode: "CEP",
  city: "Cidade",
  state: "UF",
  country: "País",
  phone: "Telefone",
  email: "E-mail",
  emailNfe: "E-mail NFe",
};

function validationErrors(error: z.ZodError, body: unknown) {
  const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "campo");
    const value = values[field];
    let message: string;
    if (issue.code === "too_big" && typeof value === "string") {
      message = `Máximo de ${issue.maximum} caracteres no Tiny; o valor atual tem ${value.trim().length}.`;
    } else if (issue.code === "too_small") {
      message = "Este campo é obrigatório.";
    } else if (issue.code === "invalid_string" && issue.validation === "email") {
      message = "Informe um endereço de e-mail válido.";
    } else {
      message = "O valor informado é inválido.";
    }
    if (!fieldErrors[field]) fieldErrors[field] = message;
  }
  const summary = Object.entries(fieldErrors)
    .map(([field, message]) => `${FIELD_LABELS[field] ?? field}: ${message}`)
    .join(" ");
  return { summary, fieldErrors };
}

function inferTinyFieldErrors(message: string) {
  const rules: Array<[string, RegExp]> = [
    ["emailNfe", /e-?mail.{0,10}(nfe|nota fiscal)|nfe.{0,10}e-?mail/i],
    ["stateRegistration", /inscri[cç][aã]o estadual|\bie\b/i],
    ["municipalRegistration", /inscri[cç][aã]o municipal|\bim\b/i],
    ["document", /cpf|cnpj|documento/i],
    ["fantasy", /fantasia/i],
    ["complement", /complemento/i],
    ["neighborhood", /bairro/i],
    ["postalCode", /\bcep\b/i],
    ["city", /cidade|munic[ií]pio/i],
    ["state", /\buf\b|estado/i],
    ["country", /pa[ií]s/i],
    ["phone", /telefone|fone|celular/i],
    ["email", /e-?mail/i],
    ["address", /endere[cç]o|logradouro/i],
    ["number", /n[uú]mero do endere[cç]o/i],
    ["contributor", /contribuinte/i],
    ["name", /nome|raz[aã]o social/i],
  ];
  const match = rules.find(([, pattern]) => pattern.test(message));
  return match ? { [match[0]]: message } : {};
}

export async function POST(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errors = validationErrors(parsed.error, body);
    return NextResponse.json({ error: errors.summary, fieldErrors: errors.fieldErrors }, { status: 400 });
  }
  if (!isValidCpfCnpj(parsed.data.document, parsed.data.personType)) {
    const label = parsed.data.personType === "J" ? "CNPJ" : "CPF";
    return NextResponse.json(
      { error: `${label} inválido. Confira os números e os dígitos verificadores.`, fieldErrors: { document: `${label} inválido.` } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await saveTinyContact(parsed.data));
  } catch (error) {
    console.error("ERP Tiny contact save failed", error);
    const message = error instanceof Error ? error.message : "Não foi possível salvar o contato no Tiny.";
    return NextResponse.json(
      { error: message, fieldErrors: inferTinyFieldErrors(message) },
      { status: 502 },
    );
  }
}
