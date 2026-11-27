"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Gift, Loader2, Percent, RefreshCw, Send, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CabecalhoDaPagina, GrupoDeAcoes, Painel } from "@/components/hud/pagina";
import { cn } from "@/lib/utils";
import type { PainelHudIndica, IndicacaoDoPainel } from "@/lib/hud-indica/servidor";
import type { StatusIndicacao } from "@/lib/hud-indica/regras";

const brl = (centavos: number | null | undefined) =>
  centavos == null ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);

const STATUS: Record<StatusIndicacao, { nome: string; tom: string }> = {
  recebida: { nome: "Em andamento", tom: "tone-sky" },
  fechou: { nome: "Fechou, aguardando pagamento integral", tom: "tone-violet" },
  liberada: { nome: "Pix a pagar", tom: "tone-pink" },
  paga: { nome: "Pix pago", tom: "tone-green" },
  invalida: { nome: "Não validada", tom: "tone-slate" },
  expirada: { nome: "Passou dos 60 dias", tom: "tone-slate" },
  cancelada: { nome: "Cancelada", tom: "tone-rose" },
};

function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn("h-7 w-7", ok && "tone-green hud-tone-chip")}
      title={`Copiar ${rotulo}`}
      aria-label={`Copiar ${rotulo}`}
      onClick={() => {
        void navigator.clipboard.writeText(valor).then(() => {
          setOk(true);
          window.setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function PainelHudIndicaPagina() {
  const [dados, setDados] = useState<PainelHudIndica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/hud-indica", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao carregar o Hud Indica");
      setDados(json as PainelHudIndica);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar o Hud Indica");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const agir = async (i: IndicacaoDoPainel, acao: "pago" | "cancelar") => {
    let motivo = "";
    if (acao === "cancelar") {
      motivo = window.prompt(`Por que cancelar a indicação de ${i.indicado ?? "este lead"}?`) ?? "";
      if (!motivo.trim()) return;
    }
    setOcupado(i.id);
    try {
      const res = await fetch(`/api/hud-indica/${i.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não deu certo");
      if (acao === "pago") {
        toast.success(
          json.avisoM5 === "inscrito"
            ? `Pix marcado como pago. ${i.indicador ?? "Quem indicou"} recebe a mensagem de agradecimento.`
            : "Pix marcado como pago. A mensagem de agradecimento não saiu: o workflow da M5 não está publicado.",
        );
      } else toast.success("Indicação cancelada");
      setConfirmar(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não deu certo");
    } finally {
      setOcupado(null);
    }
  };

  const n = dados?.numeros;
  const aPagar = dados?.indicacoes.filter((i) => i.status === "liberada") ?? [];
  const kpis = [
    {
      rotulo: "Vendas por indicação no mês",
      valor: pct(dados?.pctVendasPorIndicacao ?? null),
      detalhe: dados ? `${dados.indicadosDoMes} de ${dados.pedidosDoMes} pedidos` : "",
      Icone: Percent,
    },
    { rotulo: "Indicações recebidas", valor: n ? String(n.indicacoes - n.invalidas) : "—", detalhe: n ? `${n.emAndamento} em andamento` : "", Icone: Users },
    { rotulo: "Pedidos indicados", valor: n ? String(n.fechadas) : "—", detalhe: n ? brl(n.faturamentoIndicadoCentavos) : "", Icone: Gift },
    { rotulo: "Pix a pagar", valor: n ? String(n.pixAPagar) : "—", detalhe: n ? brl(n.pixAPagarCentavos) : "", Icone: Wallet },
    { rotulo: "Prêmios pagos", valor: n ? brl(n.premiosPagosCentavos) : "—", detalhe: n ? `${n.pagas} Pix` : "", Icone: Send },
  ];

  return (
    <div className="hud-page">
      <CabecalhoDaPagina
        icone={Gift}
        titulo="Hud Indica"
        descricao="Indicação do pós-venda: R$ 100 no Pix para quem indica cada empresa que fecha e paga, e frete grátis para quem é indicado."
        acoes={
          <GrupoDeAcoes rotulo="Ações do Hud Indica">
            <button type="button" onClick={() => void carregar()} disabled={carregando}>
              {carregando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar
            </button>
          </GrupoDeAcoes>
        }
      />

      <dl className="hud-kpi-strip hud-panel overflow-hidden" aria-label="Números do Hud Indica">
        {kpis.map(({ rotulo, valor, detalhe, Icone }) => (
          <div className="hud-kpi" key={rotulo}>
            <span className="hud-kpi-icon" aria-hidden="true">
              <Icone />
            </span>
            <div className="min-w-0">
              <dt>{rotulo}</dt>
              {carregando && !dados ? (
                <dd>
                  <Skeleton className="my-1 h-7 w-20 max-w-full" />
                </dd>
              ) : (
                <>
                  <dd className="hud-kpi-value">{valor}</dd>
                  {detalhe && <dd className="hud-kpi-detail">{detalhe}</dd>}
                </>
              )}
            </div>
          </div>
        ))}
      </dl>

      <Painel titulo="Pix a pagar" extra={<span className="text-xs text-muted-foreground">O dashboard só registra: quem paga é a Amanda.</span>}>
        {aPagar.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum Pix liberado agora.</p>
        ) : (
          <div className="divide-y">
            {aPagar.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.indicador ?? "Indicador"}</p>
                  <p className="text-xs text-muted-foreground">
                    Indicou {i.empresa ?? i.indicado ?? "uma empresa"} · {i.formaDePagamento ?? "forma não informada"} · liberado em {ddmm(i.liberadoEm)}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {dados?.podeAdministrar ? (
                    i.chavePix ? (
                      <>
                        <span className="text-muted-foreground">Chave Pix:</span>
                        <span className="font-medium tabular-nums">{i.chavePix}</span>
                        <Copiar valor={i.chavePix} rotulo="chave Pix" />
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">Chave Pix ainda não recebida (pedida na M4)</span>
                    )
                  ) : null}
                </div>
                <span className="font-semibold tabular-nums">R$ 100,00</span>
                {dados?.podeAdministrar &&
                  (confirmar === i.id ? (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-8" disabled={ocupado === i.id} onClick={() => void agir(i, "pago")}>
                        {ocupado === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Confirmar: já paguei
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmar(null)}>
                        Voltar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setConfirmar(i.id)}>
                      Marcar como pago
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </Painel>

      <Painel titulo="Indicações" extra={n ? <span className="text-xs text-muted-foreground">Conversão {pct(n.conversaoPct)} · {n.invalidas} não validadas</span> : null}>
        {(dados?.indicacoes.length ?? 0) === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma indicação ainda. Elas aparecem quando alguém chega pelo link pessoal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Chegou</th>
                  <th className="px-4 py-2 font-medium">Indicado</th>
                  <th className="px-4 py-2 font-medium">Indicado por</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {dados?.indicacoes.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{ddmm(i.criadoEm)}</td>
                    <td className="px-4 py-2">
                      <p className="font-medium">{i.empresa ?? i.indicado ?? "—"}</p>
                      {i.empresa && i.indicado && <p className="text-xs text-muted-foreground">{i.indicado}</p>}
                    </td>
                    <td className="px-4 py-2">{i.indicador ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={cn("hud-chip hud-tone-chip", STATUS[i.status].tom)}>{STATUS[i.status].nome}</span>
                      {i.motivo && <p className="mt-1 text-xs text-muted-foreground">{i.motivo}</p>}
                      {i.status === "recebida" && <p className="mt-1 text-xs text-muted-foreground">Vale até {ddmm(i.expiraEm)}</p>}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {i.pares ? `${i.pares} pares · ${brl(i.valorCentavos)}` : "—"}
                      {i.pagoEm && <p>Pix pago em {ddmm(i.pagoEm)}</p>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {dados?.podeAdministrar && (i.status === "recebida" || i.status === "fechou" || i.status === "liberada") && (
                        <Button size="sm" variant="ghost" className="tone-rose hud-tone-text h-7 px-2 text-xs" disabled={ocupado === i.id} onClick={() => void agir(i, "cancelar")}>
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel
        titulo="Indicadores"
        extra={n ? <span className="text-xs text-muted-foreground">{n.indicadores} com link · {n.indicadoresAtivos} já indicaram ({pct(n.adesaoPct)})</span> : null}
      >
        {(dados?.indicadores.length ?? 0) === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">O link pessoal é criado quando o cliente toca em &quot;Nota 10!&quot; na pesquisa pós-entrega.</p>
        ) : (
          <div className="divide-y">
            {dados?.indicadores.map((i) => (
              <div key={i.codigo} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 font-medium">{i.nome ?? "—"}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {i.link.replace("https://www.", "")}
                  <Copiar valor={i.link} rotulo="link" />
                </span>
                <span className="text-xs text-muted-foreground">desde {ddmm(i.criadoEm)}</span>
                <span className="w-28 text-right text-xs tabular-nums">{i.indicacoes} indicaç{i.indicacoes === 1 ? "ão" : "ões"}</span>
              </div>
            ))}
          </div>
        )}
      </Painel>
    </div>
  );
}
