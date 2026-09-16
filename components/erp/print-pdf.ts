"use client";

let frame: HTMLIFrameElement | null = null;
let frameUrl: string | null = null;

function cleanup() {
  frame?.remove();
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frame = null;
  frameUrl = null;
}

/**
 * Carrega o PDF num iframe invisível e abre a janela de impressão direto,
 * sem aba nova. O iframe fica vivo até a próxima impressão: removê-lo com a
 * janela aberta cancela a impressão em alguns navegadores.
 */
export async function printPdf(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const message = (await response.text().catch(() => "")).trim();
    throw new Error(message.slice(0, 300) || "Não foi possível gerar o PDF.");
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  cleanup();

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    iframe.onload = () => {
      // O visualizador de PDF precisa de um instante para montar antes do print.
      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        } catch {
          // Navegador sem suporte a imprimir PDF em iframe: abre numa aba.
          window.open(blobUrl, "_blank", "noopener");
          resolve();
        }
      }, 400);
    };
    iframe.onerror = () => reject(new Error("Não foi possível abrir o PDF para impressão."));
    iframe.src = blobUrl;
    frame = iframe;
    frameUrl = blobUrl;
    document.body.appendChild(iframe);
  });
}
