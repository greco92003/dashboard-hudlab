"use client";

import { useEffect, useRef, useState } from "react";
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
import { lerValor } from "@/components/fluxo-caixa/formatos";
import type { OpcoesFluxo } from "@/components/fluxo-caixa/dialogo-baixa";

type Contato = { id: number; nome: string; cpfCnpj: string | null };
type Ocorrencia = "U" | "M" | "P";

function estadoInicial(hoje: string) {
  return {
    historico: "",
    contatoQuery: "",
    contato: null as Contato | null,
    categoriaId: undefined as string | undefined,
    dataVencimento: hoje,
    valor: "",
    ocorrencia: "U" as Ocorrencia,
    quantidadeParcelas: "2",
    numeroDocumento: "",
  };
}

export function DialogoNovaSaida({
  aberto,
  hoje,
  opcoes,
  onFechar,
  onConcluido,
}: {
  aberto: boolean;
  hoje: string;
  opcoes: OpcoesFluxo | null;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const [form, setForm] = useState(() => estadoInicial(hoje));
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [buscandoContatos, setBuscandoContatos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (aberto) setForm(estadoInicial(hoje));
  }, [aberto, hoje]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (form.contato || form.contatoQuery.trim().length < 2) {
      setContatos([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoContatos(true);
      try {
        const res = await fetch(
          `/api/fluxo-caixa/contatos?q=${encodeURIComponent(form.contatoQuery.trim())}`,
        );
        const json = await res.json();
        setContatos(json.contatos ?? []);
      } catch {
        setContatos([]);
      } finally {
        setBuscandoContatos(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.contatoQuery, form.contato]);

  async function confirmar() {
    if (!form.historico.trim()) {
      toast.error("Informe a descrição.");
      return;
    }
    if (!form.contato) {
      toast.error("Selecione o fornecedor.");
      return;
    }
    const valor = lerValor(form.valor);
    if (valor <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (form.ocorrencia === "P" && Number(form.quantidadeParcelas) < 2) {
      toast.error("Informe a quantidade de parcelas.");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/fluxo-caixa/contas-pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historico: form.historico.trim(),
          contatoId: form.contato.id,
          categoriaId: form.categoriaId ? Number(form.categoriaId) : undefined,
          dataVencimento: form.dataVencimento,
          valor,
          numeroDocumento: form.numeroDocumento.trim() || undefined,
          ocorrencia: form.ocorrencia,
          quantidadeParcelas:
            form.ocorrencia === "P" ? Number(form.quantidadeParcelas) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível lançar a saída.");
        return;
      }
      toast.success("Saída lançada no Tiny");
      if (json.aviso) toast.info(json.aviso);
      setForm(estadoInicial(hoje));
      onConcluido();
    } catch {
      toast.error("Não foi possível lançar a saída.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova saída</DialogTitle>
          <DialogDescription>Lança uma conta a pagar no Tiny.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="saida-historico">Descrição</Label>
            <Input
              id="saida-historico"
              value={form.historico}
              onChange={(e) => setForm((f) => ({ ...f, historico: e.target.value }))}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Fornecedor</Label>
            {form.contato ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{form.contato.nome}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, contato: null, contatoQuery: "" }))}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Buscar fornecedor…"
                  value={form.contatoQuery}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contatoQuery: e.target.value }))
                  }
                />
                {form.contatoQuery.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                    {buscandoContatos && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Buscando…
                      </div>
                    )}
                    {!buscandoContatos && contatos.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum contato encontrado
                      </div>
                    )}
                    {contatos.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() =>
                          setForm((f) => ({ ...f, contato: c, contatoQuery: "" }))
                        }
                      >
                        {c.nome}
                        {c.cpfCnpj && (
                          <span className="text-muted-foreground"> — {c.cpfCnpj}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={form.categoriaId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoriaId: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={opcoes === null ? "Carregando…" : "Selecione (opcional)"}
                />
              </SelectTrigger>
              <SelectContent>
                {opcoes?.categorias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.grupo ? `${c.grupo} — ${c.descricao}` : c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="saida-vencimento">Vencimento</Label>
            <Input
              id="saida-vencimento"
              type="date"
              value={form.dataVencimento}
              onChange={(e) =>
                setForm((f) => ({ ...f, dataVencimento: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="saida-valor">Valor</Label>
            <Input
              id="saida-valor"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recorrência</Label>
            <Select
              value={form.ocorrencia}
              onValueChange={(v) => setForm((f) => ({ ...f, ocorrencia: v as Ocorrencia }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="U">Única</SelectItem>
                <SelectItem value="M">Mensal</SelectItem>
                <SelectItem value="P">Parcelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.ocorrencia === "P" && (
            <div className="space-y-1.5">
              <Label htmlFor="saida-parcelas">Quantidade de parcelas</Label>
              <Input
                id="saida-parcelas"
                type="number"
                min={2}
                value={form.quantidadeParcelas}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantidadeParcelas: e.target.value }))
                }
              />
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="saida-documento">Nº documento</Label>
            <Input
              id="saida-documento"
              value={form.numeroDocumento}
              onChange={(e) =>
                setForm((f) => ({ ...f, numeroDocumento: e.target.value }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando}>
            Lançar saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
