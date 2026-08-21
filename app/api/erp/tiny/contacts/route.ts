import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidCpfCnpj, TINY_CONTRIBUTOR_VALUES } from "@/lib/erp/contact-rules";
import { saveTinyContact } from "@/lib/erp/tiny-contact-v2";
import { requireApprovedUser } from "@/lib/security/route-guards";

const schema = z.object({
  ghlContactId: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  fantasy: z.string().trim().max(60),
  personType: z.enum(["F", "J"]),
  document: z.string().trim().min(1).max(18),
  stateRegistration: z.string().trim().max(18),
  municipalRegistration: z.string().trim().max(18),
  contributor: z.enum(TINY_CONTRIBUTOR_VALUES),
  address: z.string().trim().max(50),
  number: z.string().trim().max(10),
  complement: z.string().trim().max(50).optional().default(""),
  neighborhood: z.string().trim().max(30),
  postalCode: z.string().trim().max(10),
  city: z.string().trim().max(30),
  state: z.string().trim().max(2),
  country: z.string().trim().max(30),
  phone: z.string().trim().max(30),
  email: z.string().trim().email().max(50).or(z.literal("")),
  emailNfe: z.string().trim().email().max(50).or(z.literal("")),
});

export async function POST(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos obrigatórios e os limites do Tiny." }, { status: 400 });
  }
  if (!isValidCpfCnpj(parsed.data.document, parsed.data.personType)) {
    return NextResponse.json({ error: `${parsed.data.personType === "J" ? "CNPJ" : "CPF"} inválido.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await saveTinyContact(parsed.data));
  } catch (error) {
    console.error("ERP Tiny contact save failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar o contato no Tiny." },
      { status: 502 },
    );
  }
}
