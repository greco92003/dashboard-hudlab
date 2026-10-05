// Gera components/charts/brazil-map-geometry.ts a partir de scripts/assets/br.svg.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "scripts/assets/br.svg"), "utf8");
const OUT = join(root, "components/charts/brazil-map-geometry.ts");
const MAX_BYTES = 60 * 1024;

const feat = svg.slice(svg.indexOf('<g id="features">'), svg.indexOf('<g id="points">'));
const lab = svg.slice(svg.indexOf('<g id="label_points">'));

function parseRings(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  const rings = [];
  let cur = null, x = 0, y = 0, i = 0, cmd = "";
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    if (cmd === "z" || cmd === "Z") { cur = null; continue; }
    const rel = cmd === "m" || cmd === "l";
    const a = num(), b = num();
    x = rel ? x + a : a; y = rel ? y + b : b;
    if (cmd === "M" || cmd === "m") { cur = [[x, y]]; rings.push(cur); cmd = rel ? "l" : "L"; }
    else cur.push([x, y]);
  }
  return rings;
}

function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    let md = 0, mi = -1;
    for (let k = s + 1; k < e; k++) {
      const [px, py] = pts[k];
      const dist = len < 1e-6 ? Math.hypot(px - x1, py - y1) : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
      if (dist > md) { md = dist; mi = k; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, k) => keep[k]);
}

const area = (r) => { let a = 0; for (let k = 0; k < r.length; k++) { const [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
const stateArea = (rings) => rings.reduce((s, r) => s + area(r), 0);
const r1 = (n) => String(Math.round(n * 10) / 10);

const states = [];
for (const m of feat.matchAll(/<path\b[^>]*>/g)) {
  const t = m[0];
  const d = /\sd="([^"]*)"/.exec(t)?.[1], id = /\sid="BR(..)"/.exec(t)?.[1], name = /\sname="([^"]*)"/.exec(t)?.[1];
  if (d && id && name) states.push({ uf: id, name, rings: parseRings(d) });
}
const labels = {};
for (const m of lab.matchAll(/<circle\b[^>]*>/g)) {
  const t = m[0];
  const id = /\sid="BR(..)"/.exec(t)?.[1];
  if (id) labels[id] = { x: parseFloat(/\scx="([^"]*)"/.exec(t)[1]), y: parseFloat(/\scy="([^"]*)"/.exec(t)[1]) };
}
states.sort((a, b) => (a.uf < b.uf ? -1 : 1));

function build(tol) {
  let maxVar = 0, maxUf = "";
  const out = states.map((s) => {
    const before = Math.abs(stateArea(s.rings));
    let rings, v, t = tol;
    for (;;) {
      rings = s.rings.map((r) => rdp(r, t));
      const kept = rings.filter((r) => r.length >= 4);
      rings = kept.length ? kept : [rings.reduce((a, b) => (b.length > a.length ? b : a))];
      v = Math.abs(Math.abs(stateArea(rings)) - before) / before * 100;
      if (v <= 2 || t < 0.01) break;
      t /= 2; // estado pequeno: reduz a tolerância até a área ficar dentro de 2%
    }
    if (v > maxVar) { maxVar = v; maxUf = s.uf; }
    const d = rings.map((r) => "M" + r.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L") + "Z").join("");
    return { uf: s.uf, name: s.name, d, label: labels[s.uf] };
  });
  return { out, maxVar, maxUf };
}

let tol = 0.6, res = build(tol);
const size = (r) => Buffer.byteLength(render(r.out, tol));
function render(out, tol) {
  const items = out.map((s) => `  { uf: ${JSON.stringify(s.uf)}, name: ${JSON.stringify(s.name)}, d: ${JSON.stringify(s.d)}, label: { x: ${s.label.x}, y: ${s.label.y} } },`).join("\n");
  return `/*
 * Copyright (c) 2024 Pareto Softare, LLC DBA Simplemaps.com
 * Free for Commercial Use, full terms at https://simplemaps.com/resources/svg-license
 * Attribution is appreciated! https://simplemaps.com
 *
 * Simplificação Ramer–Douglas–Peucker, tolerância ${tol} (unidades do viewBox).
 */
// Gerado por scripts/gerar-mapa-brasil.mjs — não edite à mão.

export interface BrazilState {
  uf: string;
  name: string;
  d: string;
  label: { x: number; y: number };
}

export const BRAZIL_VIEWBOX: { width: number; height: number } = { width: 1000, height: 912 };

export const BRAZIL_STATES: readonly BrazilState[] = [
${items}
];
`;
}
while (size(res) > MAX_BYTES && tol < 1.2) { tol = Math.round((tol + 0.2) * 10) / 10; res = build(tol); }
const text = render(res.out, tol);
writeFileSync(OUT, text);
console.log(`tolerancia=${tol} tamanho=${(Buffer.byteLength(text) / 1024).toFixed(1)} KB maiorVariacaoArea=${res.maxVar.toFixed(3)}% (${res.maxUf})`);

if (process.env.PREVIEW) {
  const paths = res.out.map((s) => `<path d="${s.d}" fill="#6f9c76" stroke="#fff" stroke-width=".5"><title>${s.uf}</title></path>`).join("");
  writeFileSync(process.env.PREVIEW, `<!doctype html><body style="margin:0;background:#eee"><svg viewBox="0 0 1000 912" style="width:900px">${paths}</svg></body>`);
}
