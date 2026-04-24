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

// ─── colours ────────────────────────────────────────────────────────────────
const COLOR_RECEIVABLE = "#22c55e"; // green-500
const COLOR_PAYABLE = "#f43f5e"; // rose-500
const COLOR_BALANCE = "#38bdf8"; // sky-400

const chartConfig = {
  receivable: { label: "A receber", color: COLOR_RECEIVABLE },
  payableNeg: { label: "A pagar", color: COLOR_PAYABLE },
  cashBalance: { label: "Saldo de Caixa", color: COLOR_BALANCE },
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

const TOOLTIP_META: Record<string, { label: string; color: string }> = {
  receivable: { label: "A receber", color: COLOR_RECEIVABLE },
  payableNeg: { label: "A pagar", color: COLOR_PAYABLE },
  cashBalance: { label: "Saldo de Caixa", color: COLOR_BALANCE },
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
        minWidth: 200,
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
        const meta = TOOLTIP_META[entry.dataKey] ?? {
          label: entry.dataKey,
          color: entry.color,
        };
        // For "A pagar", the raw data is already negative (payableNeg).
        // Show it as negative so the user sees e.g. -R$ 9.846,98
        const displayValue = fmtBRLSigned(entry.value);
        const valueColor =
          entry.value < 0
            ? "#f87171" // red for negative
            : entry.dataKey === "cashBalance"
              ? COLOR_BALANCE
              : "#e2e8f0";

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
            {entry.dataKey === "cashBalance" ? (
              <svg width="12" height="12" style={{ flexShrink: 0 }}>
                <line
                  x1="0"
                  y1="6"
                  x2="12"
                  y2="6"
                  stroke={meta.color}
                  strokeWidth="2"
                />
                <circle cx="6" cy="6" r="2.5" fill={meta.color} />
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
function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-5 mt-2 text-xs text-muted-foreground select-none">
      {[
        { color: COLOR_RECEIVABLE, label: "A receber", bar: true },
        { color: COLOR_PAYABLE, label: "A pagar", bar: true },
        { color: COLOR_BALANCE, label: "Saldo de Caixa", bar: false },
      ].map(({ color, label, bar }) => (
        <div key={label} className="flex items-center gap-1.5">
          {bar ? (
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: color }}
            />
          ) : (
            <svg width="20" height="10" aria-hidden>
              <line
                x1="0"
                y1="5"
                x2="20"
                y2="5"
                stroke={color}
                strokeWidth="2"
              />
              <circle cx="10" cy="5" r="3" fill={color} />
            </svg>
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
}

// ─── component ───────────────────────────────────────────────────────────────
export function FinancialComposedChart({
  data,
  loading,
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

  // payable is stored as a positive number; negate it so it renders below zero
  const chartData = data.map((pt) => ({
    ...pt,
    payableNeg: -Math.abs(pt.payable),
  }));

  const showDots = data.length <= 14;

  return (
    <div>
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
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

          {/* ── Receivable bar — positive, grows up ── */}
          <Bar
            dataKey="receivable"
            stackId="fin"
            maxBarSize={48}
            radius={[3, 3, 0, 0]}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLOR_RECEIVABLE} />
            ))}
          </Bar>

          {/* ── Payable bar — negative, grows down ── */}
          <Bar
            dataKey="payableNeg"
            stackId="fin"
            maxBarSize={48}
            radius={[0, 0, 3, 3]}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLOR_PAYABLE} />
            ))}
          </Bar>

          {/* ── Cash-balance line — rendered last so dots sit on top ── */}
          <Line
            type="monotone"
            dataKey="cashBalance"
            stroke={COLOR_BALANCE}
            strokeWidth={2}
            dot={
              showDots ? { r: 4, fill: COLOR_BALANCE, strokeWidth: 0 } : false
            }
            activeDot={{ r: 6, fill: COLOR_BALANCE, strokeWidth: 0 }}
            isAnimationActive={true}
          />
        </ComposedChart>
      </ChartContainer>

      <Legend />
    </div>
  );
}
