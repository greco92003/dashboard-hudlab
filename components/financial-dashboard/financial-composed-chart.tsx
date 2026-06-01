"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinancialTimelinePoint } from "@/lib/tiny/types";
import type { FinancialFilterState } from "./financial-filters";

// ─── colours ────────────────────────────────────────────────────────────────
const COLOR_RECEIVABLE = "#22c55e"; // green-500 (Realizado)
const COLOR_RECEIVABLE_LIGHT = "#86efac"; // green-300 (Previsto)
const COLOR_PAYABLE = "#f43f5e"; // rose-500 (Realizado)
const COLOR_PAYABLE_LIGHT = "#fda4af"; // rose-300 (Previsto)
const COLOR_BALANCE = "#38bdf8"; // sky-400 (Realizado)
const COLOR_BALANCE_PRED = "#a78bfa"; // violet-400 (Previsto)

const chartConfig = {
  realizedIn: { label: "Recebido (Realizado)", color: COLOR_RECEIVABLE },
  predictedIn: { label: "A receber (Previsto)", color: COLOR_RECEIVABLE_LIGHT },
  realizedOutNeg: { label: "Pago (Realizado)", color: COLOR_PAYABLE },
  predictedOutNeg: { label: "A pagar (Previsto)", color: COLOR_PAYABLE_LIGHT },
  realizedBalance: { label: "Saldo Realizado", color: COLOR_BALANCE },
  cashBalance: { label: "Saldo Previsto", color: COLOR_BALANCE_PRED },
} satisfies ChartConfig;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** For Y-axis tick labels – always shows absolute value */
function fmtBRLAbs(v: number) {
  return Math.abs(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** For tooltip – preserves sign so negative cash balance is shown correctly */
function fmtBRLSigned(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TOOLTIP_META: Record<
  string,
  { label: string; color: string; dashed?: boolean; line?: boolean }
> = {
  realizedIn: { label: "Recebido (Realizado)", color: COLOR_RECEIVABLE },
  predictedIn: { label: "A receber (Previsto)", color: COLOR_RECEIVABLE_LIGHT },
  realizedOutNeg: { label: "Pago (Realizado)", color: COLOR_PAYABLE },
  predictedOutNeg: { label: "A pagar (Previsto)", color: COLOR_PAYABLE_LIGHT },
  realizedBalance: {
    label: "Saldo Realizado",
    color: COLOR_BALANCE,
    line: true,
  },
  cashBalance: {
    label: "Saldo Previsto",
    color: COLOR_BALANCE_PRED,
    line: true,
    dashed: true,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1a1a2e",
        border: "1px solid #2a2a3e",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        minWidth: 220,
      }}
    >
      <p
        style={{
          color: "#e2e8f0",
          fontWeight: 600,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      {payload.map((entry: any, i: number) => {
        const meta = TOOLTIP_META[entry.dataKey];
        if (!meta) return null;
        const displayValue = fmtBRLSigned(entry.value);
        const valueColor =
          entry.value < 0 ? "#f87171" : meta.line ? meta.color : "#e2e8f0";

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 0",
              fontSize: 12,
            }}
          >
            {meta.line ? (
              <svg width="16" height="10" style={{ flexShrink: 0 }}>
                <line
                  x1="0"
                  y1="5"
                  x2="16"
                  y2="5"
                  stroke={meta.color}
                  strokeWidth="2"
                  strokeDasharray={meta.dashed ? "3 3" : undefined}
                />
              </svg>
            ) : (
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: meta.color,
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ color: "#94a3b8", flex: 1 }}>{meta.label}</span>
            <span
              style={{
                color: valueColor,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {displayValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── legend ──────────────────────────────────────────────────────────────────
type LegendItem = {
  color: string;
  label: string;
  line?: boolean;
  dashed?: boolean;
};

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-5 mt-2 text-xs text-muted-foreground select-none">
      {items.map(({ color, label, line, dashed }) => (
        <div key={label} className="flex items-center gap-1.5">
          {line ? (
            <svg width="22" height="10" aria-hidden>
              <line
                x1="0"
                y1="5"
                x2="22"
                y2="5"
                stroke={color}
                strokeWidth="2"
                strokeDasharray={dashed ? "3 3" : undefined}
              />
            </svg>
          ) : (
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: color }}
            />
          )}
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── props ───────────────────────────────────────────────────────────────────
interface FinancialComposedChartProps {
  data?: FinancialTimelinePoint[];
  loading?: boolean;
  viewMode?: FinancialFilterState["viewMode"];
}

// ─── component ───────────────────────────────────────────────────────────────
export function FinancialComposedChart({
  data,
  loading,
  viewMode = "both",
}: FinancialComposedChartProps) {
  if (loading || !data) {
    return <Skeleton className="h-[280px] w-full rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
        Nenhum dado disponível para o período.
      </div>
    );
  }

  const showRealized = viewMode !== "predicted";
  const showPredicted = viewMode !== "realized";

  // Inflows (receivables) stay positive; outflows (payables) become negative
  // so they grow downward from the zero baseline.
  const chartData = data.map((pt) => ({
    ...pt,
    realizedOutNeg: -Math.abs(pt.realizedOut),
    predictedOutNeg: -Math.abs(pt.predictedOut),
  }));

  const showDots = data.length <= 14;

  const legendItems: LegendItem[] = [];
  if (showRealized) {
    legendItems.push(
      { color: COLOR_RECEIVABLE, label: "Recebido (Realizado)" },
      { color: COLOR_PAYABLE, label: "Pago (Realizado)" },
    );
  }
  if (showPredicted) {
    legendItems.push(
      { color: COLOR_RECEIVABLE_LIGHT, label: "A receber (Previsto)" },
      { color: COLOR_PAYABLE_LIGHT, label: "A pagar (Previsto)" },
    );
  }
  if (showRealized) {
    legendItems.push({
      color: COLOR_BALANCE,
      label: "Saldo Realizado",
      line: true,
    });
  }
  if (showPredicted) {
    legendItems.push({
      color: COLOR_BALANCE_PRED,
      label: "Saldo Previsto",
      line: true,
      dashed: true,
    });
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <ComposedChart
          data={chartData}
          stackOffset="sign"
          barCategoryGap="20%"
          margin={{ top: 10, right: 24, bottom: 4, left: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tickFormatter={fmtBRLAbs}
            tick={{ fontSize: 10 }}
            width={86}
            axisLine={false}
            tickLine={false}
          />

          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />

          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={<CustomTooltip />}
            wrapperStyle={{ zIndex: 50 }}
          />

          {/* ── Realizado: bars above (in) and below (out) zero ── */}
          {showRealized && (
            <>
              <Bar
                dataKey="realizedIn"
                stackId="in"
                maxBarSize={48}
                radius={[3, 3, 0, 0]}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLOR_RECEIVABLE} />
                ))}
              </Bar>
              <Bar
                dataKey="realizedOutNeg"
                stackId="out"
                maxBarSize={48}
                radius={[0, 0, 3, 3]}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLOR_PAYABLE} />
                ))}
              </Bar>
            </>
          )}

          {/* ── Previsto: stacked on top of Realizado in the same column ── */}
          {showPredicted && (
            <>
              <Bar
                dataKey="predictedIn"
                stackId="in"
                maxBarSize={48}
                radius={[3, 3, 0, 0]}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLOR_RECEIVABLE_LIGHT} />
                ))}
              </Bar>
              <Bar
                dataKey="predictedOutNeg"
                stackId="out"
                maxBarSize={48}
                radius={[0, 0, 3, 3]}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLOR_PAYABLE_LIGHT} />
                ))}
              </Bar>
            </>
          )}

          {/* ── Saldo Realizado — solid line ── */}
          {showRealized && (
            <Line
              type="monotone"
              dataKey="realizedBalance"
              stroke={COLOR_BALANCE}
              strokeWidth={2}
              dot={
                showDots ? { r: 4, fill: COLOR_BALANCE, strokeWidth: 0 } : false
              }
              activeDot={{ r: 6, fill: COLOR_BALANCE, strokeWidth: 0 }}
              isAnimationActive={true}
            />
          )}

          {/* ── Saldo Previsto — dashed line (Conta Azul style) ── */}
          {showPredicted && (
            <Line
              type="monotone"
              dataKey="cashBalance"
              stroke={COLOR_BALANCE_PRED}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={
                showDots
                  ? { r: 3, fill: COLOR_BALANCE_PRED, strokeWidth: 0 }
                  : false
              }
              activeDot={{ r: 5, fill: COLOR_BALANCE_PRED, strokeWidth: 0 }}
              isAnimationActive={true}
            />
          )}
        </ComposedChart>
      </ChartContainer>

      <Legend items={legendItems} />
    </div>
  );
}
