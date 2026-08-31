import {
  artworkProxyPath,
  artworkThumbnailUrl,
  googleDriveFileId,
} from "./artwork-url";
import { createArtworkSignature, isArtworkSignatureValid } from "./artwork-signature";

function proxySecret() {
  const secret =
    process.env.ERP_ARTWORK_PROXY_SECRET
    || process.env.TINY_CLIENT_SECRET
    || process.env.TINY_TOKEN;
  if (!secret) {
    throw new Error("A assinatura do proxy de imagens do ERP não está configurada.");
  }
  return secret;
}

export function signArtworkFileId(
  fileId: string,
  expiresAt: number,
  secret = proxySecret(),
) {
  return createArtworkSignature(fileId, expiresAt, secret);
}

export function verifyArtworkFileIdSignature(
  fileId: string,
  expiresAt: number,
  signature: string,
  secret = proxySecret(),
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  return isArtworkSignatureValid(fileId, expiresAt, signature, secret, nowSeconds);
}

export function artworkImportUrl(sourceUrl: string, publicOrigin: string) {
  const fileId = googleDriveFileId(sourceUrl);
  if (!fileId) return artworkThumbnailUrl(sourceUrl);
  const expiresAt = Math.floor(Date.now() / 1_000) + 15 * 60;
  const url = new URL(artworkProxyPath(fileId), publicOrigin);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signArtworkFileId(fileId, expiresAt));
  return url.toString();
}
