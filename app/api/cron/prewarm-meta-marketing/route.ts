/**
 * Cron – pré-aquece o cache dos relatórios do Meta Marketing depois dos syncs.
 * Schedule: 45 12 * * * UTC (9h45 em Brasília), via vercel.json.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { periodoParaDatas, janelaComparacao } from "@/app/meta-marketing/lib";
import { parseReportRequest } from "@/app/meta-marketing/report-catalog";
import { warmReport, type ParsedOk } from "@/lib/meta-marketing/report-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

const COM_PERIODO = ["summary", "funnel", "sources", "ads", "top-campaigns", "sales-without-pairs", "regions"];
const COM_COMPARACAO = ["funnel", "ads"];
const SEM_PERIODO = ["pipelines", "health", "utm-unmatched", "leads-without-sale", "regions-history"];

function pedido(report: string, inicio?: string, fim?: string): ParsedOk | null {
  const params = new URLSearchParams({ report });
  if (inicio && fim) { params.set("inicio", inicio); params.set("fim", fim); }
  const parsed = parseReportRequest(params);
  return parsed.ok ? parsed : null;
}

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const base = periodoParaDatas("30d");
  const janela = janelaComparacao(base.inicio, base.fim);
  const pedidos: ParsedOk[] = [];
  const add = (p: ParsedOk | null) => { if (p) pedidos.push(p); };

  for (const report of COM_PERIODO) {
    add(pedido(report, janela.inicio, janela.fim));
    if (!COM_COMPARACAO.includes(report)) continue;
    const { atualFechado, anterior } = janela;
    if (atualFechado && (atualFechado.inicio !== janela.inicio || atualFechado.fim !== janela.fim)) {
      add(pedido(report, atualFechado.inicio, atualFechado.fim));
    }
    if (anterior) add(pedido(report, anterior.inicio, anterior.fim));
  }
  for (const report of SEM_PERIODO) add(pedido(report));

  const resultados: { report: string; inicio: string | null; fim: string | null; resultado: string; ms: number }[] = [];
  for (const req of pedidos) {
    const t0 = Date.now();
    const resultado = await warmReport(req);
    resultados.push({ report: req.report, inicio: req.inicio, fim: req.fim, resultado, ms: Date.now() - t0 });
  }
  return NextResponse.json({ ok: true, resultados }, { headers: { "Cache-Control": "no-store" } });
}
