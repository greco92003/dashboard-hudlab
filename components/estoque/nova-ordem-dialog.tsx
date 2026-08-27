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
import type { SoladoCor, SoladoResumo } from "@/lib/estoque/solados";

type Rascunho = { cor: SoladoCor; numeracao: string; pares: string };

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * A ordem nasce da própria sugestão de compra — é o caminho normal. Os campos
 * ficam editáveis porque quem compra sempre ajusta: arredonda para fechar
 * caminhão, antecipa uma numeração, corta outra.
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
  const [numero, setNumero] = useState("");
  const [previstaPara, setPrevistaPara] = useState("");
  const [emitidaEm, setEmitidaEm] = useState(hoje);

  const carregarSugestao = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/estoque/solados");
      const corpo = (await resposta.json()) as SoladoResumo;
      if (!resposta.ok) throw new Error("Falha ao ler a sugestão.");
      setItens(
        corpo.linhas
          .filter((linha) => (linha.sugestaoCompra ?? 0) > 0)
          .map((linha) => ({
            cor: linha.cor,
            numeracao: linha.numeracao,
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

  const total = itens.reduce((soma, item) => {
    const valor = Number(item.pares);
    return soma + (Number.isFinite(valor) && valor > 0 ? valor : 0);
  }, 0);

  const salvar = async () => {
    const validos = itens.flatMap((item) => {
      const pares = Number(item.pares);
      return Number.isInteger(pares) && pares > 0
        ? [{ cor: item.cor, numeracao: item.numeracao, paresPedidos: pares }]
        : [];
    });
    if (validos.length === 0) {
      toast.error("A ordem precisa de pelo menos um item.");
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch("/api/estoque/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: numero.trim() || null,
          emitidaEm,
          previstaPara: previstaPara || null,
          itens: validos,
        }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha ao criar.");
      toast.success("Ordem de compra criada.");
      setAberto(false);
      setNumero("");
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
            Itens vindos da sugestão de compra. Ajuste o que precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="oc-numero">Número</Label>
            <Input
              id="oc-numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="1908"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-emitida">Emitida em</Label>
            <Input
              id="oc-emitida"
              type="date"
              value={emitidaEm}
              onChange={(e) => setEmitidaEm(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-prevista">Prevista</Label>
            <Input
              id="oc-prevista"
              type="date"
              value={previstaPara}
              onChange={(e) => setPrevistaPara(e.target.value)}
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
                key={`${item.cor}-${item.numeracao}`}
                className="flex items-center gap-3 border-b px-3 py-1.5 last:border-0"
              >
                <span className="flex-1 text-sm">
                  {item.cor} {item.numeracao}
                </span>
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
          <span className="text-sm text-muted-foreground">
            {total} pares
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || total === 0}>
              Criar ordem
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
