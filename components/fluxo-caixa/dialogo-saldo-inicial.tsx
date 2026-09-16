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
import { lerValor } from "@/components/fluxo-caixa/formatos";
import type { SaldoInicial } from "@/lib/fluxo-caixa/regras";

export function DialogoSaldoInicial({
  aberto,
  saldo,
  hoje,
  onFechar,
  onConcluido,
}: {
  aberto: boolean;
  saldo: SaldoInicial | null;
  hoje: string;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const [valor, setValor] = useState("0");
  const [data, setData] = useState(hoje);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setValor(String(saldo?.valor ?? 0));
      setData(saldo?.data ?? hoje);
    }
  }, [aberto, saldo, hoje]);

  async function confirmar() {
    setEnviando(true);
    try {
      const res = await fetch("/api/fluxo-caixa/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: lerValor(valor), data }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível salvar o saldo inicial.");
        return;
      }
      toast.success("Saldo inicial salvo");
      onConcluido();
    } catch {
      toast.error("Não foi possível salvar o saldo inicial.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saldo inicial</DialogTitle>
          <DialogDescription>
            Saldo das contas no começo do dia informado. Será substituído pelo saldo do
            Sicredi quando o banco for conectado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="saldo-valor">Valor</Label>
            <Input id="saldo-valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="saldo-data">Data</Label>
            <Input
              id="saldo-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
