"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertCircle, Clock, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TabelaSolados } from "@/components/estoque/tabela-solados";
import type { SoladoResumo } from "@/lib/estoque/solados";

type Resposta = SoladoResumo & { lidoEm: string };

const formatarHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function EstoquePage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/estoque/solados${forcar ? "?refresh=1" : ""}`,
      );
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Falha na leitura.");
      setDados(corpo as Resposta);
      if (forcar) toast.success("Estoque atualizado.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na leitura.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porCor = useMemo(() => {
    if (!dados) return [];
    return ["Preto", "Branco"].map((cor) => ({
      cor,
      linhas: dados.linhas.filter((linha) => linha.cor === cor),
    }));
  }, [dados]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Package className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Estoque de Solados</h1>
        <div className="ml-auto flex items-center gap-3">
          {dados && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatarHora(dados.lidoEm)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar(true)}
            disabled={carregando}
          >
            <RefreshCw
              className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Pares vendidos e ainda não faturados — o Tiny só baixa o solado no
        faturamento, então tudo isso ainda está no saldo dele. Um par consome um
        solado.
      </p>

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {carregando && !dados && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      )}

      {dados && (
        <>
          {dados.paresSemSolado > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {dados.paresSemSolado} pares estão em pedidos sem a cor do
                solado preenchida no GHL e ficaram de fora da conta.
              </AlertDescription>
            </Alert>
          )}

          {dados.linhas.some((linha) => linha.saldoNegativo) && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {dados.linhas.filter((l) => l.saldoNegativo).length} numerações
                estão com saldo negativo no Tiny: solado já vendido e faturado
                que não existe. Entra inteiro na sugestão de compra.
              </AlertDescription>
            </Alert>
          )}

          {dados.legadosForaDaConta > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {dados.legadosForaDaConta} pedidos anteriores a 27/08 estão fora
                da conta: o solado deles já foi baixado no cadastro do ERP e não
                será baixado de novo no faturamento. Some sozinho conforme forem
                faturados — quando este aviso desaparecer, a regra temporária no
                código pode ser removida.
              </AlertDescription>
            </Alert>
          )}

          {dados.skusNaoEncontrados.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Sem produto correspondente no Tiny:{" "}
                {dados.skusNaoEncontrados.join(", ")}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {porCor.map(({ cor, linhas }) => (
              <TabelaSolados key={cor} cor={cor} linhas={linhas} />
            ))}
          </div>

        </>
      )}
    </div>
  );
}
