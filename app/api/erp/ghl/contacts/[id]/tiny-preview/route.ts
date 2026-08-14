import { NextResponse } from "next/server";
import { mapGhlContactToErpDraft } from "@/lib/erp/contact-rules";
import { findTinyContactByDocument, getTinyContactById } from "@/lib/erp/tiny-contact-v2";
import type { ErpContactPreview } from "@/lib/erp/types";
import { fetchCustomFieldDefs, fetchGhlContactById } from "@/lib/ghl/api";
import { requireApprovedUser } from "@/lib/security/route-guards";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  try {
    const [contact, definitions] = await Promise.all([
      fetchGhlContactById(id),
      fetchCustomFieldDefs("contact"),
    ]);
    const ghlDraft = mapGhlContactToErpDraft(contact, definitions);
    const existingTinyContact = ghlDraft.document
      ? await findTinyContactByDocument(ghlDraft.document)
      : null;
    const draft = existingTinyContact
      ? await getTinyContactById(existingTinyContact.id, contact.id)
      : ghlDraft;
    const response: ErpContactPreview = { draft, existingTinyContact };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ERP contact preview failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível preparar o contato." },
      { status: 502 },
    );
  }
}
