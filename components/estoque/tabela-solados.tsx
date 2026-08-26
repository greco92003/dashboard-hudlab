"use client";

import { Badge } from "@/components/ui/badge";
import type { SoladoLinha } from "@/lib/estoque/solados";

function Numero({
  valor,
  destacarNegativo = false,
}: {
  valor: number | null;
  destacarNegativo?: boolean;
}) {
  if (valor === null) return <span className="text-muted-foreground">—</span>;
  const negativo = destacarNegativo && valor < 0;
  return (
    <span className={negativo ? "font-semibold text-destructive" : "tabular-nums"}>
      {valor}
    </span>
  );
}

export function TabelaSolados({
  cor,
  linhas,
}: {
  cor: string;
  linhas: SoladoLinha[];
}) {
  const totalNecessidade = linhas.reduce((t, l) => t + l.necessidade, 0);
  const totalCompra = linhas.reduce((t, l) => t + (l.sugestaoCompra ?? 0), 0);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Solado {cor}</h2>
        {totalCompra > 0 && (
          <Badge variant="destructive">Comprar {totalCompra} pares</Badge>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Numeração</th>
              <th className="px-4 py-2 text-right font-medium">Saldo Tiny</th>
              <th className="px-4 py-2 text-right font-medium">Necessidade</th>
              <th className="px-4 py-2 text-right font-medium">Projetado</th>
              <th className="px-4 py-2 text-right font-medium">Mínimo</th>
              <th className="px-4 py-2 text-right font-medium">Comprar</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr
                key={`${linha.cor}-${linha.numeracao}`}
                className="border-b last:border-0"
              >
                <td className="px-4 py-2">
                  {linha.numeracao}
                  {linha.publico === "infantil" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      infantil
                    </span>
                  )}
                </td>
                <td
                  className="px-4 py-2 text-right"
                  title={
                    linha.saldoNegativo
                      ? "Saldo negativo: solado já faturado que não existe. Entra inteiro na sugestão de compra."
                      : undefined
                  }
                >
                  <Numero valor={linha.saldo} destacarNegativo />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {linha.necessidade || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Numero valor={linha.projetado} destacarNegativo />
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                  {linha.minimo ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {linha.sugestaoCompra ? (
                    <span className="font-semibold">{linha.sugestaoCompra}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-medium">
              <td className="px-4 py-2">Total</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">
                {totalNecessidade}
              </td>
              <td colSpan={2} />
              <td className="px-4 py-2 text-right tabular-nums">
                {totalCompra}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
