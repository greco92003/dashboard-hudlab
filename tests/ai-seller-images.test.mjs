import test from "node:test";
import assert from "node:assert/strict";
import { isImageTooLargeError, withLowDetailImages } from "../lib/ghl/ai-seller/images.ts";

test("reconhece a recusa da OpenAI por imagem grande demais", () => {
  // Mensagem real de 15/10 (cliente Hiagu).
  const real = {
    status: 400,
    message:
      "400 The image you provided requires 35344 patches after processing, exceeding the limit of 30000. Please resize the image and try again.",
  };
  assert.equal(isImageTooLargeError(real), true);
  assert.equal(isImageTooLargeError({ status: 429, message: "image too large" }), false);
  assert.equal(isImageTooLargeError({ status: 400, message: "Invalid tool schema" }), false);
  assert.equal(isImageTooLargeError(new Error("timeout")), false);
  assert.equal(isImageTooLargeError(null), false);
});

test("refaz a entrada com as imagens em baixa resolução, sem mexer no resto", () => {
  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Contexto" },
        { type: "input_image", image_url: "data:image/png;base64,AAA", detail: "auto" },
      ],
    },
    { type: "function_call_output", call_id: "c1", output: "{}" },
  ];
  const lowered = withLowDetailImages(input);
  assert.equal(lowered[0].content[1].detail, "low");
  assert.equal(lowered[0].content[1].image_url, "data:image/png;base64,AAA");
  assert.deepEqual(lowered[0].content[0], input[0].content[0]);
  assert.deepEqual(lowered[1], input[1]);
  // A entrada original não muda (o loop reaproveita).
  assert.equal(input[0].content[1].detail, "auto");
});

test("sem imagem na entrada não há o que refazer", () => {
  assert.equal(withLowDetailImages([{ role: "user", content: [{ type: "input_text", text: "oi" }] }]), null);
  assert.equal(withLowDetailImages([]), null);
});
