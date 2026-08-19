import assert from "node:assert/strict";
import test from "node:test";
import {
  createArtworkSignature,
  isArtworkSignatureValid,
} from "../lib/erp/artwork-signature.ts";

test("assina a miniatura do Drive com validade curta", () => {
  const secret = "segredo-de-teste";
  const expiresAt = 2_000;
  const signature = createArtworkSignature("drive-file-123", expiresAt, secret);

  assert.equal(
    isArtworkSignatureValid("drive-file-123", expiresAt, signature, secret, 1_999),
    true,
  );
  assert.equal(
    isArtworkSignatureValid("outro-arquivo", expiresAt, signature, secret, 1_999),
    false,
  );
  assert.equal(
    isArtworkSignatureValid("drive-file-123", expiresAt, signature, secret, 2_001),
    false,
  );
});
