import "server-only";

import sharp from "sharp";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export async function downloadPublicArtworkAsJpeg(fileId: string) {
  const url = new URL("https://drive.google.com/thumbnail");
  url.searchParams.set("id", fileId);
  url.searchParams.set("sz", "w1600");
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`O Google Drive respondeu HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim();
  if (!contentType?.startsWith("image/")) {
    throw new Error("O Google Drive não liberou uma miniatura pública da arte.");
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SOURCE_BYTES) {
    throw new Error("A miniatura da arte excede 20 MB.");
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) {
    throw new Error("A miniatura da arte está vazia ou excede 20 MB.");
  }

  return sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
