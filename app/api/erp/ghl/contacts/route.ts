import { NextRequest, NextResponse } from "next/server";
import {
  fetchGhlContactById,
  searchGhlContacts,
  searchGhlOpportunitiesByContact,
  searchGhlOpportunitiesByName,
  type GhlContactSummary,
} from "@/lib/ghl/api";
import { requireApprovedUser } from "@/lib/security/route-guards";
import type { ErpContact } from "@/lib/erp/types";

function toErpContact(contact: GhlContactSummary): ErpContact {
  return {
    id: contact.id,
    name:
      contact.contactName?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      contact.companyName?.trim() ||
      "Contato sem nome",
    companyName: contact.companyName?.trim() || null,
    email: contact.email?.trim() || null,
    phone: contact.phone?.trim() || null,
    deals: [],
  };
}

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
    const [contacts, opportunities] = await Promise.all([
      searchGhlContacts(query, 20),
      searchGhlOpportunitiesByName(query, 20),
    ]);
    const unique = new Map(contacts.map((contact) => [contact.id, contact]));
    const opportunityContacts = new Map(
      opportunities.flatMap((opportunity) => {
        const contactId = opportunity.contactId || opportunity.contact?.id;
        return contactId
          ? [[contactId, opportunity.contact?.name ?? null] as const]
          : [];
      }),
    );
    const missingContactIds = Array.from(opportunityContacts.keys()).filter(
      (contactId) => !unique.has(contactId),
    );
    const relatedContacts = await Promise.allSettled(
      missingContactIds.map((contactId) => fetchGhlContactById(contactId)),
    );
    for (let index = 0; index < relatedContacts.length; index += 1) {
      const result = relatedContacts[index];
      const contactId = missingContactIds[index];
      if (result.status === "fulfilled") {
        unique.set(result.value.id, result.value);
      } else {
        unique.set(contactId, {
          id: contactId,
          contactName: opportunityContacts.get(contactId),
        });
      }
    }
    const contactResults = Array.from(unique.values())
      .map(toErpContact)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .slice(0, 20);
    const dealResults = await Promise.allSettled(
      contactResults.map((contact) => searchGhlOpportunitiesByContact(contact.id)),
    );
    const response = contactResults.map((contact, index) => {
      const result = dealResults[index];
      if (result.status !== "fulfilled") return contact;
      const deals = new Map(
        result.value.map((opportunity) => [
          opportunity.id,
          { id: opportunity.id, name: opportunity.name?.trim() || "Deal sem nome" },
        ]),
      );
      return {
        ...contact,
        deals: Array.from(deals.values()).sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
      };
    });
    return NextResponse.json({ contacts: response });
  } catch (error) {
    console.error("ERP GHL contact search failed", error);
    return NextResponse.json(
      { error: "Não foi possível pesquisar os contatos no GHL." },
      { status: 502 },
    );
  }
}
