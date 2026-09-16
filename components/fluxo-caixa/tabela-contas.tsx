"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dataBr } from "@/components/fluxo-caixa/formatos";
import { formatCurrency } from "@/lib/utils";
import type { ContaComStatus, TipoConta } from "@/lib/fluxo-caixa/regras";

type Filtro = "atrasada" | "a_vencer" | "paga";

export function TabelaContas({
  tipo,
  contas,
  onBaixar,
}: {
  tipo: TipoConta;
  contas: ContaComStatus[];
  onBaixar: (conta: ContaComStatus) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("atrasada");

  const contasDoTipo = useMemo(
    () => contas.filter((c) => c.tipo === tipo),
    [contas, tipo],
  );

  const contagens = useMemo(() => {
    const c = { atrasada: 0, a_vencer: 0, paga: 0 };
    for (const conta of contasDoTipo) {
      if (conta.status === "atrasada") c.atrasada += 1;
      else if (conta.status === "a_vencer") c.a_vencer += 1;
      else if (conta.status === "paga") c.paga += 1;
    }
    return c;
  }, [contasDoTipo]);

  const filtradas = useMemo(() => {
    const lista = contasDoTipo.filter((c) => c.status === filtro);
    if (filtro === "paga") {
      return [...lista].sort((a, b) =>
        (b.data_pagamento ?? b.data_vencimento).localeCompare(
          a.data_pagamento ?? a.data_vencimento,
        ),
      );
    }
    return [...lista].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  }, [contasDoTipo, filtro]);

  const total = useMemo(() => {
    if (filtro === "paga") {
      return filtradas.reduce((soma, c) => soma + c.valor, 0);
    }
    return filtradas.reduce((soma, c) => soma + c.saldo, 0);
  }, [filtradas, filtro]);

  const rotuloPagas = tipo === "receber" ? "Recebidas" : "Pagas";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filtro}
          onValueChange={(v) => {
            if (v) setFiltro(v as Filtro);
          }}
        >
          <ToggleGroupItem value="atrasada">
            Atrasadas ({contagens.atrasada})
          </ToggleGroupItem>
          <ToggleGroupItem value="a_vencer">
            A vencer ({contagens.a_vencer})
          </ToggleGroupItem>
          <ToggleGroupItem value="paga">
            {rotuloPagas} ({contagens.paga})
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              {filtro === "paga" && <TableHead>Pagamento</TableHead>}
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Em aberto</TableHead>
              {filtro !== "paga" && <TableHead>Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={filtro === "paga" ? 5 : 6}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Nenhuma conta
                </TableCell>
              </TableRow>
            )}
            {filtradas.map((conta) => (
              <TableRow key={conta.tiny_id}>
                <TableCell
                  className={conta.status === "atrasada" ? "text-red-600" : undefined}
                >
                  {dataBr(conta.data_vencimento)}
                </TableCell>
                {filtro === "paga" && (
                  <TableCell>{dataBr(conta.data_pagamento)}</TableCell>
                )}
                <TableCell>
                  <div>{conta.historico || "Sem descrição"}</div>
                  {conta.contato_nome && (
                    <div className="text-xs text-muted-foreground">
                      {conta.contato_nome}
                    </div>
                  )}
                </TableCell>
                <TableCell>{conta.categoria_nome ?? "—"}</TableCell>
                <TableCell>{formatCurrency(conta.valor)}</TableCell>
                <TableCell>{formatCurrency(conta.saldo)}</TableCell>
                {filtro !== "paga" && (
                  <TableCell>
                    <Button size="sm" onClick={() => onBaixar(conta)}>
                      Dar baixa
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
