import { NextResponse } from "next/server";
import {
  OrderRegistrationError,
  saveOrderRegistration,
} from "@/lib/ghl/order-registration";
import { orderRegistrationDraftSchema } from "@/lib/ghl/order-registration-shared";
import { requireApprovedUser } from "@/lib/security/route-guards";

const MAX_MULTIPART_BYTES = 255 * 1024 * 1024;

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json(
      { error: "Os arquivos enviados excedem o limite permitido." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const payloadValue = formData.get("payload");
    if (typeof payloadValue !== "string") {
      return NextResponse.json(
        { error: "Dados do pedido não informados." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(payloadValue);
    } catch {
      return NextResponse.json(
        { error: "Dados do pedido inválidos." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const parsed = orderRegistrationDraftSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados do pedido inválidos.",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const opportunity = await saveOrderRegistration(id, parsed.data, files);
    return NextResponse.json(
      { opportunity },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Order registration update failed", error);
    const status =
      error instanceof OrderRegistrationError ? error.status : 502;
    return NextResponse.json(
      {
        error:
          error instanceof OrderRegistrationError
            ? error.message
            : "Não foi possível salvar o pedido no GHL.",
        issues:
          error instanceof OrderRegistrationError ? error.issues : [],
      },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
