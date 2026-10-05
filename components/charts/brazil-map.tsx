"use client";

import { motion, useReducedMotion } from "motion/react";
import type { JSX, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from "./brazil-map-geometry";
import {
  BRAZIL_MAP_STEPS,
  quantileBreaks,
  stepFor,
  stepIntensity,
} from "./brazil-map-scale";
import { chartCssVars } from "./chart-context";
import { TooltipBox, TooltipContent, type TooltipRow } from "./tooltip";

export interface BrazilMapDatum {
  uf: string;
  value: number | null;
}

export interface BrazilMapProps {
  data: BrazilMapDatum[];
  formatValue: (value: number) => string;
  /** "sequential": maior valor = cor mais forte. "sequential-inverted": menor valor = cor mais forte. */
  colorScale?: "sequential" | "sequential-inverted";
  /** Cor base da escala. Padrão: var(--chart-1). */
  color?: string;
  selectedUf?: string | null;
  onSelectUf?: (uf: string | null) => void;
  /** Linhas extras do tooltip por UF (a primeira linha é sempre o valor formatado). */
  tooltipRows?: (uf: string) => TooltipRow[];
  /** Rótulo da linha principal do tooltip, ex.: "ROAS". */
  valueLabel?: string;
  className?: string;
}

const DIM_OPACITY = 0.35;
const DF_RADIUS = 7;

// Mistura em oklab, não oklch: o fundo é um cinza e, em oklch, a matiz dele
// (0, vermelho) entra na interpolação e o verde passa por marrom e laranja.
// Em oklab não há ângulo de matiz, então a cor só escurece rumo ao fundo.
function mixColor(color: string, intensity: number): string {
  return `color-mix(in oklab, ${color} ${Math.round(intensity * 100)}%, ${chartCssVars.background})`;
}

interface HoverState {
  uf: string;
  x: number;
  y: number;
}

export function BrazilMap({
  data,
  formatValue,
  colorScale = "sequential",
  color = "var(--chart-1)",
  selectedUf = null,
  onSelectUf,
  tooltipRows,
  valueLabel,
  className,
}: BrazilMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const patternId = `brazil-map-hatch-${useId().replace(/:/g, "")}`;
  const hatchFill = `url(#${patternId})`;
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const valueByUf = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const d of data) m.set(d.uf, d.value);
    return m;
  }, [data]);

  const breaks = useMemo(
    () =>
      quantileBreaks(
        data.flatMap((d) => (d.value == null ? [] : [d.value])),
        BRAZIL_MAP_STEPS
      ),
    [data]
  );
  const comparable = breaks.length > 0;

  const fillFor = (value: number | null): string => {
    if (value == null) return hatchFill;
    const step = stepFor(value, breaks, BRAZIL_MAP_STEPS) ?? 0;
    return mixColor(color, stepIntensity(step, BRAZIL_MAP_STEPS, colorScale));
  };
  const swatchFor = (value: number | null): string =>
    value == null ? chartCssVars.foregroundMuted : fillFor(value);

  const states = useMemo(() => {
    const list = BRAZIL_STATES.map((s, index) => ({ ...s, index }));
    if (!selectedUf) return list;
    return [
      ...list.filter((s) => s.uf !== selectedUf),
      ...list.filter((s) => s.uf === selectedUf),
    ];
  }, [selectedUf]);

  const toggle = (uf: string) => {
    onSelectUf?.(selectedUf === uf ? null : uf);
  };

  const pointerPos = (e: MouseEvent) => {
    const r = containerRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  // Ponto de rótulo em px do container. Usa o tamanho do próprio SVG: o
  // container também contém a legenda, então a altura dele não serve.
  const labelPos = (lx: number, ly: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return {
      x: (lx / BRAZIL_VIEWBOX.width) * (r?.width ?? 0),
      y: (ly / BRAZIL_VIEWBOX.height) * (r?.height ?? 0),
    };
  };

  const onKey = (e: KeyboardEvent, uf: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(uf);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onSelectUf?.(null);
    }
  };

  const hovered = hover
    ? BRAZIL_STATES.find((s) => s.uf === hover.uf)
    : undefined;
  const hoveredValue = hovered ? (valueByUf.get(hovered.uf) ?? null) : null;

  // Legenda: faixas 0..4 (valores menores à esquerda)
  const legend = useMemo(() => {
    if (!comparable) return [];
    return Array.from({ length: BRAZIL_MAP_STEPS }, (_, step) => {
      const idx = Math.round((step * breaks.length) / (BRAZIL_MAP_STEPS - 1));
      const bound =
        idx >= breaks.length
          ? `≥ ${formatValue(breaks[breaks.length - 1])}`
          : `< ${formatValue(breaks[idx])}`;
      return {
        step,
        color: mixColor(color, stepIntensity(step, BRAZIL_MAP_STEPS, colorScale)),
        label: bound,
      };
    }).filter(
      (item, i, arr) => arr.findIndex((o) => o.label === item.label) === i
    );
  }, [comparable, breaks, color, colorScale, formatValue]);

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <svg
        aria-label="Mapa dos estados do Brasil"
        className="h-auto w-full"
        onClick={() => onSelectUf?.(null)}
        ref={svgRef}
        role="group"
        viewBox={`0 0 ${BRAZIL_VIEWBOX.width} ${BRAZIL_VIEWBOX.height}`}
      >
        <defs>
          <pattern
            height={8}
            id={patternId}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width={8}
          >
            <rect fill={chartCssVars.background} height={8} width={8} />
            <line
              stroke="var(--chart-scale-pattern-color)"
              strokeWidth={4}
              x1={0}
              x2={0}
              y1={0}
              y2={8}
            />
          </pattern>
        </defs>
        {states.map((s) => {
          const value = valueByUf.get(s.uf) ?? null;
          const selected = selectedUf === s.uf;
          const dimmed = hover !== null && hover.uf !== s.uf;
          const fill = fillFor(value);
          const label = `${s.name}: ${value == null ? "sem dados" : formatValue(value)}`;
          const handlers = {
            onBlur: () => setHover(null),
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              toggle(s.uf);
            },
            onFocus: () => setHover({ uf: s.uf, ...labelPos(s.label.x, s.label.y) }),
            onMouseLeave: () => setHover(null),
            onMouseMove: (e: MouseEvent) =>
              setHover({ uf: s.uf, ...pointerPos(e) }),
          };
          return (
            <motion.g
              animate={{ opacity: dimmed ? DIM_OPACITY : 1 }}
              aria-label={label}
              aria-pressed={selected}
              className="cursor-pointer outline-none [&:focus-visible>*]:stroke-[var(--chart-foreground)] [&:focus-visible>*]:[stroke-width:1.6]"
              initial={false}
              key={s.uf}
              onKeyDown={(e) => onKey(e, s.uf)}
              role="button"
              tabIndex={0}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              {...handlers}
            >
              <motion.path
                animate={{ opacity: 1 }}
                d={s.d}
                fill={fill}
                initial={reducedMotion ? false : { opacity: 0 }}
                stroke={selected ? chartCssVars.foreground : chartCssVars.background}
                strokeWidth={selected ? 1.6 : 0.8}
                transition={{
                  ...DEFAULT_CHART_ENTER_TRANSITION,
                  duration: 0.6,
                  delay: s.index * 0.015,
                }}
                vectorEffect="non-scaling-stroke"
              />
              {s.uf === "DF" && (
                <circle
                  cx={s.label.x}
                  cy={s.label.y}
                  fill={fill}
                  r={DF_RADIUS}
                  stroke={selected ? chartCssVars.foreground : chartCssVars.background}
                  strokeWidth={selected ? 1.6 : 0.8}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </motion.g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {comparable ? (
          legend.map((item) => (
            <div className="flex items-center gap-1.5" key={item.step}>
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground text-xs tabular-nums">
                {item.label}
              </span>
            </div>
          ))
        ) : (
          <span className="text-muted-foreground text-xs">Sem comparação</span>
        )}
        <div className="flex items-center gap-1.5">
          <svg aria-hidden="true" className="size-2.5 shrink-0 rounded-sm">
            <rect fill={hatchFill} height="100%" width="100%" />
          </svg>
          <span className="text-muted-foreground text-xs">Sem dados</span>
        </div>
      </div>

      <TooltipBox
        containerHeight={size.height}
        containerRef={containerRef}
        containerWidth={size.width}
        visible={hover !== null && hovered !== undefined}
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
      >
        {hovered && (
          <TooltipContent
            rows={[
              {
                color: swatchFor(hoveredValue),
                label: valueLabel ?? "Valor",
                value: hoveredValue == null ? "—" : formatValue(hoveredValue),
              },
              ...(tooltipRows?.(hovered.uf) ?? []),
            ]}
            title={hovered.name}
          />
        )}
      </TooltipBox>
    </div>
  );
}

BrazilMap.displayName = "BrazilMap";

export default BrazilMap;
