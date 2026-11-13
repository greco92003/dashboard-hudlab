"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileText, Loader2, Package, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardDeal } from "@/lib/programacao/board-types";
import { cn } from "@/lib/utils";

type Documento = "talao" | "romaneio" | "romaneio-sku";

const DOCUMENTOS: Record<Documento, { nome: string; caminho: string }> = {
  talao: { nome: "Talão", caminho: "talao" },
  romaneio: { nome: "Romaneio", caminho: "romaneio" },
  "romaneio-sku": { nome: "Romaneio por SKU", caminho: "romaneio?agrupar=sku" },
};

/**
 * No app instalado (sem barra do navegador) e no celular, abrir o PDF por link
 * levava a uma tela sem volta: o documento (ou a mensagem de erro, em texto puro)
 * tomava a janela do app. Aqui o painel busca o documento primeiro e nunca sai
 * da tela: erro vira aviso, e o PDF pronto abre num diálogo com
 * "Imprimir ou compartilhar" (menu do sistema) e "Baixar".
 */
function telaDeToque(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

async function mensagemDeErro(resposta: Response): Promise<string> {
  const texto = (await resposta.text().catch(() => "")).trim();
  // A rota responde texto puro; se vier HTML (erro do servidor), não mostra.
  if (texto && !texto.startsWith("<") && texto.length < 400) return texto;
  return resposta.status === 404
    ? "Documento não encontrado."
    : "Não foi possível gerar o documento. Tente de novo em instantes.";
}

export function DocumentosPedido({ deal, grande = false }: { deal: BoardDeal; grande?: boolean }) {
  const [gerando, setGerando] = useState<Documento | null>(null);
  const [pronto, setPronto] = useState<{ nome: string; arquivo: File; url: string } | null>(null);

  // Solta o PDF da memória quando o diálogo fecha.
  useEffect(() => {
    if (!pronto) return;
    const url = pronto.url;
    return () => URL.revokeObjectURL(url);
  }, [pronto]);

  const abrir = async (documento: Documento) => {
    const { nome, caminho } = DOCUMENTOS[documento];
    const endereco = `/api/producao/documentos/${encodeURIComponent(deal.id)}/${caminho}`;
    const toque = telaDeToque();
    // No computador a aba nova abre já no clique (senão o bloqueador de pop-up
    // barra) e recebe o PDF quando ele fica pronto.
    const janela = toque ? null : window.open("", "_blank");
    janela?.document.write(
      `<p style="font-family:system-ui,sans-serif;padding:24px;color:#555">Gerando o ${nome.toLowerCase()}…</p>`,
    );
    setGerando(documento);
    try {
      const resposta = await fetch(endereco, { cache: "no-store" });
      const tipo = resposta.headers.get("content-type") ?? "";
      if (!resposta.ok || !tipo.includes("pdf")) {
        janela?.close();
        toast.error(await mensagemDeErro(resposta));
        return;
      }
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      if (janela) {
        janela.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      const arquivo = new File([blob], `${nome} - ${deal.title}.pdf`.replace(/[\\/:*?"<>|]/g, "-"), {
        type: "application/pdf",
      });
      setPronto({ nome, arquivo, url });
    } catch {
      janela?.close();
      toast.error("Sem conexão com o servidor. Confira a internet e tente de novo.");
    } finally {
      setGerando(null);
    }
  };

  const compartilhar = async () => {
    if (!pronto) return;
    try {
      await navigator.share({ files: [pronto.arquivo], title: pronto.arquivo.name });
    } catch (erro) {
      // Fechar o menu do sistema não é erro.
      if (erro instanceof DOMException && erro.name === "AbortError") return;
      toast.error("Não deu para abrir o menu de compartilhar. Use Baixar PDF.");
    }
  };
  const podeCompartilhar =
    pronto !== null &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [pronto.arquivo] });

  const altura = grande ? "h-12 text-base" : "h-11 text-sm";
  const icone = (documento: Documento, Icone: typeof FileText) =>
    gerando === documento ? <Loader2 className="animate-spin" /> : <Icone />;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className={cn("w-full", altura)}
          disabled={gerando !== null}
          onClick={() => void abrir("talao")}
        >
          {icone("talao", FileText)}
          Talão
        </Button>
        <div className="flex min-w-0">
          <Button
            variant="outline"
            className={cn("min-w-0 flex-1 rounded-r-none", altura)}
            disabled={gerando !== null}
            onClick={() => void abrir("romaneio")}
          >
            {icone("romaneio", Package)}
            Romaneio
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn("shrink-0 rounded-l-none border-l-0 px-2", altura)}
                disabled={gerando !== null}
                aria-label="Outros tipos de romaneio"
                title="Outros tipos de romaneio"
              >
                {gerando === "romaneio-sku" ? <Loader2 className="animate-spin" /> : <ChevronDown />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void abrir("romaneio")}>
                <Package /> Romaneio padrão
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void abrir("romaneio-sku")}>
                <Package /> Romaneio por SKU (1 modelo por caixa)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={pronto !== null} onOpenChange={(aberto) => !aberto && setPronto(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{pronto?.nome} pronto</DialogTitle>
            <DialogDescription>{deal.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {podeCompartilhar && (
              <Button className="hud-btn-accent h-12 text-base" onClick={() => void compartilhar()}>
                <Share2 className="h-5 w-5" />
                Imprimir ou compartilhar
              </Button>
            )}
            {pronto && (
              <Button asChild variant="outline" className="h-12 text-base">
                <a href={pronto.url} download={pronto.arquivo.name}>
                  <Download className="h-5 w-5" />
                  Baixar PDF
                </a>
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPronto(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
