"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataBr, lerValor } from "@/components/fluxo-caixa/formatos";
import { formatCurrency } from "@/lib/utils";
import type { ContaComStatus } from "@/lib/fluxo-caixa/regras";

export type OpcoesFluxo = {
  categorias: { id: number; descricao: string; grupo?: string | null }[];
  contasFinanceiras: { id: number; descricao: string; grupo?: string | null }[];
};

export function DialogoBaixa({
  conta,
  hoje,
  opcoes,
  onFechar,
  onConcluido,
}: {
  conta: ContaComStatus | null;
  hoje: string;
  opcoes: OpcoesFluxo | null;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const [data, setData] = useState(hoje);
  const [valorPago, setValorPago] = useState("");
  const [contaFinanceiraId, setContaFinanceiraId] = useState<string | undefined>(undefined);
  const [juros, setJuros] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (conta) {
      setData(hoje);
      setValorPago(conta.saldo.toFixed(2));
      setContaFinanceiraId(undefined);
      setJuros("0");
      setDesconto("0");
    }
  }, [conta, hoje]);

  if (!conta) return null;

  async function confirmar() {
    if (!conta) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/fluxo-caixa/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: conta.tipo,
          tinyId: conta.tiny_id,
          data,
          valorPago: lerValor(valorPago),
          contaFinanceiraId: contaFinanceiraId ? Number(contaFinanceiraId) : undefined,
          juros: lerValor(juros),
          desconto: lerValor(desconto),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível registrar a baixa.");
        return;
      }
      toast.success("Baixa registrada no Tiny");
      if (json.aviso) toast.info(json.aviso);
      onConcluido();
    } catch {
      toast.error("Não foi possível registrar a baixa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={conta !== null} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
          <DialogDescription>
            {conta.historico || "Sem descrição"}
            {conta.contato_nome ? ` — ${conta.contato_nome}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>Vencimento: {dataBr(conta.data_vencimento)}</p>
          <p>Saldo em aberto: {formatCurrency(conta.saldo)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="baixa-data">Data</Label>
            <Input
              id="baixa-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baixa-valor">Valor pago</Label>
            <Input
              id="baixa-valor"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Conta financeira</Label>
            <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={opcoes === null ? "Carregando…" : "Selecione (opcional)"}
                />
              </SelectTrigger>
              <SelectContent>
                {opcoes?.contasFinanceiras.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baixa-juros">Juros</Label>
            <Input
              id="baixa-juros"
              value={juros}
              onChange={(e) => setJuros(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baixa-desconto">Desconto</Label>
            <Input
              id="baixa-desconto"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
