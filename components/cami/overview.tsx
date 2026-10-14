"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OverviewPayload } from "@/lib/ghl/ai-seller/intel-load";
import { cn } from "@/lib/utils";
import {
  FORA_LABEL,
  MOTIVO_LABEL,
  fmtDuration,
  fmtInt,
  fmtMoney,
  fmtPct,
  label,
} from "./format";

function Kpi({
  title,
  value,
  detail,
  reference,
}: {
  title: string;
  value: string;
  detail?: string;
  reference?: string | null;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 space-y-1">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        {reference && <p className="text-xs text-muted-foreground/80 italic">{reference}</p>}
      </CardContent>
    </Card>
  );
}

export function CamiOverview({ data, loading }: { data: OverviewPayload | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return <p className="text-center text-muted-foreground py-8">Não foi possível carregar os números.</p>;

  const { overview: o, baseline: b, settings } = data;
  const antes = (text: string | null) => (b && text ? `Antes da Cami: ${text}` : null);
  const funilMax = Math.max(1, ...o.funil.map((f) => f.n));

  return (
    <div className="space-y-6">
      {o.assumidos === 0 && (
        <Card className="border-dashed py-4">
          <CardContent className="px-4 text-sm text-muted-foreground">
            Nenhum cliente assumido pela Cami neste período. Ela assume pedidos de {settings.minPares}
            {settings.maxPares !== settings.minPares ? ` a ${settings.maxPares}` : ""} pares quando a amostra é entregue;
            os números aparecem aqui conforme os clientes chegam.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Clientes assumidos"
          value={fmtInt(o.assumidos)}
          detail={(() => {
            const fora = o.foraDaCami.reduce((s, f) => s + f.n, 0);
            if (fora === 0) return "Nenhum ficou de fora";
            return fora === 1 ? "1 ficou com o time" : `${fmtInt(fora)} ficaram com o time`;
          })()}
        />
        <Kpi
          title="Responderam à Cami"
          value={fmtPct(o.responderam.pct)}
          detail={`${fmtInt(o.responderam.n)} de ${fmtInt(o.assumidos)}`}
        />
        <Kpi
          title="Tempo de resposta"
          value={fmtDuration(o.tempoResposta.medianaSeg)}
          detail={`mediana · pior ${fmtDuration(o.tempoResposta.piorSeg)} · ${fmtInt(o.tempoResposta.n)} respostas`}
          reference={antes(
            b?.medianaPrimeiraRespostaMin == null
              ? null
              : `${fmtDuration(b.medianaPrimeiraRespostaMin * 60)} até a primeira resposta do time`,
          )}
        />
        <Kpi
          title="Chegaram ao pagamento"
          value={fmtPct(o.pagamento.pct)}
          detail={`${fmtInt(o.pagamento.n)} de ${fmtInt(o.assumidos)}`}
        />
        <Kpi
          title="Passagens para humano"
          value={fmtInt(o.passagens.total)}
          detail={
            o.passagens.porMotivo.length
              ? o.passagens.porMotivo.map((p) => `${label(MOTIVO_LABEL, p.motivo)} ${p.n}`).join(" · ")
              : "Nenhuma no período"
          }
        />
        <Kpi
          title="Sumiram depois da Cami"
          value={fmtPct(o.sumiram.pct)}
          detail={`${fmtInt(o.sumiram.n)} sem responder há mais de 24h`}
        />
        <Kpi
          title="Vendas"
          value={fmtInt(o.vendas.n)}
          detail={o.vendas.n ? fmtMoney(o.vendas.valor) : "Nenhuma venda ainda"}
          reference={antes(b?.pctGanho30d == null ? null : `${fmtPct(b.pctGanho30d)} viravam venda em 30 dias`)}
        />
        <Kpi
          title="Custo estimado"
          value={fmtMoney(o.custo.reais, 2)}
          detail={`${fmtInt(o.custo.rodadas)} rodadas · ${o.custo.porVendaReais == null ? "—" : fmtMoney(o.custo.porVendaReais, 2)} por venda`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Funil da Cami</CardTitle>
            <p className="text-sm text-muted-foreground">
              Clientes assumidos no período e até onde chegaram. % sobre os assumidos.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {o.funil.map((step) => (
              <div key={step.etapa} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{step.etapa}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <strong className="text-foreground">{fmtInt(step.n)}</strong> · {fmtPct(step.pct)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", step.etapa === "Ganhou" ? "bg-green-600" : "bg-primary")}
                    style={{ width: `${(step.n / funilMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {b && (
              <p className="text-xs text-muted-foreground/80 italic pt-1">
                Antes da Cami ({b.amostras} amostras de 12 pares, {b.periodoInicio.split("-").reverse().slice(0, 2).join("/")} a{" "}
                {b.periodoFim.split("-").reverse().slice(0, 2).join("/")}): {fmtPct(b.pctNegociacao)} chegavam à Negociação.
                Época diferente; comparação aproximada.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ficaram com o time</CardTitle>
            <p className="text-sm text-muted-foreground">Amostras entregues que a Cami não assumiu, por motivo.</p>
          </CardHeader>
          <CardContent>
            {o.foraDaCami.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {o.foraDaCami.map((f) => (
                  <li key={f.motivo} className="flex justify-between gap-3">
                    <span>{label(FORA_LABEL, f.motivo)}</span>
                    <strong className="tabular-nums">{fmtInt(f.n)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
