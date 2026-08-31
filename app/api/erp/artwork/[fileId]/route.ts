import { NextResponse } from "next/server";
import { downloadPublicArtworkAsJpeg } from "@/lib/erp/google-drive-artwork";
import { artworkFileIdFromPathSegment } from "@/lib/erp/artwork-url";
import { verifyArtworkFileIdSignature } from "@/lib/erp/artwork-proxy";

export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const fileId = artworkFileIdFromPathSegment((await context.params).fileId);
  const query = new URL(request.url).searchParams;
  const expiresAt = Number(query.get("expires"));
  const signature = query.get("signature") ?? "";
  if (
    !fileId
    || !signature
    || !verifyArtworkFileIdSignature(fileId, expiresAt, signature)
  ) {
    return NextResponse.json({ error: "Imagem não autorizada ou expirada." }, { status: 403 });
  }

  try {
    const image = await downloadPublicArtworkAsJpeg(fileId);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `inline; filename="arte-${fileId.replace(/[^A-Za-z0-9_-]/g, "")}.jpg"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.length),
      },
    });
  } catch (error) {
    console.error("ERP artwork proxy failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Não foi possível carregar a miniatura pública da arte.",
      },
      { status: 502 },
    );
  }
}
