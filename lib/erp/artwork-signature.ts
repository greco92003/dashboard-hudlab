import { createHmac, timingSafeEqual } from "node:crypto";

export function createArtworkSignature(
  fileId: string,
  expiresAt: number,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`${fileId}:${expiresAt}`)
    .digest("base64url");
}

export function isArtworkSignatureValid(
  fileId: string,
  expiresAt: number,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (!Number.isInteger(expiresAt) || expiresAt < nowSeconds) return false;
  const expected = Buffer.from(createArtworkSignature(fileId, expiresAt, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
