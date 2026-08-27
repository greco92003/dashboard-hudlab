"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { SoladoResumo } from "@/lib/estoque/solados";

/** Preços da OC 1908 do INPU. Editáveis porque tabela de preço muda. */
const PRECO_ADULTO = "12.60";
const PRECO_INFANTIL = "9.63";

type Rascunho = {
  produtoId: number;
  rotulo: string;
  infantil: boolean;
  pares: string;
};

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A ordem nasce da sugestão de compra e é criada direto no Tiny. Os campos
 * ficam editáveis porque quem compra sempre ajusta: arredonda para fechar
 * carga, antecipa uma numeração, corta outra.
 */
export function NovaOrdemDialog({
  children,
  onCriada,
}: {
  children: ReactNode;
  onCriada: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<Rascunho[]>([]);
  const [previstaPara, setPrevistaPara] = useState("");
  const [precoAdulto, setPrecoAdulto] = useState(PRECO_ADULTO);
  const [precoInfantil, setPrecoInfantil] = useState(PRECO_INFANTIL);

  const carregarSugestao = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/estoque/solados");
      const corpo = (await resposta.json()) as SoladoResumo;
      if (!resposta.ok) throw new Error();
      setItens(
        corpo.linhas
          .filter(
            (linha) => (linha.sugestaoCompra ?? 0) > 0 && linha.produtoId,
          )
          .map((linha) => ({
            produtoId: linha.produtoId!,
            rotulo: `${linha.cor} ${linha.numeracao}`,
            infantil: linha.publico === "infantil",
            pares: String(linha.sugestaoCompra),
          })),
      );
    } catch {
      toast.error("Não foi possível carregar a sugestão de compra.");
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (aberto) void carregarSugestao();
  }, [aberto, carregarSugestao]);

  const preco = (infantil: boolean) =>
    Number((infantil ? precoInfantil : precoAdulto).replace(",", ".")) || 0;

  const validos = itens.flatMap((item) => {
    const pares = Number(item.pares);
    return Number.isInteger(pares) && pares > 0
      ? [{ ...item, paresNum: pares, valor: preco(item.infantil) }]
      : [];
  });
  const totalPares = validos.reduce((s, i) => s + i.paresNum, 0);
  const totalReais = validos.reduce((s, i) => s + i.paresNum * i.valor, 0);

  const salvar = async () => {
    if (validos.length === 0) {
      toast.error("A ordem precisa de pelo menos um item.");
      return;
    }
    const resumo =
      `Criar ordem de compra no Tiny para o INPU?\n\n` +
      `${validos.length} itens · ${totalPares} pares · ${brl(totalReais)}` +
      (previstaPara
        ? `\nPrevisão: ${new Date(`${previstaPara}T12:00:00`).toLocaleDateString("pt-BR")}`
        : "");
    if (!confirm(resumo)) return;

    setSalvando(true);
    try {
      const resposta = await fetch("/api/estoque/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataPrevista: previstaPara || null,
          observacoes: "Gerada pelo dashboard a partir da sugestão de compra.",
          itens: validos.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.paresNum,
            valor: item.valor,
          })),
        }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha ao criar.");
      toast.success("Ordem de compra criada no Tiny.");
      setAberto(false);
      setPrevistaPara("");
      onCriada();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova ordem de compra</DialogTitle>
          <DialogDescription>
            Vai direto para o Tiny, no INPU. Itens vindos da sugestão de compra.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="oc-prevista">Previsão de chegada</Label>
            <Input
              id="oc-prevista"
              type="date"
              value={previstaPara}
              onChange={(e) => setPrevistaPara(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-preco-a">Preço adulto</Label>
            <Input
              id="oc-preco-a"
              value={precoAdulto}
              onChange={(e) => setPrecoAdulto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-preco-i">Preço infantil</Label>
            <Input
              id="oc-preco-i"
              value={precoInfantil}
              onChange={(e) => setPrecoInfantil(e.target.value)}
            />
          </div>
        </div>

        {carregando ? (
          <Skeleton className="h-40" />
        ) : itens.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            A sugestão de compra está zerada. Nada a pedir agora.
          </p>
        ) : (
          <div className="rounded-md border">
            {itens.map((item, indice) => (
              <div
                key={item.produtoId}
                className="flex items-center gap-3 border-b px-3 py-1.5 last:border-0"
              >
                <span className="flex-1 text-sm">{item.rotulo}</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-24 text-right tabular-nums"
                  value={item.pares}
                  onChange={(e) =>
                    setItens((atual) =>
                      atual.map((it, i) =>
                        i === indice ? { ...it, pares: e.target.value } : it,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            {totalPares} pares · {brl(totalReais)}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || totalPares === 0}>
              Criar no Tiny
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
