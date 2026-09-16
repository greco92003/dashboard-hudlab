"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { ResumoFluxo } from "@/lib/fluxo-caixa/regras";

function CartaoBase({
  titulo,
  valor,
  detalhe,
  carregando,
  className,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  carregando: boolean;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <>
            <p className={`text-xl font-semibold ${className ?? ""}`}>{valor}</p>
            {detalhe && (
              <p className="text-xs text-muted-foreground mt-1">{detalhe}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CartoesFluxo({
  resumo,
  carregando,
}: {
  resumo: ResumoFluxo | null;
  carregando: boolean;
}) {
  const carregandoSemDados = carregando && !resumo;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <CartaoBase
        titulo="Saldo no início"
        valor={resumo ? formatCurrency(resumo.saldoInicioPeriodo) : "—"}
        carregando={carregandoSemDados}
      />
      <CartaoBase
        titulo="Entradas no período"
        valor={resumo ? formatCurrency(resumo.entradas) : "—"}
        carregando={carregandoSemDados}
        className="text-green-600"
      />
      <CartaoBase
        titulo="Saídas no período"
        valor={resumo ? formatCurrency(Math.abs(resumo.saidas)) : "—"}
        carregando={carregandoSemDados}
        className="text-red-600"
      />
      <CartaoBase
        titulo="Fechamento projetado"
        valor={resumo ? formatCurrency(resumo.fechamentoFinal) : "—"}
        carregando={carregandoSemDados}
        className={resumo && resumo.fechamentoFinal < 0 ? "text-red-600" : "text-blue-600"}
      />
      <CartaoBase
        titulo="Atrasadas a pagar"
        valor={resumo ? formatCurrency(resumo.atrasadasPagar.valor) : "—"}
        detalhe={resumo ? `${resumo.atrasadasPagar.quantidade} contas` : undefined}
        carregando={carregandoSemDados}
      />
      <CartaoBase
        titulo="Atrasadas a receber"
        valor={resumo ? formatCurrency(resumo.atrasadasReceber.valor) : "—"}
        detalhe={resumo ? `${resumo.atrasadasReceber.quantidade} contas` : undefined}
        carregando={carregandoSemDados}
        className="text-amber-600"
      />
    </div>
  );
}
