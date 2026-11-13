"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minus, Plus, X } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Button } from "@/components/ui/button";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

/**
 * Visualizador de PDF dentro do app (Painel Produção no celular). O leitor do
 * navegador tira o app instalado da tela, sem volta; num iframe o iPhone mostra
 * só a 1ª página e o Android nada. Aqui o pdf.js desenha cada página num canvas,
 * em tela cheia, com zoom e Fechar. Só carrega quando alguém toca em Visualizar.
 *
 * Usa a versão "legacy" do pdf.js (funciona em iPhone e Android mais antigos)
 * e roda o processamento na própria página em vez de um worker à parte: talão
 * e romaneio têm poucas páginas, e assim não há arquivo de worker para servir.
 */
export function VisualizadorPdf({
  arquivo,
  titulo,
  onFechar,
}: {
  arquivo: Blob;
  titulo: string;
  onFechar: () => void;
}) {
  const corpo = useRef<HTMLDivElement>(null);
  const documento = useRef<PDFDocumentProxy | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [zoom, setZoom] = useState(1);

  // Abre o PDF.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
        const dados = new Uint8Array(await arquivo.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: dados }).promise;
        if (cancelado) {
          void doc.destroy();
          return;
        }
        documento.current = doc;
        setPaginas(doc.numPages);
        setEstado("pronto");
      } catch (erro) {
        console.error("Visualizador de PDF:", erro);
        if (!cancelado) setEstado("erro");
      }
    })();
    return () => {
      cancelado = true;
      void documento.current?.destroy();
      documento.current = null;
    };
  }, [arquivo]);

  // Desenha as páginas na largura da tela, vezes o zoom.
  useEffect(() => {
    const doc = documento.current;
    const alvo = corpo.current;
    if (estado !== "pronto" || !doc || !alvo) return;
    const tarefas: RenderTask[] = [];
    let cancelado = false;
    (async () => {
      const largura = Math.max(alvo.clientWidth - 24, 200);
      const nitidez = Math.min(window.devicePixelRatio || 1, 3);
      const telas = alvo.querySelectorAll<HTMLCanvasElement>("canvas[data-pagina]");
      for (let n = 1; n <= doc.numPages && !cancelado; n++) {
        const pagina = await doc.getPage(n);
        if (cancelado) return;
        const escala = (largura / pagina.getViewport({ scale: 1 }).width) * zoom;
        const vista = pagina.getViewport({ scale: escala * nitidez });
        const tela = telas[n - 1];
        const contexto = tela?.getContext("2d");
        if (!tela || !contexto) continue;
        tela.width = Math.floor(vista.width);
        tela.height = Math.floor(vista.height);
        tela.style.width = `${Math.floor(vista.width / nitidez)}px`;
        tela.style.height = `${Math.floor(vista.height / nitidez)}px`;
        const tarefa = pagina.render({ canvasContext: contexto, viewport: vista });
        tarefas.push(tarefa);
        await tarefa.promise.catch(() => undefined);
      }
    })();
    return () => {
      cancelado = true;
      for (const tarefa of tarefas) tarefa.cancel();
    };
  }, [estado, paginas, zoom]);

  // Esc fecha; a página de trás não rola enquanto o PDF está aberto.
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => evento.key === "Escape" && onFechar();
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = rolagem;
      window.removeEventListener("keydown", tecla);
    };
  }, [onFechar]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</p>
        <div className="hud-group" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 0.5))}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Diminuir"
          >
            <Minus />
          </button>
          <span className="hud-group-val">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 0.5))}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Aumentar"
          >
            <Plus />
          </button>
        </div>
        <Button variant="outline" className="h-9" onClick={onFechar}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </div>

      <div ref={corpo} className="min-h-0 flex-1 overflow-auto bg-muted/60 p-3">
        {estado === "carregando" && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Abrindo o documento…
          </p>
        )}
        {estado === "erro" && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Não deu para mostrar o documento aqui. Feche e use Baixar PDF.
          </p>
        )}
        <div className="mx-auto flex w-max flex-col items-center gap-3">
          {Array.from({ length: paginas }, (_, i) => (
            <canvas
              key={i}
              data-pagina={i + 1}
              className="rounded-sm bg-white shadow-md"
              aria-label={`Página ${i + 1} de ${paginas}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
