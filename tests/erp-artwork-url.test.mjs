import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkEmbedUrl,
  artworkFileIdFromPathSegment,
  artworkOpenUrl,
  artworkProxyPath,
  artworkThumbnailUrl,
  googleDriveFileId,
} from "../lib/erp/artwork-url.ts";

test("converte link /view do Google Drive em miniatura renderizável", () => {
  const url = "https://drive.google.com/file/d/1AbC_xyz-123/view?usp=drive_link";
  assert.equal(googleDriveFileId(url), "1AbC_xyz-123");
  assert.equal(artworkThumbnailUrl(url), "https://drive.google.com/thumbnail?id=1AbC_xyz-123&sz=w1000");
  assert.equal(artworkEmbedUrl(url), "https://drive.google.com/file/d/1AbC_xyz-123/preview");
});

test("regressão Nilza: reconhece o link lh3 copiado da visualização do Google Drive", () => {
  const url = "https://lh3.google.com/u/0/d/drive-file-123=w1863-h982-iv1?auditContext=prefetch";
  assert.equal(googleDriveFileId(url), "drive-file-123");
  assert.equal(artworkThumbnailUrl(url), "https://drive.google.com/thumbnail?id=drive-file-123&sz=w1000");
  assert.equal(artworkEmbedUrl(url), "https://drive.google.com/file/d/drive-file-123/preview");
  assert.equal(artworkOpenUrl(url), "https://drive.google.com/file/d/drive-file-123/view");
});

test("reconhece variações do link de imagem do Drive sem incluir dimensões no ID", () => {
  for (const url of [
    "https://lh3.google.com/u/1/d/drive-file-123=w1863-h982-iv1?auditContext=forDisplay",
    "https://lh3.googleusercontent.com/d/drive-file-123=w1600",
    "https://lh4.googleusercontent.com/u/0/d/drive-file-123",
    "https://drive.google.com/open?id=drive-file-123",
    "https://drive.google.com/uc?export=view&id=drive-file-123",
  ]) {
    assert.equal(googleDriveFileId(url), "drive-file-123", url);
    assert.equal(artworkOpenUrl(url), "https://drive.google.com/file/d/drive-file-123/view", url);
  }
});

test("não confunde outros hosts ou imagens do Google com arquivos do Drive", () => {
  for (const url of [
    "https://lh3.google.com.example.com/u/0/d/drive-file-123=w1600",
    "https://example.com/u/0/d/drive-file-123",
    "https://lh3.googleusercontent.com/a/avatar=w1600",
    "https://lh3.google.com/u/0/d/",
    "https://lh3.google.com/u/0/d/=w1600",
    "link inválido",
  ]) {
    assert.equal(googleDriveFileId(url), null, url);
    assert.equal(artworkThumbnailUrl(url), null, url);
    assert.equal(artworkEmbedUrl(url), null, url);
  }
});

test("mantém imagens diretas e rejeita páginas genéricas", () => {
  assert.equal(artworkThumbnailUrl("https://cdn.exemplo.com/arte.png?x=1"), "https://cdn.exemplo.com/arte.png?x=1");
  assert.equal(artworkOpenUrl("https://cdn.exemplo.com/arte.png?x=1"), "https://cdn.exemplo.com/arte.png?x=1");
  assert.equal(artworkOpenUrl("https://exemplo.com/view"), "https://exemplo.com/view");
  assert.equal(artworkThumbnailUrl("https://exemplo.com/view"), null);
});

test("gera caminho JPEG para o Tiny sem alterar o ID do Drive", () => {
  assert.equal(
    artworkProxyPath("drive-file-123"),
    "/api/erp/artwork/drive-file-123.jpg",
  );
  assert.equal(
    artworkFileIdFromPathSegment("drive-file-123.jpg"),
    "drive-file-123",
  );
});
