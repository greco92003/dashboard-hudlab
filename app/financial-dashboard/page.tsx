"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, Plus, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CartoesFluxo } from "@/components/fluxo-caixa/cartoes-fluxo";
import { GraficoFluxo } from "@/components/fluxo-caixa/grafico-fluxo";
import { TabelaContas } from "@/components/fluxo-caixa/tabela-contas";
import { DialogoBaixa, type OpcoesFluxo } from "@/components/fluxo-caixa/dialogo-baixa";
import { DialogoNovaSaida } from "@/components/fluxo-caixa/dialogo-nova-saida";
import { DialogoSaldoInicial } from "@/components/fluxo-caixa/dialogo-saldo-inicial";
import {
  PeriodoFluxo,
  periodoDoAtalho,
  type Periodo,
} from "@/components/fluxo-caixa/periodo-fluxo";
import { agrupamentoAutomatico, type Agrupamento, type ContaComStatus, type RespostaFluxo } from "@/lib/fluxo-caixa/regras";

const REGEX_OAUTH = /oauth não configurado|token expirado|conectar tiny/i;

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

export default function FinancialDashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("30d"));
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("dia");
  const [dados, setDados] = useState<RespostaFluxo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [opcoes, setOpcoes] = useState<OpcoesFluxo | null>(null);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);

  const [contaBaixa, setContaBaixa] = useState<ContaComStatus | null>(null);
  const [novaSaidaAberta, setNovaSaidaAberta] = useState(false);
  const [saldoAberto, setSaldoAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(undefined);
    try {
      const qs = new URLSearchParams({
        inicio: periodo.inicio,
        fim: periodo.fim,
        agrupamento,
      });
      const res = await fetch(`/api/fluxo-caixa?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro inesperado");
      setDados(json as RespostaFluxo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }, [periodo.inicio, periodo.fim, agrupamento]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function handlePeriodo(next: Periodo) {
    setPeriodo(next);
    setAgrupamento(agrupamentoAutomatico(next.inicio, next.fim));
  }

  async function garantirOpcoes() {
    if (opcoes || carregandoOpcoes) return;
    setCarregandoOpcoes(true);
    try {
      const res = await fetch("/api/fluxo-caixa/opcoes");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro inesperado");
      setOpcoes(json as OpcoesFluxo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar as opções.");
    } finally {
      setCarregandoOpcoes(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const res = await fetch("/api/fluxo-caixa/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        const mensagem = json.error ?? "Não foi possível sincronizar.";
        if (REGEX_OAUTH.test(mensagem)) setErro(mensagem);
        toast.error(mensagem);
        return;
      }
      toast.success(`${json.contasLidas} contas lidas do Tiny.`);
      if (json.detalhesPendentes > 0) {
        toast.info(
          `${json.detalhesPendentes} contas ainda sem categoria/data de pagamento; completam nas próximas sincronizações.`,
        );
      }
      await carregar();
    } catch {
      toast.error("Não foi possível sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  const subtitulo = dados?.ultimaSyncOk
    ? `Dados do Tiny de ${formatarDataHora(dados.ultimaSyncOk)}`
    : "Ainda não sincronizado";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Fluxo de caixa</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodoFluxo
            periodo={periodo}
            agrupamento={agrupamento}
            onPeriodo={handlePeriodo}
            onAgrupamento={setAgrupamento}
          />
          <Button variant="outline" onClick={sincronizar} disabled={sincronizando}>
            <RefreshCw className={`h-4 w-4 mr-2 ${sincronizando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={() => setSaldoAberto(true)}
          >
            Saldo inicial
          </Button>
          <Button
            onClick={() => {
              garantirOpcoes();
              setNovaSaidaAberta(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova saída
          </Button>
        </div>
      </div>

      {erro && REGEX_OAUTH.test(erro) && (
        <div className="rounded-xl border bg-muted/50 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Wallet className="h-8 w-8 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              {erro.includes("expirado")
                ? "Sessão do Tiny ERP expirada"
                : "Conecte o Tiny ERP para ver seus dados financeiros"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {erro.includes("expirado")
                ? 'O token de acesso expirou. Clique em "Reconectar Tiny" para renovar a autorização.'
                : 'O app Tiny está configurado. Clique em "Conectar Tiny" para autorizar o acesso.'}
            </p>
          </div>
          <Button asChild>
            <a href="/api/financial-dashboard/oauth">
              <Link className="h-4 w-4 mr-2" />
              {erro.includes("expirado") ? "Reconectar Tiny" : "Conectar Tiny"}
            </a>
          </Button>
        </div>
      )}

      {erro && !REGEX_OAUTH.test(erro) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      {dados?.ultimaSync?.status === "erro" && (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Última sincronização falhou: {dados.ultimaSync.erro}
        </div>
      )}

      {!dados?.ultimaSyncOk && !carregando && !erro && (
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Espelho vazio: clique em Atualizar para trazer as contas do Tiny.
        </div>
      )}

      <CartoesFluxo resumo={dados?.resumo ?? null} carregando={carregando} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entradas, saídas e fechamento</CardTitle>
        </CardHeader>
        <CardContent>
          {dados ? <GraficoFluxo pontos={dados.pontos} /> : <Skeleton className="h-72 w-full" />}
        </CardContent>
      </Card>

      <Tabs defaultValue="pagar">
        <TabsList>
          <TabsTrigger value="pagar">A pagar</TabsTrigger>
          <TabsTrigger value="receber">A receber</TabsTrigger>
        </TabsList>
        <TabsContent value="pagar" className="mt-4">
          <TabelaContas
            tipo="pagar"
            contas={dados?.contas ?? []}
            onBaixar={(conta) => {
              garantirOpcoes();
              setContaBaixa(conta);
            }}
          />
        </TabsContent>
        <TabsContent value="receber" className="mt-4">
          <TabelaContas
            tipo="receber"
            contas={dados?.contas ?? []}
            onBaixar={(conta) => {
              garantirOpcoes();
              setContaBaixa(conta);
            }}
          />
        </TabsContent>
      </Tabs>

      <DialogoBaixa
        conta={contaBaixa}
        hoje={dados?.hoje ?? new Date().toISOString().slice(0, 10)}
        opcoes={opcoes}
        onFechar={() => setContaBaixa(null)}
        onConcluido={() => {
          setContaBaixa(null);
          carregar();
        }}
      />

      <DialogoNovaSaida
        aberto={novaSaidaAberta}
        hoje={dados?.hoje ?? new Date().toISOString().slice(0, 10)}
        opcoes={opcoes}
        onFechar={() => setNovaSaidaAberta(false)}
        onConcluido={() => {
          setNovaSaidaAberta(false);
          carregar();
        }}
      />

      <DialogoSaldoInicial
        aberto={saldoAberto}
        saldo={dados?.saldoInicial ?? null}
        hoje={dados?.hoje ?? new Date().toISOString().slice(0, 10)}
        onFechar={() => setSaldoAberto(false)}
        onConcluido={() => {
          setSaldoAberto(false);
          carregar();
        }}
      />
    </div>
  );
}
