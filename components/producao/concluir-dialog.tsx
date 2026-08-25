"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CalendarOff, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import type { BoardDeal } from "@/lib/programacao/board-types";

type Modo = "carregando" | "cadastrar" | "confirmar";

/**
 * Concluir um pedido no chão de fábrica.
 *
 * O login já diz quem é a pessoa. O PIN, pedido aqui, é a assinatura: impede
 * que um celular destravado no bolso marque produção e é o que fica registrado
 * em quem deu o pedido como pronto.
 */
export function ConcluirDialog({
  deal,
  open,
  onOpenChange,
  onConcluido,
}: {
  deal: BoardDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluido: () => void;
}) {
  const [modo, setModo] = useState<Modo>("carregando");
  const [pin, setPin] = useState("");
  const [pinConfirmacao, setPinConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setPinConfirmacao("");
    setErro(null);
    setModo("carregando");

    fetch("/api/producao/pin")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setModo(data.temPin ? "confirmar" : "cadastrar"))
      .catch(() => {
        setErro("Não consegui verificar seu PIN. Tente de novo.");
        setModo("confirmar");
      });
  }, [open]);

  const soNumeros = (valor: string) => valor.replace(/\D/g, "").slice(0, 4);

  const cadastrarPin = async () => {
    setErro(null);
    if (pin.length !== 4) return setErro("O PIN precisa ter 4 números.");
    if (pin !== pinConfirmacao) return setErro("Os dois PINs não são iguais.");

    setEnviando(true);
    try {
      const res = await fetch("/api/producao/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || "Não consegui salvar o PIN.");
        return;
      }
      toast.success("PIN criado. Agora é só confirmar.");
      setPinConfirmacao("");
      setModo("confirmar");
    } catch {
      setErro("Erro de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const concluir = async () => {
    if (!deal) return;
    setErro(null);
    if (pin.length !== 4) return setErro("Digite os 4 números do seu PIN.");

    setEnviando(true);
    try {
      const res = await fetch("/api/producao/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal.id, pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Não consegui concluir o pedido.");
        // O board estava velho: alguém já mexeu no pedido no CRM.
        if (data.desatualizado) onConcluido();
        return;
      }

      toast.success(`${deal.title} foi para a Expedição.`);
      onOpenChange(false);
      onConcluido();
    } catch {
      setErro("Erro de conexão. O pedido NÃO foi concluído.");
    } finally {
      setEnviando(false);
    }
  };

  const campoPin = (
    valor: string,
    aoMudar: (v: string) => void,
    rotulo: string,
    autoFoco = false,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-muted-foreground">{rotulo}</label>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFoco}
        value={valor}
        onChange={(e) => aoMudar(soNumeros(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !enviando) {
            if (modo === "cadastrar") cadastrarPin();
            else concluir();
          }
        }}
        placeholder="••••"
        className="h-16 text-center text-3xl tracking-[0.5em]"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {modo === "cadastrar" ? "Crie seu PIN" : "Concluir pedido"}
          </DialogTitle>
          <DialogDescription>
            {modo === "cadastrar"
              ? "Um PIN de 4 números, só seu. Ele fica registrado em cada pedido que você concluir."
              : "O pedido sai da Programação e vai para a Expedição."}
          </DialogDescription>
        </DialogHeader>

        {deal && modo !== "cadastrar" && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="font-semibold">{deal.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {deal.stageTitle}
              {deal.quantidadePares ? ` · ${deal.quantidadePares} pares` : ""}
            </p>
          </div>
        )}

        {modo === "carregando" ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando...
          </div>
        ) : modo === "cadastrar" ? (
          <div className="flex flex-col gap-4">
            {campoPin(pin, setPin, "Seu PIN", true)}
            {campoPin(pinConfirmacao, setPinConfirmacao, "Repita o PIN")}
          </div>
        ) : (
          campoPin(pin, setPin, "Seu PIN", true)
        )}

        {deal && modo === "confirmar" && !deal.dataEmbarque && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <CalendarOff className="h-4 w-4" />
            <AlertDescription>
              Este pedido está <strong>sem data de embarque</strong> — ele nunca
              entrou no planejamento por dia. Dá para concluir mesmo assim, mas
              vale avisar o comercial.
            </AlertDescription>
          </Alert>
        )}

        {erro && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            onClick={modo === "cadastrar" ? cadastrarPin : concluir}
            disabled={enviando || modo === "carregando"}
            className="min-w-36"
          >
            {enviando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 h-4 w-4" />
            )}
            {modo === "cadastrar" ? "Salvar PIN" : "Concluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
