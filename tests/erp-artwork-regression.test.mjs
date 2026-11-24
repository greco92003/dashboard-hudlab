import assert from "node:assert/strict";
import test from "node:test";
import { extractGhlProductModels } from "../lib/erp/ghl-product-models.ts";
import { artworkEmbedUrl, artworkOpenUrl, artworkThumbnailUrl } from "../lib/erp/artwork-url.ts";
import { artworkImportUrl, verifyArtworkFileIdSignature } from "../lib/erp/artwork-proxy.ts";
import { buildTinyProductFromCloner } from "../lib/erp/tiny-product-cloner.ts";

// Incidente Nilza (24/11/2026): quatro modelos com links lh3, sem extensão.
// Mesma estrutura da ficha real, com IDs e dados do cliente substituídos.
const definitions = [];
const customFields = [];
for (let model = 1; model <= 4; model++) {
  definitions.push(
    {
      id: `art-${model}`,
      name: `Artes Aprovadas Modelo ${model}`,
      fieldKey: `opportunity.artes_aprovadas_modelo_${model}`,
      dataType: "TEXT",
      model: "opportunity",
    },
    {
      id: `grade-${model}`,
      name: `Grade Modelo ${model} Adulto`,
      fieldKey: `opportunity.grade_modelo_${model}${model === 1 ? "" : "_adulto"}`,
      dataType: "TEXTBOX_LIST",
      model: "opportunity",
      picklistOptions: [{ id: `size-${model}`, label: "36/37" }],
    },
  );
  customFields.push(
    {
      id: `art-${model}`,
      fieldValueString: `https://lh3.google.com/u/0/d/art-model-${model}=w1863-h982-iv1?auditContext=${model === 4 ? "forDisplay" : "prefetch"}`,
    },
    { id: `grade-${model}`, fieldValue: { [`size-${model}`]: "12" } },
  );
}

test("regressão Nilza: os quatro modelos têm prévia, link de abertura e anexo JPEG assinado para o Tiny", (t) => {
  const previousSecret = process.env.ERP_ARTWORK_PROXY_SECRET;
  process.env.ERP_ARTWORK_PROXY_SECRET = "segredo-apenas-para-regressao";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.ERP_ARTWORK_PROXY_SECRET;
    else process.env.ERP_ARTWORK_PROXY_SECRET = previousSecret;
  });

  const models = extractGhlProductModels({ id: "pedido-regressao", customFields }, definitions);
  assert.equal(models.length, 4);
  assert.equal(models.reduce((sum, model) => sum + model.totalPairs, 0), 48);

  for (const model of models) {
    const fileId = `art-model-${model.modelNumber}`;
    assert.equal(artworkThumbnailUrl(model.artUrl), `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`);
    assert.equal(artworkEmbedUrl(model.artUrl), `https://drive.google.com/file/d/${fileId}/preview`);
    assert.equal(artworkOpenUrl(model.artUrl), `https://drive.google.com/file/d/${fileId}/view`);

    const importUrl = artworkImportUrl(model.artUrl, "https://erp.example.com");
    assert.ok(importUrl, `Modelo ${model.modelNumber} precisa de imagem para cadastrar`);
    const signed = new URL(importUrl);
    assert.equal(signed.origin, "https://erp.example.com");
    assert.equal(signed.pathname, `/api/erp/artwork/${fileId}.jpg`);
    assert.equal(verifyArtworkFileIdSignature(
      fileId,
      Number(signed.searchParams.get("expires")),
      signed.searchParams.get("signature"),
    ), true);

    const product = buildTinyProductFromCloner({
      cloner: {
        id: 1,
        tipo: "V",
        precos: { preco: 53.8 },
        variacoes: [{ id: 2, grade: [{ chave: "Tamanho", valor: "36/37" }] }],
      },
      title: `Chinelo Modelo ${model.modelNumber}`,
      baseSku: `REGRESSAO-${model.modelNumber}`,
      artwork: { url: importUrl, externo: false },
    });
    assert.deepEqual(product.anexos, [{ url: importUrl, externo: false }]);
  }
});
