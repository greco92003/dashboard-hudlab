"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ─── Brand Colors ─────────────────────────────────────────────────────────────
const P = "oklch(0.8777 0.2202 154.2614)"; // --primary green
const P15 = "oklch(0.8777 0.2202 154.2614 / 0.15)";
const P30 = "oklch(0.8777 0.2202 154.2614 / 0.3)";
const P70 = "oklch(0.8777 0.2202 154.2614 / 0.7)";

const logoPath = `M74.4,28.8c-0.5-0.6-1.3-1-2.4-1h-3.4c0.2,20,0.3,40,0.4,60c1.1,0.3,2.2,0.7,3.2,1c1.1,0.3,1.9,0.3,2.4-0.1c0.5-0.4,0.7-1.1,0.7-2c0-18.6-0.1-37.1-0.2-55.6C75.1,30.2,74.9,29.4,74.4,28.8z M41.5,108.4c0,0.3,0.2,0.9,1.5,0.9c0.8,0,1.5-0.2,2.1-0.5c0.9-0.5,1.1-1,1.2-1.5c-0.7,0.1-2.3,0.1-3,0.2C42.7,107.6,41.5,107.7,41.5,108.4z M58.7,104.9c-1.8,0-2.2,1.3-2.2,2c0,1.2,0.8,2.1,2.2,2.1c1,0,2.3-0.5,2.3-2.1C61,105.8,60.3,104.8,58.7,104.9z M0,0v133.8h90.7V0H0z M34.8,23c0-0.3,0.1-0.5,0.3-0.7c0.2-0.2,0.4-0.3,0.8-0.3H39c0.9,0,1.7,0.3,2.3,0.7c0.6,0.5,0.9,1.1,0.8,1.9L42,82.4c0,0.9,0.3,1.6,0.8,2.1c0.5,0.6,1.4,0.8,2.5,0.8c1.1,0,2-0.3,2.5-0.8s0.8-1.2,0.8-2.1l-0.1-57.8c0-0.7,0.3-1.3,0.9-1.8c0.6-0.5,1.3-0.7,2.3-0.7h3.1c0.3,0,0.6,0.1,0.8,0.3c0.2,0.2,0.3,0.4,0.3,0.7C56,43,56.1,63,56.1,83c0,2.6-0.9,4.5-2.8,5.8c-1.9,1.3-4.6,1.8-8,1.8c-1.7,0-3.2-0.2-4.5-0.5c-1.3-0.3-2.4-0.8-3.4-1.4c-1-0.6-1.7-1.4-2.2-2.4s-0.7-2.1-0.7-3.4C34.6,62.9,34.7,43,34.8,23z M22.3,92.2c-0.5-0.4-0.8-1-0.8-1.9l0.2-30.5c-2.1,0.4-4.2,0.8-6.3,1.2c0,10.5-0.1,21-0.1,31.5c0,1-0.3,1.8-0.8,2.6s-1.3,1.4-2.3,1.9c-1,0.4-1.9,0.9-2.9,1.4c-0.4,0.2-0.6,0.2-0.8,0.1c-0.2-0.1-0.3-0.4-0.3-0.7V23.2c0-0.3,0.1-0.6,0.3-0.8c0.2-0.2,0.4-0.3,0.8-0.3h3.1c0.9,0,1.7,0.2,2.3,0.7c0.6,0.5,0.9,1.1,0.8,2l-0.1,30.5c2.1-0.4,4.2-0.7,6.3-1c0.1-9.9,0.1-19.7,0.2-29.6c0-0.8,0.3-1.4,0.9-1.9c0.6-0.5,1.3-0.7,2.3-0.7h3.1c0.3,0,0.6,0.1,0.8,0.3c0.2,0.2,0.3,0.4,0.3,0.7C29.2,45.5,29,68,28.9,90.3c0,0.3-0.1,0.6-0.3,0.8c-0.2,0.3-0.4,0.4-0.8,0.5c-1,0.3-2.1,0.5-3.1,0.8C23.6,92.6,22.8,92.6,22.3,92.2z M36.6,111.5H25.3V99.3H30v9.2h6.6V111.5z M46.4,111.6c-0.1-0.4-0.2-0.5-0.2-0.9c-1.1,0.4-2.8,1.1-4.8,1.1c-1.1,0-2.2-0.2-3.1-0.8c-0.7-0.5-1.1-1.2-1.1-2.1c0-0.6,0.2-1.2,0.5-1.6s0.8-0.8,1.7-1.2c1.6-0.4,4.7-0.5,6.8-0.5c0-0.2,0-0.4-0.2-0.7c-0.2-0.2-0.6-0.5-1.9-0.5c-0.2,0-0.9,0-1.4,0.1c-0.8,0.2-0.9,0.5-1,0.7h-4.2c0.1-0.6,0.3-1.6,1.5-2.3c0.9-0.5,2.6-0.8,4.9-0.8c2,0,3.8,0.2,4.9,0.7c1.6,0.7,1.6,2.1,1.6,2.7v4.8c0,0.7,0.1,0.9,0.5,1.3H46.4z M60,111.7c-1.7,0-2.7-0.6-3.4-1v0.8h-4.4V99.4h4.4v3.8c0.6-0.4,1.6-1.1,3.7-1.1c2.8,0,5.1,1.7,5.1,4.8C65.4,110.5,62.4,111.7,60,111.7z M82.4,89.4c0,3-0.8,4.9-2.6,5.7c-1.7,0.9-4.2,0.6-7.5-0.6c-3.1-1.1-6.2-2-9.4-2.7c-0.4-0.1-0.6-0.3-1-0.6c-0.2-0.2-0.3-0.5-0.3-0.8c-0.1-22.5-0.3-44.9-0.4-67.4c0-0.3,0.1-0.5,0.3-0.7s0.4-0.3,0.8-0.3h9.5c3.2,0,5.8,0.8,7.7,2.5c2,1.7,2.9,4,2.9,6.9V89.4z`;

function HudLabLogo({
  size = 40,
  color = "white",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 90.7 133.8"
      style={{ fill: color, width: size, height: size }}
    >
      <g>
        <path d={logoPath} />
      </g>
    </svg>
  );
}

// ─── CSS Animations ──────────────────────────────────────────────────────────
const cssAnimations = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
  @keyframes barGrow { from{width:0} to{width:var(--w)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 20px oklch(0.8777 0.2202 154.2614 / 0.3)} 50%{box-shadow:0 0 40px oklch(0.8777 0.2202 154.2614 / 0.7)} }
  .fade-up { animation: fadeUp 0.6s ease forwards; }
  .fade-up-2 { animation: fadeUp 0.6s ease 0.15s forwards; opacity:0; }
  .fade-up-3 { animation: fadeUp 0.6s ease 0.3s forwards; opacity:0; }
  .fade-up-4 { animation: fadeUp 0.6s ease 0.45s forwards; opacity:0; }
  .fade-in { animation: fadeIn 0.8s ease forwards; }
  .scale-in { animation: scaleIn 0.5s ease forwards; }
  .glow { animation: glow 2s ease-in-out infinite; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  button:focus { outline: none; }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    inset: 0,
    background:
      "linear-gradient(135deg, #050510 0%, #0d0d1a 50%, #050510 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', -apple-system, sans-serif",
    overflow: "hidden",
    color: "white",
  },
  slide: {
    width: "100%",
    maxWidth: 960,
    padding: "0 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
  },
  nav: {
    position: "fixed",
    bottom: 56,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  navBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s",
  },
  counter: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: 500,
    minWidth: 60,
    textAlign: "center",
  },
  dots: {
    position: "fixed",
    bottom: 20,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    gap: 6,
    zIndex: 10,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    transition: "all 0.3s",
    padding: 0,
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: "28px 32px",
    width: "100%",
  },
  bigNum: {
    fontSize: "clamp(42px, 7vw, 80px)",
    fontWeight: 800,
    background: `linear-gradient(135deg, ${P}, oklch(0.9 0.18 154))`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    lineHeight: 1,
  },
  tag: {
    display: "inline-block",
    padding: "4px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  logoBar: {
    position: "fixed",
    top: 16,
    left: 24,
    display: "flex",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
};

// ─── Bar Chart Helper ──────────────────────────────────────────────────────────
function Bar({
  label,
  value,
  max,
  color,
  fmt,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  fmt: (v: number) => string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.75)",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>
          {fmt(value)}
        </span>
      </div>
      <div
        style={{
          height: 10,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 5,
            transition: "width 1s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── March proportion helper ──────────────────────────────────────────────────
// Parses "DD/MM" into a Date in 2026
function parsePDay(s: string): Date {
  const [d, m] = s.trim().split("/").map(Number);
  return new Date(2026, m - 1, d);
}
// Returns the fraction of the weekly period that falls within March 2026
function marchProportion(periodo: string): number {
  const parts = periodo.split(" a ");
  if (parts.length !== 2) return 0;
  try {
    const start = parsePDay(parts[0]);
    const end = parsePDay(parts[1]);
    const mar1 = new Date(2026, 2, 1); // 1 Mar
    const mar31 = new Date(2026, 2, 31); // 31 Mar
    const DAY = 864e5;
    const totalDays = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    const intStart = new Date(Math.max(start.getTime(), mar1.getTime()));
    const intEnd = new Date(Math.min(end.getTime(), mar31.getTime()));
    const daysInMarch = Math.max(
      0,
      Math.round((intEnd.getTime() - intStart.getTime()) / DAY) + 1,
    );
    return totalDays > 0 ? daysInMarch / totalDays : 0;
  } catch {
    return 0;
  }
}

// ─── Slide Header ──────────────────────────────────────────────────────────────
function SlideHeader({
  title,
  badge,
  badgeColor,
}: {
  title: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 32,
      }}
      className="fade-up"
    >
      <div
        style={{
          width: 4,
          height: 32,
          borderRadius: 2,
          background: P,
          flexShrink: 0,
        }}
      />
      <h2
        style={{
          fontSize: "clamp(22px, 4vw, 36px)",
          fontWeight: 800,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </h2>
      {badge && (
        <span
          style={{
            ...styles.tag,
            background: badgeColor || P,
            color: "black",
            marginLeft: 8,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");

// ─── Slide Components ─────────────────────────────────────────────────────────

function Slide0() {
  return (
    <div style={{ textAlign: "center", width: "100%" }}>
      <div className="fade-up" style={{ marginBottom: 32 }}>
        <HudLabLogo size={72} color={P} />
      </div>
      <div className="fade-up-2" style={{ marginBottom: 16 }}>
        <span
          style={{
            ...styles.tag,
            background: P15,
            color: P,
            border: `1px solid ${P30}`,
          }}
        >
          Março · 2026
        </span>
      </div>
      <h1
        className="fade-up-3"
        style={{
          fontSize: "clamp(36px, 7vw, 80px)",
          fontWeight: 900,
          letterSpacing: -2,
          lineHeight: 1.1,
          marginBottom: 20,
        }}
      >
        Resultados do
        <br />
        <span
          style={{
            background: `linear-gradient(135deg,${P},oklch(0.95 0.15 154))`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Mês
        </span>
      </h1>
      <p
        className="fade-up-4"
        style={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}
      >
        Visão geral · Comercial · Designers · Tráfego
      </p>
      <div
        className="fade-up-4"
        style={{
          marginTop: 48,
          display: "flex",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {[
          ["55", "Vendas"],
          ["R$ 85k", "Faturamento"],
          ["35d", "Lead Time médio"],
        ].map(([n, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: P }}>{n}</div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
                marginTop: 4,
              }}
            >
              {l}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide1() {
  const meta = 65000;
  const realizado = 85369.48;
  const pct = Math.round((realizado / meta) * 100); // 131%
  const barWidth = Math.min(pct, 100); // capped visually at 100% but label shows 131%

  return (
    <div style={{ width: "100%" }}>
      <SlideHeader title="Faturamento" badge="Março 2026" />
      <div
        className="fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Total Faturado",
            value: "R$ 85.369,48",
            sub: "vendas ganhas",
            color: P,
          },
          {
            label: "Total de Vendas",
            value: "55",
            sub: "negócios fechados",
            color: "#22d3ee",
          },
          {
            label: "Ticket Médio",
            value: "R$ 1.552,17",
            sub: "por negócio",
            color: "#a78bfa",
          },
        ].map((k) => (
          <div key={k.label} style={{ ...styles.card, textAlign: "center" }}>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: "clamp(22px, 3.5vw, 36px)",
                fontWeight: 800,
                color: k.color,
                lineHeight: 1,
              }}
            >
              {k.value}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
                marginTop: 8,
              }}
            >
              {k.sub}
            </div>
          </div>
        ))}
      </div>
      {/* Meta OTE */}
      <div
        className="fade-up-3"
        style={{
          ...styles.card,
          background: `oklch(0.8777 0.2202 154.2614 / 0.06)`,
          border: `1px solid ${P30}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Meta OTE — Março
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.3)",
                marginTop: 2,
              }}
            >
              Meta: R$ 65.000,00 · Realizado: R$ 85.369,48
            </div>
          </div>
          <div
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              background: P,
              color: "black",
              fontWeight: 800,
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            ✓ META SUPERADA · {pct}%
          </div>
        </div>
        <div
          style={{
            height: 12,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 6,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${barWidth}%`,
              background: `linear-gradient(90deg,${P},oklch(0.95 0.15 154))`,
              borderRadius: 6,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          <span>R$ 0</span>
          <span style={{ color: P, fontWeight: 600 }}>R$ 65k (meta)</span>
          <span style={{ color: P }}>R$ 85k ✓</span>
        </div>
      </div>
    </div>
  );
}

function Slide2() {
  const sellers = [
    { name: "Schay", value: 72690.26, deals: 45, color: P },
    { name: "Raisa", value: 11009.32, deals: 6, color: "#22d3ee" },
    { name: "Willian", value: 160, deals: 1, color: "#a78bfa" },
    {
      name: "Sem vendedor",
      value: 1509.9,
      deals: 3,
      color: "rgba(255,255,255,0.3)",
    },
  ];
  const max = sellers[0].value;
  return (
    <div style={{ width: "100%" }}>
      <SlideHeader title="Vendas por Vendedor" />
      <div className="fade-up-2" style={styles.card}>
        {sellers.map((s) => (
          <div key={s.name} style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: s.color,
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.35)",
                    background: "rgba(255,255,255,0.06)",
                    padding: "2px 8px",
                    borderRadius: 99,
                  }}
                >
                  {s.deals} vendas
                </span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>
                {fmtBRL(s.value)}
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.07)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(s.value / max) * 100}%`,
                  background: s.color,
                  borderRadius: 4,
                  transition: "width 1s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide3() {
  const buckets = [
    { label: "0–7 dias", count: 21, color: "#22d3ee", pct: 38 },
    { label: "8–30 dias", count: 12, color: P, pct: 22 },
    { label: "31–60 dias", count: 11, color: "#a78bfa", pct: 20 },
    { label: "60+ dias", count: 11, color: "#f43f5e", pct: 20 },
  ];
  return (
    <div style={{ width: "100%" }}>
      <SlideHeader title="Lead Time" />
      <div
        className="fade-up-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}
      >
        <div
          style={{
            ...styles.card,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Média geral
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: P,
              lineHeight: 1,
            }}
          >
            35
          </div>
          <div
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.5)",
              marginTop: 8,
            }}
          >
            dias
          </div>
        </div>
        <div style={styles.card}>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 16,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Distribuição
          </div>
          {buckets.map((b) => (
            <div key={b.label} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {b.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: b.color }}>
                  {b.count} vendas · {b.pct}%
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${b.pct}%`,
                    background: b.color,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const UTM_COLORS = [
  P,
  "#22d3ee",
  "#a78bfa",
  "#f43f5e",
  "#fbbf24",
  "#34d399",
  "#f97316",
];

function Slide4() {
  const [sources, setSources] = useState<
    {
      label: string;
      deals: number;
      value: number;
      pct: number;
      color: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUTM() {
      try {
        const res = await fetch(
          "/api/deals-cache?startDate=2026-03-01&endDate=2026-03-31",
        );
        if (!res.ok) return;
        const data = await res.json();
        const deals: Record<string, string | number>[] = (
          data.deals || []
        ).filter(
          (d: Record<string, string | number>) => String(d.status) === "1",
        );
        // Group by utm-medium / utm-source like the Dashboard
        const groups: Record<string, { deals: number; value: number }> = {};
        for (const deal of deals) {
          const medium =
            typeof deal["utm-medium"] === "string"
              ? deal["utm-medium"].trim()
              : "";
          const source =
            typeof deal["utm-source"] === "string"
              ? deal["utm-source"].trim()
              : "";
          let key =
            medium && source
              ? `${medium} / ${source}`
              : medium || source || "Não informado";
          if (!groups[key]) groups[key] = { deals: 0, value: 0 };
          groups[key].deals += 1;
          groups[key].value += Number(deal.value || 0) / 100;
        }
        const totalDeals = deals.length || 1;
        const sorted = Object.entries(groups)
          .sort((a, b) => b[1].deals - a[1].deals)
          .map(([label, g], i) => ({
            label,
            deals: g.deals,
            value: g.value,
            pct: Math.round((g.deals / totalDeals) * 100),
            color: UTM_COLORS[i % UTM_COLORS.length],
          }));
        setSources(sorted);
      } catch (e) {
        console.error("Erro ao buscar UTM:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchUTM();
  }, []);

  const topSources = sources.slice(0, 6);
  const maxDeals = topSources[0]?.deals || 1;

  return (
    <div style={{ width: "100%" }}>
      <SlideHeader title="Fontes de Venda" badge="Origem de Vendas (UTM)" />
      {loading ? (
        <div
          className="fade-up-2"
          style={{
            ...styles.card,
            textAlign: "center",
            padding: 40,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Carregando dados UTM…
        </div>
      ) : (
        <div className="fade-up-2" style={styles.card}>
          {topSources.map((s) => (
            <div key={s.label} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: s.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.06)",
                      padding: "2px 8px",
                      borderRadius: 99,
                    }}
                  >
                    {s.deals} vendas
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: s.color }}
                  >
                    {fmtBRL(s.value)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.4)",
                      minWidth: 36,
                      textAlign: "right",
                    }}
                  >
                    {s.pct}%
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: 8,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(s.deals / maxDeals) * 100}%`,
                    background: s.color,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Slide5({
  trafficData,
  loading,
}: {
  trafficData: TrafficRow | null;
  loading: boolean;
}) {
  const investimento = trafficData?.investimento ?? null;
  const totalLeads = trafficData?.leads ?? null;
  const faturamento = 85369.48;
  const roas = investimento ? faturamento / investimento : null;

  return (
    <div style={{ width: "100%" }}>
      <SlideHeader
        title="Investimento em Tráfego"
        badge="Análise Cadastros · Mar/26"
        badgeColor="#1877f2"
      />
      <div
        className="fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Total Investido · Mar/26
          </div>
          {loading ? (
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
              }}
            >
              Carregando…
            </div>
          ) : investimento ? (
            <>
              <div
                style={{
                  fontSize: "clamp(28px, 4vw, 48px)",
                  fontWeight: 900,
                  color: P,
                  lineHeight: 1,
                }}
              >
                {fmtBRL(investimento)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.35)",
                  marginTop: 8,
                }}
              >
                via Meta Ads
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.3)",
                marginTop: 12,
              }}
            >
              Dado não disponível
            </div>
          )}
        </div>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ROAS · Retorno sobre anúncio
          </div>
          {loading ? (
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
              }}
            >
              Carregando…
            </div>
          ) : roas ? (
            <>
              <div
                style={{
                  fontSize: "clamp(28px, 4vw, 48px)",
                  fontWeight: 900,
                  color: "#22d3ee",
                  lineHeight: 1,
                }}
              >
                {roas.toFixed(2)}x
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.35)",
                  marginTop: 8,
                }}
              >
                R$ {roas.toFixed(2)} retornados por R$ 1,00 investido
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.3)",
                marginTop: 12,
              }}
            >
              Aguardando investimento
            </div>
          )}
        </div>
      </div>
      <div className="fade-up-3" style={{ ...styles.card }}>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Comparativo · 4 semanas de março
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {[
            {
              label: "Total Leads",
              value: totalLeads ? fmtNum(totalLeads) : "—",
              color: "#22d3ee",
            },
            {
              label: "Investimento",
              value: investimento ? fmtBRL(investimento) : "—",
              color: "#1877f2",
            },
            { label: "Faturamento", value: fmtBRL(faturamento), color: P },
            {
              label: "Saldo",
              value: investimento ? fmtBRL(faturamento - investimento) : "—",
              color: "#a78bfa",
            },
          ].map((it) => (
            <div key={it.label} style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.35)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {it.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: it.color }}>
                {it.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slide6({
  trafficData,
  loading,
}: {
  trafficData: TrafficRow | null;
  loading: boolean;
}) {
  const investimento = trafficData?.investimento ?? null;
  const cpl = trafficData?.custoPorLead ?? null;
  const totalVendas = 55;
  const custoNF = investimento ? investimento / totalVendas : null;
  const faturamento = 85369.48;
  const custoPctFaturamento = investimento
    ? (investimento / faturamento) * 100
    : null;

  return (
    <div style={{ width: "100%" }}>
      <SlideHeader
        title="Custo por Negócio Fechado"
        badge="CPNF"
        badgeColor={P}
      />
      <div
        className="fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Custo por Lead (CPL)",
            value: loading ? "…" : cpl ? fmtBRL(cpl) : "—",
            sub: "médio · planilha tráfego",
            color: "#22d3ee",
          },
          {
            label: "Custo por NF",
            value: loading ? "…" : custoNF ? fmtBRL(custoNF) : "—",
            sub: investimento
              ? `${fmtBRL(investimento)} ÷ ${totalVendas} vendas`
              : "aguardando investimento",
            color: P,
            highlight: true,
          },
          {
            label: "% do Faturamento",
            value: loading
              ? "…"
              : custoPctFaturamento
                ? `${custoPctFaturamento.toFixed(1)}%`
                : "—",
            sub: "investimento sobre receita",
            color: "#a78bfa",
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              ...styles.card,
              textAlign: "center",
              ...(k.highlight && investimento
                ? { border: `1px solid ${P30}`, background: P15 }
                : {}),
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: "clamp(20px, 3vw, 36px)",
                fontWeight: 900,
                color: k.color,
                lineHeight: 1,
              }}
            >
              {k.value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              {k.sub}
            </div>
          </div>
        ))}
      </div>
      <div className="fade-up-3" style={{ ...styles.card }}>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Fórmula
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              label: "Investimento Meta",
              value: investimento ? fmtBRL(investimento) : "—",
              color: "#1877f2",
            },
            { label: "÷", value: "", color: "rgba(255,255,255,0.3)" },
            {
              label: "Negócios Fechados",
              value: totalVendas.toString(),
              color: "#a78bfa",
            },
            { label: "=", value: "", color: "rgba(255,255,255,0.3)" },
            { label: "CPNF", value: custoNF ? fmtBRL(custoNF) : "—", color: P },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              {item.label !== "÷" && item.label !== "=" ? (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{ fontSize: 18, fontWeight: 800, color: item.color }}
                  >
                    {item.value}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontSize: 24,
                    color: "rgba(255,255,255,0.3)",
                    marginTop: 16,
                  }}
                >
                  {item.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slide7({
  trafficData,
  loading,
}: {
  trafficData: TrafficRow | null;
  loading: boolean;
}) {
  const custoCadastro = trafficData?.custoMockup ?? null;
  const cadastros = trafficData?.mockup ?? null;
  const leads = trafficData?.leads ?? null;
  const pctConversao = trafficData?.percentualConversao ?? null;
  const totalMockups = 388;

  return (
    <div style={{ width: "100%" }}>
      <SlideHeader
        title="Custo por Mockup"
        badge="Análise Cadastros"
        badgeColor="#3b82f6"
      />
      <div
        className="fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Leads Meta",
            value: loading ? "…" : leads ? fmtNum(leads) : "—",
            color: "#1877f2",
          },
          {
            label: "Mockups",
            value: loading ? "…" : cadastros ? fmtNum(cadastros) : "—",
            color: "#22d3ee",
          },
          {
            label: "% Conversão",
            value: loading
              ? "…"
              : pctConversao
                ? `${pctConversao.toFixed(1)}%`
                : "—",
            color: P,
            highlight: true,
          },
          {
            label: "Custo / Mockup",
            value: loading ? "…" : custoCadastro ? fmtBRL(custoCadastro) : "—",
            color: "#a78bfa",
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              ...styles.card,
              textAlign: "center",
              ...(k.highlight && pctConversao
                ? { border: `1px solid ${P30}`, background: P15 }
                : {}),
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: "clamp(18px, 2.5vw, 28px)",
                fontWeight: 900,
                color: k.color,
                lineHeight: 1,
              }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>
      <div className="fade-up-3" style={styles.card}>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Total de Mockups · Março 2026
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { name: "Pedro", total: 136, color: P },
            { name: "Felipe", total: 132, color: "#22d3ee" },
            { name: "Vitor", total: 120, color: "#a78bfa" },
            { name: "Total", total: totalMockups, color: "white" },
          ].map((d) => (
            <div
              key={d.name}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "12px 8px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 6,
                }}
              >
                {d.name}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: d.color }}>
                {d.total}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.3)",
                  marginTop: 4,
                }}
              >
                mockups
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slide8() {
  const designers = [
    {
      name: "Pedro",
      total: 136,
      feitos: 78,
      alt: 40,
      outros: 18,
      color: P,
    },
    {
      name: "Felipe",
      total: 132,
      feitos: 91,
      alt: 27,
      outros: 14,
      color: "#22d3ee",
    },
    {
      name: "Vitor",
      total: 120,
      feitos: 80,
      alt: 26,
      outros: 14,
      color: "#a78bfa",
    },
  ];
  return (
    <div style={{ width: "100%" }}>
      <SlideHeader title="Designers" />
      <div className="fade-up-2" style={styles.card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 1fr 1fr 80px",
            gap: 8,
            marginBottom: 12,
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          <span>Designer</span>
          <span style={{ textAlign: "center" }}>Mockups feitos</span>
          <span style={{ textAlign: "center" }}>Alterações</span>
          <span style={{ textAlign: "center" }}>Arq. Serigrafia</span>
          <span style={{ textAlign: "right" }}>Total</span>
        </div>
        {designers.map((d) => (
          <div
            key={d.name}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 1fr 1fr 80px",
              gap: 8,
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: d.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{d.name}</span>
            </div>
            {[
              { v: d.feitos, c: d.color },
              { v: d.alt, c: "#fbbf24" },
              { v: d.outros, c: "rgba(255,255,255,0.3)" },
            ].map((seg, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: seg.c }}>
                  {seg.v}
                </div>
                <div
                  style={{
                    height: 4,
                    background: "rgba(255,255,255,0.07)",
                    borderRadius: 2,
                    marginTop: 6,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(seg.v / d.total) * 100}%`,
                      background: seg.c,
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
            <div
              style={{
                textAlign: "right",
                fontSize: 18,
                fontWeight: 900,
                color: d.color,
              }}
            >
              {d.total}
            </div>
          </div>
        ))}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          <span>Total geral</span>
          <span style={{ fontWeight: 800, color: "white", fontSize: 16 }}>
            388 mockups
          </span>
        </div>
      </div>
    </div>
  );
}

function SlideOnlyTitle({
  title,
  color,
  msg,
}: {
  title: string;
  color: string;
  msg: string;
}) {
  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      <div
        className="fade-up"
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: color + "18",
          border: `2px solid ${color}44`,
          margin: "0 auto 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: color,
          }}
        />
      </div>
      <h2
        className="fade-up-2"
        style={{
          fontSize: "clamp(32px, 6vw, 64px)",
          fontWeight: 900,
          letterSpacing: -1,
          marginBottom: 20,
        }}
      >
        {title}
      </h2>
      <div
        className="fade-up-3"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          borderRadius: 12,
          background: color + "18",
          border: `1px solid ${color}33`,
          color,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {msg}
      </div>
    </div>
  );
}

function Slide9() {
  return (
    <SlideOnlyTitle
      title="Dados Tráfego Orgânico"
      color="#a78bfa"
      msg="Em breve · dados em análise"
    />
  );
}
function Slide10() {
  return (
    <SlideOnlyTitle
      title="Novo Financeiro"
      color="#22c55e"
      msg="Em breve · estrutura em desenvolvimento"
    />
  );
}
function Slide11() {
  return (
    <SlideOnlyTitle
      title="Análise Operação Gargalo Zero"
      color="#94a3b8"
      msg="Em breve · metodologia sendo definida"
    />
  );
}

// ─── TrafficRow type (matches /api/meta-marketing/traffic-analysis fields) ────
interface TrafficRow {
  periodo: string;
  investimento: number;
  leads: number;
  custoPorLead: number;
  mockup: number;
  mediaMock: number;
  pares: number;
  custoMockup: number;
  percentualConversao: number;
}

// ─── Slides ───────────────────────────────────────────────────────────────────
function renderSlide(idx: number, td: TrafficRow | null, loading: boolean) {
  switch (idx) {
    case 0:
      return <Slide0 />;
    case 1:
      return <Slide1 />;
    case 2:
      return <Slide2 />;
    case 3:
      return <Slide3 />;
    case 4:
      return <Slide4 />;
    case 5:
      return <Slide5 trafficData={td} loading={loading} />;
    case 6:
      return <Slide6 trafficData={td} loading={loading} />;
    case 7:
      return <Slide7 trafficData={td} loading={loading} />;
    case 8:
      return <Slide8 />;
    case 9:
      return <Slide9 />;
    case 10:
      return <Slide10 />;
    case 11:
      return <Slide11 />;
    default:
      return null;
  }
}

export default function ResultadosMarco2026() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [trafficData, setTrafficData] = useState<TrafficRow | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(true);
  const total = 12;

  // Fetch investment from Meta Ads API + aggregate March weeks from Google Sheets
  useEffect(() => {
    async function fetchTrafficData() {
      try {
        setTrafficLoading(true);

        // Run both requests in parallel
        const [sheetsRes, metaRes] = await Promise.all([
          fetch("/api/meta-marketing/traffic-analysis"),
          fetch(
            "/api/meta-marketing/insights?startDate=2026-03-01&endDate=2026-03-31",
          ),
        ]);

        // ── Google Sheets: proportional aggregation for March ─────────────────
        // Includes weeks that partially overlap March (e.g. "23/02 a 01/03")
        let totalLeads = 0,
          totalMockup = 0,
          totalPares = 0;
        if (sheetsRes.ok) {
          const data = await sheetsRes.json();
          const rows: TrafficRow[] = data.data || [];
          // Keep any week that has at least 1 day in March
          const overlapping = rows.filter(
            (r) => marchProportion(r.periodo) > 0,
          );
          for (const r of overlapping) {
            const prop = marchProportion(r.periodo);
            totalLeads += r.leads * prop;
            totalMockup += r.mockup * prop;
            totalPares += r.pares * prop;
          }
          // Round after accumulation
          totalLeads = Math.round(totalLeads);
          totalMockup = Math.round(totalMockup);
          totalPares = Math.round(totalPares);
        }

        // ── Meta Ads API: official spend ──────────────────────────────────────
        let metaSpend = 0;
        if (metaRes.ok) {
          const ins = await metaRes.json();
          metaSpend = parseFloat(ins.spend || "0");
        }

        // Use Meta spend as the source of truth for investimento
        const investimento = metaSpend;
        const custoPorLead = totalLeads > 0 ? investimento / totalLeads : 0;
        const custoMockup = totalMockup > 0 ? investimento / totalMockup : 0;
        const pctConversao =
          totalLeads > 0 ? (totalMockup / totalLeads) * 100 : 0;
        const mediaMock = totalMockup > 0 ? totalPares / totalMockup : 0;

        setTrafficData({
          periodo: "Março 2026",
          investimento,
          leads: totalLeads,
          custoPorLead,
          mockup: totalMockup,
          mediaMock,
          pares: totalPares,
          custoMockup,
          percentualConversao: pctConversao,
        });
      } catch (e) {
        console.error("Erro ao buscar dados de tráfego:", e);
      } finally {
        setTrafficLoading(false);
      }
    }
    fetchTrafficData();
  }, []);

  const go = useCallback(
    (dir: "next" | "prev") => {
      if (animating) return;
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setCurrent((c) => {
          if (dir === "next") return Math.min(c + 1, total - 1);
          return Math.max(c - 1, 0);
        });
        setAnimating(false);
      }, 300);
    },
    [animating],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") go("next");
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") go("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div style={styles.container}>
      <style>{cssAnimations}</style>

      {/* Logo */}
      <div style={styles.logoBar}>
        <HudLabLogo size={32} color={P} />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 1,
          }}
        >
          HUDLAB
        </span>
      </div>

      <div
        style={{
          ...styles.slide,
          opacity: animating ? 0 : 1,
          transform: animating
            ? direction === "next"
              ? "translateX(-30px)"
              : "translateX(30px)"
            : "translateX(0)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        {renderSlide(current, trafficData, trafficLoading)}
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        <button
          style={{ ...styles.navBtn, opacity: current === 0 ? 0.3 : 1 }}
          onClick={() => go("prev")}
          disabled={current === 0}
        >
          <ChevronLeft size={24} />
        </button>
        <span style={styles.counter}>
          {current + 1} / {total}
        </span>
        <button
          style={{ ...styles.navBtn, opacity: current === total - 1 ? 0.3 : 1 }}
          onClick={() => go("next")}
          disabled={current === total - 1}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Dots */}
      <div style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            style={{
              ...styles.dot,
              background: i === current ? P : "rgba(255,255,255,0.25)",
              width: i === current ? "24px" : "8px",
            }}
            onClick={() => {
              setDirection(i > current ? "next" : "prev");
              setCurrent(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
