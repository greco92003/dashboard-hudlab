"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { fmtDataCurta, hojeSaoPaulo, inicioSemana } from "../lib";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface SaudeRow {
  semana: string;
  contatos: number;
  com_utm: number;
  pct_com_utm: number | null;
  com_match_meta: number;
  pct_match_meta: number | null;
  com_ad_especifico: number;
  pct_ad_especifico: number | null;
}

interface UtmSemMatchRow {
  utm_content: string;
  utm_campaign: string | null;
  utm_source: string | null;
  qtd_contatos: number;
  ultimo_contato: string | null;
}

const LIMITE_ALERTA = 80;

export function Saude() {
  const [rows, setRows] = useState<SaudeRow[]>([]);
  const [semMatch, setSemMatch] = useState<UtmSemMatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    (async () => {
      const [saude, utms] = await Promise.all([
        supabase.from("v_atribuicao_saude").select("*"),
        supabase.from("v_utm_sem_match").select("*").limit(100),
      ]);
      if (cancel) return;
      setRows(
        ((saude.data as SaudeRow[]) ?? []).sort((a, b) =>
          a.semana.localeCompare(b.semana)
        )
      );
      setSemMatch((utms.data as UtmSemMatchRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (loading) return <Skeleton className="h-96" />;

  const ultima = rows[rows.length - 1];
  const semanaAtual = inicioSemana(hojeSaoPaulo());
  const ultimaParcial = ultima?.semana === semanaAtual;
  // Alerta ignora a semana em andamento — ela naturalmente tem poucos
  // dias de dados e não representa uma quebra real de atribuição
  const referenciaAlerta = ultimaParcial ? rows[rows.length - 2] : ultima;
  const emAlerta =
    referenciaAlerta?.pct_com_utm != null &&
    referenciaAlerta.pct_com_utm < LIMITE_ALERTA;

  return (
    <div className="space-y-4">
      {emAlerta && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atribuição degradada</AlertTitle>
          <AlertDescription>
            Na semana de {fmtDataCurta(referenciaAlerta!.semana)}, só{" "}
            {referenciaAlerta!.pct_com_utm}% dos contatos chegaram com
            utm_content. Verifique os parâmetros de URL nos anúncios do Meta e a
            gravação de UTMs no GHL.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Saúde da atribuição</CardTitle>
          <CardDescription>
            % de contatos com utm_content por semana, % atribuído ao Meta (ad
            específico ou tráfego de perfil/Bio do Instagram-Facebook, que já
            entra no ROAS geral) e, dentro desse atribuído, % que identifica
            um anúncio específico. Abaixo de {LIMITE_ALERTA}% de UTM indica
            quebra na atribuição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Sem contatos sincronizados ainda. Rode o sync-ghl para começar.
            </p>
          ) : (
            <>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="semana"
                      tickFormatter={fmtDataCurta}
                      fontSize={12}
                    />
                    <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                    <Tooltip
                      formatter={(v: number) => `${v}%`}
                      labelFormatter={(semana: string) =>
                        `${fmtDataCurta(semana)}${semana === semanaAtual ? " (em andamento)" : ""}`
                      }
                    />
                    <Legend />
                    <ReferenceLine
                      y={LIMITE_ALERTA}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: `${LIMITE_ALERTA}%`, fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct_com_utm"
                      name="% com UTM"
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct_match_meta"
                      name="% atribuído ao Meta"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct_ad_especifico"
                      name="% identificado por anúncio"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {ultimaParcial && (
                <p className="text-xs text-muted-foreground mt-1">
                  * Última semana ({fmtDataCurta(ultima.semana)}) ainda em
                  andamento — poucos dias de dados, não indica queda real.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UTMs sem match com o Meta</CardTitle>
          <CardDescription>
            Valores de utm_content que não correspondem a nenhum ad_id
            conhecido — investigar campanhas com UTM quebrada (ex: parâmetro
            estático em vez de {"{{ad.id}}"})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {semMatch.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma UTM órfã — atribuição saudável.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>utm_content</TableHead>
                    <TableHead>utm_campaign</TableHead>
                    <TableHead>utm_source</TableHead>
                    <TableHead className="text-right">Contatos</TableHead>
                    <TableHead className="text-right">Último contato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semMatch.map((u) => (
                    <TableRow key={u.utm_content}>
                      <TableCell className="font-mono text-xs max-w-56 truncate" title={u.utm_content}>
                        {u.utm_content}
                      </TableCell>
                      <TableCell className="max-w-40 truncate" title={u.utm_campaign ?? ""}>
                        {u.utm_campaign ?? "—"}
                      </TableCell>
                      <TableCell>{u.utm_source ?? "—"}</TableCell>
                      <TableCell className="text-right">{u.qtd_contatos}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {u.ultimo_contato
                          ? new Date(u.ultimo_contato).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
