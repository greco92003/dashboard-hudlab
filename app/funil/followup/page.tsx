"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Info,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FollowUpDegrau {
  rotulo: string;
  degrau: number;
  versao: number;
  receberam: number;
  destravaram: number;
  taxa: number | null;
  vendas: number | null;
  faturamento: number | null;
  valorEmNegociacao: number | null;
}

interface FollowUpReguaResponse {
  atendimento: FollowUpDegrau[];
  negociacao: FollowUpDegrau[];
  meta: { geradoEm: string; aguardandoPrimeiraObservacao: boolean };
}

const inteiro = new Intl.NumberFormat("pt-BR");
const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function fmtTaxa(taxa: number | null) {
  return taxa === null ? "—" : `${taxa.toFixed(1).replace(".", ",")}%`;
}

function fmtMoeda(valor: number | null) {
  return valor === null ? "—" : moeda.format(valor);
}

/** Destaca a taxa do degrau que mais destravou — a copy que está ganhando. */
function melhorTaxa(degraus: FollowUpDegrau[]): number | null {
  const comBase = degraus.filter((d) => d.receberam > 0 && d.taxa !== null);
  if (comBase.length < 2) return null;
  return Math.max(...comBase.map((d) => d.taxa as number));
}

function BlocoRegua({
  titulo,
  descricao,
  degraus,
  vazio,
  comFaturamento,
}: {
  titulo: string;
  descricao: string;
  degraus: FollowUpDegrau[];
  vazio: string;
  comFaturamento: boolean;
}) {
  const melhor = melhorTaxa(degraus);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        {degraus.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {vazio}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Disparo</TableHead>
                  <TableHead className="text-right">Receberam</TableHead>
                  <TableHead className="text-right">Destravaram</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  {comFaturamento && (
                    <>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">
                        Em negociação
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {degraus.map((d) => (
                  <TableRow key={`${d.degrau}-${d.versao}`}>
                    <TableCell className="font-medium">{d.rotulo}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {inteiro.format(d.receberam)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {inteiro.format(d.destravaram)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${
                        melhor !== null && d.taxa === melhor
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ""
                      }`}
                    >
                      {fmtTaxa(d.taxa)}
                    </TableCell>
                    {comFaturamento && (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {d.vendas === null ? "—" : inteiro.format(d.vendas)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmtMoeda(d.faturamento)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtMoeda(d.valorEmNegociacao)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FollowUpPage() {
  const [data, setData] = useState<FollowUpReguaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ghl/followup", { cache: "no-store" });
      const body = (await res.json()) as FollowUpReguaResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`);
      setData(body);
      setErro(null);
    } catch (loadError) {
      // Falha de rede não pode ficar igual a "nenhum disparo ainda" -- a
      // tabela vazia é justamente um estado normal aqui.
      setErro(
        loadError instanceof Error
          ? `Não foi possível carregar a régua (${loadError.message}).`
          : "Não foi possível carregar a régua.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
            <Link href="/funil">
              <ArrowLeft className="h-4 w-4" />
              Funil
            </Link>
          </Button>
          <div className="h-6 w-px bg-border" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <ListChecks className="h-6 w-6 text-primary" />
              Follow-Up Automatizado
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Quanto cada mensagem da régua destrava — para decidir qual
              abordagem manter
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={carregar}
          disabled={loading}
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {data?.meta.aguardandoPrimeiraObservacao && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            As tags atuais vieram da carga inicial, então a data de entrada de
            cada contato ainda é um teto, não uma observação. A partir do
            próximo sync isso passa a ser registrado de verdade — é o que vai
            permitir comparar V1 com V2 quando a copy mudar.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-6">
          <BlocoRegua
            titulo="Atendimento"
            descricao="Leads que receberam a Amostra Digital e não responderam. Destravar aqui é avançar para Negociação — e só isso: o fechamento ainda está longe desta etapa."
            degraus={data.atendimento}
            vazio="Nenhum disparo de Atendimento registrado ainda."
            comFaturamento={false}
          />
          <BlocoRegua
            titulo="Negociação"
            descricao="Leads que responderam e travaram. Destravar é chegar a Prioridade de Fechamento, Finalizando Venda ou negócio ganho — e o faturamento atribuído é a métrica final da promoção."
            degraus={data.negociacao}
            vazio="Nenhuma promoção registrada ainda."
            comFaturamento
          />
          <p className="text-center text-xs text-muted-foreground">
            Cada disparo recebe o crédito do avanço porque a régua para quando o
            lead reage: a última mensagem que ele tem é a que estava valendo.
            &quot;Em negociação&quot; é o valor em aberto dos negócios que a
            promoção está trabalhando.
          </p>
        </div>
      ) : null}
    </div>
  );
}
