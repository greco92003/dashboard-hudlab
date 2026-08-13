import { NextRequest, NextResponse } from "next/server";
import { searchGhlOpportunitiesByContact } from "@/lib/ghl/api";
import { requireApprovedUser } from "@/lib/security/route-guards";
import type { ErpDeal } from "@/lib/erp/types";

export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const contactId = request.nextUrl.searchParams.get("contactId")?.trim();
  if (!contactId) {
    return NextResponse.json({ error: "Contato não informado." }, { status: 400 });
  }

  try {
    const opportunities = await searchGhlOpportunitiesByContact(contactId);
    const deals: ErpDeal[] = opportunities
      .map((opportunity) => ({
        id: opportunity.id,
        name: opportunity.name || "Deal sem nome",
        status: opportunity.status,
        monetaryValue: opportunity.monetaryValue,
        createdAt: opportunity.createdAt,
        updatedAt: opportunity.updatedAt,
      }))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return NextResponse.json({ deals });
  } catch (error) {
    console.error("ERP GHL deal search failed", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os deals deste contato." },
      { status: 502 },
    );
  }
}
