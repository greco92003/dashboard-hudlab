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

interface Campanha {
  campanha: string;
  tipo: "fechamento" | "recompra";
  inicio: string;
  fim: string;
  enviados: number;
  queroVer: number;
  naoQuero: number;
  queroPedido: number;
  agoraNao: number;
  consultarPrazo: number;
  novosNegocios: number;
  fecharam: number;
  faturamento: number | null;
}

interface FollowUpReguaResponse {
  atendimento: FollowUpDegrau[];
  negociacao: FollowUpDegrau[];
  campanhas: Campanha[];
  listaVip?: { membros: number; vistoEm: string } | null;
  meta: {
    geradoEm: string;
    aguardandoPrimeiraObservacao: boolean;
    tagsLidasEm?: string | null;
  };
}

const horaLeitura = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const diaLeitura = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

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

/** Nome da tag vira título: campanha_politica_* -> "Política". */
function tituloDaCampanha(nome: string) {
  const limpo = nome.replace(/[_-]+/g, " ").trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function fmtDia(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return dia && mes ? `${dia}/${mes}/${ano}` : iso;
}

/** A regra de resultado depende do público (ver migration get_campanhas_regra_por_tipo). */
function regraDaCampanha(c: Campanha) {
  return c.tipo === "fechamento"
    ? `Negociações em fase final: conta a venda ganha até o fechamento do mês (${fmtDia(c.fim)}), mesmo de negócio que já existia.`
    : `Base de clientes: conta negócio aberto depois do disparo e ganho até ${fmtDia(c.fim)}.`;
}

/**
 * Campanhas de WhatsApp (a primeira foi a "Política"). O funil é lido de
 * cima para baixo, e cada linha mostra a fatia de quem recebeu -- assim dá
 * para ver onde as pessoas param.
 */
function BlocoCampanhas({
  campanhas,
  listaVip,
}: {
  campanhas: Campanha[];
  listaVip?: { membros: number; vistoEm: string } | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>Campanhas</CardTitle>
          {listaVip && (
            <div
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-right"
              title={`Contatos com a tag lista_vip no último sync (${new Date(listaVip.vistoEm).toLocaleString("pt-BR")})`}
            >
              <div className="text-xs text-muted-foreground">Lista VIP</div>
              <div className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {inteiro.format(listaVip.membros)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  membros
                </span>
              </div>
            </div>
          )}
        </div>
        <CardDescription>
          Disparos de WhatsApp. Cada venda conta só na última campanha que o
          contato recebeu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campanhas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma campanha disparada ainda. Assim que as tags{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              campanha_*
            </code>{" "}
            forem aplicadas no GHL, o funil aparece aqui sozinho.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {campanhas.map((c) => {
              const etapas = [
                { rotulo: "Receberam", valor: c.enviados },
                { rotulo: "Aceitaram o convite", valor: c.queroVer },
                { rotulo: "Recusaram o convite", valor: c.naoQuero, secundaria: true },
                { rotulo: "Quero fazer pedido", valor: c.queroPedido },
                // Só a Black VIP tem esse botão; nas outras a linha ficaria
                // sempre em zero.
                ...(c.consultarPrazo > 0
                  ? [{ rotulo: "Consultar prazo", valor: c.consultarPrazo }]
                  : []),
                { rotulo: "Agora não", valor: c.agoraNao, secundaria: true },
                { rotulo: "Abriram negócio novo", valor: c.novosNegocios },
                { rotulo: "Fecharam pedido", valor: c.fecharam },
              ];
              return (
                <div key={c.campanha}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold">
                      {tituloDaCampanha(c.campanha)}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      desde {fmtDia(c.inicio)}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {regraDaCampanha(c)}
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Etapa</TableHead>
                          <TableHead className="text-right">Contatos</TableHead>
                          <TableHead className="text-right">
                            % de quem recebeu
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {etapas.map((e) => (
                          <TableRow key={e.rotulo}>
                            <TableCell
                              className={
                                e.secundaria
                                  ? "text-muted-foreground"
                                  : "font-medium"
                              }
                            >
                              {e.rotulo}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {inteiro.format(e.valor)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {fmtTaxa(
                                c.enviados > 0
                                  ? (e.valor / c.enviados) * 100
                                  : null,
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-medium">
                            Faturamento
                          </TableCell>
                          <TableCell
                            className="text-right font-semibold tabular-nums"
                            colSpan={2}
                          >
                            {fmtMoeda(c.faturamento)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
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

  // O botão lê de novo as tags no GHL (~1 min) antes de recarregar: sem isso
  // ele só relia o banco, que o sync completo atualiza 1x/dia.
  const [lendoGhl, setLendoGhl] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const atualizar = useCallback(async () => {
    setLendoGhl(true);
    setAviso(null);
    try {
      const res = await fetch("/api/ghl/followup/atualizar", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        recente?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setAviso(
          `Não foi possível ler o GHL agora (${body.error ?? `erro ${res.status}`}). Os números abaixo são da última leitura.`,
        );
      } else if (body.recente) {
        setAviso(
          "O GHL foi lido há menos de 10 min. Os números abaixo já são dessa leitura.",
        );
      }
    } catch {
      setAviso(
        "Não foi possível ler o GHL agora. Os números abaixo são da última leitura.",
      );
    } finally {
      setLendoGhl(false);
    }
    await carregar();
  }, [carregar]);

  const tagsLidasEm = data?.meta.tagsLidasEm
    ? new Date(data.meta.tagsLidasEm)
    : null;

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
        <div className="flex items-center gap-3">
          <p className="text-right text-xs text-muted-foreground">
            {lendoGhl
              ? "Lendo as tags no GHL… cerca de 1 min"
              : tagsLidasEm
                ? `GHL lido às ${horaLeitura.format(tagsLidasEm)} de ${diaLeitura.format(tagsLidasEm)}`
                : null}
          </p>
          <Button
            variant="outline"
            size="icon"
            onClick={atualizar}
            disabled={loading || lendoGhl}
            title="Ler o GHL de novo e atualizar"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading || lendoGhl ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {aviso && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

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
          <BlocoCampanhas
            campanhas={data.campanhas ?? []}
            listaVip={data.listaVip}
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
