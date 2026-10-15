// Imagem grande demais para o modelo. Módulo puro.
//
// As imagens do WhatsApp vão para o modelo como chegam ("detail: auto"). Uma
// foto ou arte gigante (~36 megapixels) faz a OpenAI recusar a chamada inteira
// com 400 "...requires N patches... Please resize the image", e a Cami
// passava o cliente para humano por falha técnica. Em vez disso, a chamada é
// refeita com as imagens em baixa resolução, que sempre cabem.

/** A OpenAI recusou por causa do tamanho de uma imagem? */
export function isImageTooLargeError(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown } | null;
  if (!e || e.status !== 400 || typeof e.message !== "string") return false;
  return /image/i.test(e.message) && /patches|resize|too large|exceed/i.test(e.message);
}

/**
 * Cópia da entrada com toda imagem em "detail: low". null quando não há
 * imagem (repetir não adiantaria).
 */
export function withLowDetailImages(input: readonly unknown[]): unknown[] | null {
  let changed = false;
  const lowered = input.map((item) => {
    const content = (item as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) return item;
    const parts = content.map((part) => {
      if ((part as { type?: unknown } | null)?.type !== "input_image") return part;
      changed = true;
      return { ...(part as object), detail: "low" };
    });
    return { ...(item as object), content: parts };
  });
  return changed ? lowered : null;
}
