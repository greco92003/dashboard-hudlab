import assert from "node:assert/strict";
import test from "node:test";
import { artworkEmbedUrl, artworkThumbnailUrl, googleDriveFileId } from "../lib/erp/artwork-url.ts";

test("converte link /view do Google Drive em miniatura renderizável", () => {
  const url = "https://drive.google.com/file/d/1AbC_xyz-123/view?usp=drive_link";
  assert.equal(googleDriveFileId(url), "1AbC_xyz-123");
  assert.equal(artworkThumbnailUrl(url), "https://drive.google.com/thumbnail?id=1AbC_xyz-123&sz=w1000");
  assert.equal(artworkEmbedUrl(url), "https://drive.google.com/file/d/1AbC_xyz-123/preview");
});

test("mantém imagens diretas e rejeita páginas genéricas", () => {
  assert.equal(artworkThumbnailUrl("https://cdn.exemplo.com/arte.png?x=1"), "https://cdn.exemplo.com/arte.png?x=1");
  assert.equal(artworkThumbnailUrl("https://exemplo.com/view"), null);
});
