import { NextRequest, NextResponse } from "next/server";
import { searchGhlContacts } from "@/lib/ghl/api";
import { requireApprovedUser } from "@/lib/security/route-guards";
import type { ErpContact } from "@/lib/erp/types";

export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json(
      { error: "Informe pelo menos 2 caracteres para pesquisar." },
      { status: 400 },
    );
  }

  try {
    const contacts = await searchGhlContacts(query, 30);
    const response: ErpContact[] = contacts.map((contact) => ({
      id: contact.id,
      name:
        contact.contactName?.trim() ||
        [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
        contact.companyName?.trim() ||
        "Contato sem nome",
      companyName: contact.companyName?.trim() || null,
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
    }));
    return NextResponse.json({ contacts: response });
  } catch (error) {
    console.error("ERP GHL contact search failed", error);
    return NextResponse.json(
      { error: "Não foi possível pesquisar os contatos no GHL." },
      { status: 502 },
    );
  }
}
