# Mapa dos estados e cache da aba Regiões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Regiões do Meta Marketing ganha um mapa dos estados que segue o período da página, lê tudo pela rota com cache (sem os 11 s das views antigas) e tem o cache pré-aquecido depois dos syncs diários.

**Architecture:** Uma função SQL `get_desempenho_uf(inicio, fim)` (já aplicada) devolve UF × mês. A rota de cache serve dois relatórios dela: `regions` (período da página, para o mapa) e `regions-history` (histórico, para a tabela e a sazonalidade, que é só um agrupamento feito no cliente). O mapa é um componente genérico em `components/charts/` com a identidade da biblioteca própria (tooltip `TooltipBox`, animação `motion`, tokens `--chart-*`). Uma Vercel Cron pré-calcula os relatórios das janelas padrão.

**Tech Stack:** Next.js 16 (App Router), React, `motion/react`, Supabase Postgres 17, `node --test` com `--experimental-strip-types`.

Spec: `docs/superpowers/specs/2026-10-05-meta-marketing-seguranca-e-mapa-design.md` (seção PR 2). Esta implementação simplifica a spec em um ponto: em vez de três funções (`get_desempenho_uf`, `get_desempenho_uf_mes`, `get_sazonalidade_regiao`), uma só, com a sazonalidade agregada no cliente a partir do histórico (mesma conta de `v_sazonalidade_regiao`).

## Global Constraints

- Branch `meta-mapa-regioes` (sai de `meta-fase2-seguranca`; rebase em `main` depois do merge do PR #31).
- Projeto Supabase `ubqervuhvwnztxmsodlg`. Nada de `cascade`.
- Textos de interface, comentários e nomes de domínio em português, no tom do código vizinho.
- Cores só por tokens CSS (`var(--chart-1)`, `var(--chart-background)`, `var(--chart-scale-pattern-color)`, `var(--chart-tooltip-*)`, `var(--chart-grid)`, `var(--chart-foreground-muted)`), funcionando no tema claro e no escuro. Sem cores hexadecimais novas.
- O SVG original é da Simplemaps (uso comercial livre, atribuição apreciada): manter o aviso de licença como comentário no módulo gerado.
- Lint: `npx eslint <arquivos>` (o `next lint --file` não existe nesta versão).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- `supabase/migrations/20261005190825_get_desempenho_uf.sql` — feito.
- Modify `app/meta-marketing/report-catalog.ts` + teste: relatórios `regions` e `regions-history`.
- Create `scripts/assets/br.svg` (cópia do SVG enviado) e `scripts/gerar-mapa-brasil.mjs`.
- Create `components/charts/brazil-map-geometry.ts` (gerado) e `tests/brazil-map-geometry.test.mjs`.
- Create `components/charts/brazil-map-scale.ts` (faixas de cor, puro) e `tests/brazil-map-scale.test.mjs`.
- Create `components/charts/brazil-map.tsx` (componente).
- Create `app/meta-marketing/regioes-dados.ts` (somas por UF, sazonalidade, métrica; puro) e `tests/meta-marketing-regioes.test.mjs`.
- Modify `app/meta-marketing/components/regioes.tsx`.
- Create `lib/meta-marketing/report-cache.ts` (lógica de cache extraída da rota), modify `app/api/meta-marketing/report/route.ts`.
- Create `app/api/cron/prewarm-meta-marketing/route.ts`, modify `vercel.json`.
- Modify `package.json` (`test:meta-marketing` ganha os testes novos).

---

### Task 1: Função `get_desempenho_uf` no banco — FEITA

Aplicada como `20261005190825_get_desempenho_uf`, arquivo salvo. Conferido: zero diferença contra `v_desempenho_uf_mes` no histórico inteiro; setembro por período = setembro no histórico; 30 dias em 0,04 s; histórico em 0,3 s (6,3 s na primeira chamada com cache frio do banco).

Assinatura: `public.get_desempenho_uf(p_inicio date default null, p_fim date default null) returns table(uf character(2), region_group text, mes date, estacao text, spend numeric, leads_meta numeric, leads_ghl bigint, mockups bigint, vendas bigint, faturamento numeric)`. Só `service_role` executa.

---

### Task 2: Relatórios `regions` e `regions-history` no catálogo

**Files:**
- Modify: `app/meta-marketing/report-catalog.ts`
- Modify: `tests/meta-marketing-report-catalog.test.mjs`

**Interfaces:**
- Produces: `MarketingReport` passa a incluir `"regions"` (período, rpc `get_desempenho_uf`) e `"regions-history"` (sem período, rpc `get_desempenho_uf`).

- [ ] **Step 1: Atualizar o teste do catálogo**

No teste "catálogo cobre os relatórios que as telas usam", a lista esperada passa a ser:

```js
  assert.deepEqual(Object.keys(REPORTS).sort(), [
    "ads", "funnel", "health", "leads-without-sale", "pipelines", "regions", "regions-history",
    "sales-without-pairs", "series", "sources", "summary", "top-campaigns", "utm-unmatched",
  ]);
```

E acrescentar:

```js
test("regions usa período e regions-history não", () => {
  assert.deepEqual(parseReportRequest(q({ report: "regions", inicio: "2026-09-01", fim: "2026-09-30" })), {
    ok: true, report: "regions", rpc: "get_desempenho_uf", inicio: "2026-09-01", fim: "2026-09-30",
  });
  assert.deepEqual(parseReportRequest(q({ report: "regions-history" })), {
    ok: true, report: "regions-history", rpc: "get_desempenho_uf", inicio: null, fim: null,
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**: `npm run test:meta-marketing` → FAIL.

- [ ] **Step 3: Implementar**: em `REPORTS`, depois de `"sales-without-pairs"`:

```ts
  regions: { rpc: "get_desempenho_uf", period: true },
  "regions-history": { rpc: "get_desempenho_uf", period: false },
```

- [ ] **Step 4: Rodar e ver passar**: `npm run test:meta-marketing` → PASS.

- [ ] **Step 5: Commit** `feat: relatórios de regiões na rota do Meta Marketing`.

---

### Task 3: Geometria do mapa

**Files:**
- Create: `scripts/assets/br.svg` (copiar de `C:\Users\Greco\Downloads\br.svg`)
- Create: `scripts/gerar-mapa-brasil.mjs`
- Create: `components/charts/brazil-map-geometry.ts` (gerado pelo script, commitado)
- Create: `tests/brazil-map-geometry.test.mjs`
- Modify: `package.json` (`test:meta-marketing` inclui o teste novo; script `gerar:mapa-brasil`)

**Interfaces:**
- Produces (`components/charts/brazil-map-geometry.ts`):

```ts
export interface BrazilState {
  uf: string;        // "SP"
  name: string;      // "São Paulo"
  d: string;         // path simplificado
  label: { x: number; y: number };
}
export const BRAZIL_VIEWBOX: { width: number; height: number }; // 1000 x 912
export const BRAZIL_STATES: readonly BrazilState[];              // 27, ordem alfabética de uf
```

Estrutura do SVG: `<g id="features">` com 27 `<path d="..." id="BRXX" name="Nome">` e `<g id="label_points">` com `<circle cx cy id="BRXX" class="Nome">`. O `<g id="points">` (pontos 0, 1, 2) é descartado. `viewbox="0 0 1000 912"` (minúsculo no arquivo).

- [ ] **Step 1: Teste que falha**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from "../components/charts/brazil-map-geometry.ts";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

test("27 estados, cada um com caminho e rótulo dentro do mapa", () => {
  assert.deepEqual(BRAZIL_STATES.map((s) => s.uf), UFS);
  for (const s of BRAZIL_STATES) {
    assert.match(s.d, /^M[\d.\- ]/, s.uf);
    assert.ok(s.name.length > 2, s.uf);
    assert.ok(s.label.x > 0 && s.label.x < BRAZIL_VIEWBOX.width, s.uf);
    assert.ok(s.label.y > 0 && s.label.y < BRAZIL_VIEWBOX.height, s.uf);
  }
  assert.equal(BRAZIL_STATES.find((s) => s.uf === "SP").name, "São Paulo");
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Script gerador** `scripts/gerar-mapa-brasil.mjs` (Node puro, sem dependência nova):
  1. Lê `scripts/assets/br.svg`, extrai por regex os `<path ... d="..." id="BR(..)" name="...">` de dentro de `<g id="features">` e os `<circle class="..." cx cy id="BR(..)">` de `<g id="label_points">`.
  2. Simplifica cada `d`: converte os comandos relativos (`l`, `m`) em pontos absolutos, aplica Ramer–Douglas–Peucker com tolerância 0,6 unidade do viewBox por anel (mantém primeiro e último ponto de cada anel; anel com menos de 4 pontos depois da simplificação é descartado, salvo se for o único do estado) e reescreve como `M x y L x y ... Z` com uma casa decimal.
  3. Escreve `components/charts/brazil-map-geometry.ts` com o cabeçalho de licença da Simplemaps em comentário, a interface, `BRAZIL_VIEWBOX` e `BRAZIL_STATES` ordenado por `uf`, e a linha `// Gerado por scripts/gerar-mapa-brasil.mjs — não edite à mão.`
  4. Imprime o tamanho final em KB. Meta: abaixo de 60 KB. Se passar, aumentar a tolerância em 0,2 até caber (máximo 1,2) e registrar a tolerância usada no cabeçalho do arquivo gerado.

  `package.json`: `"gerar:mapa-brasil": "node scripts/gerar-mapa-brasil.mjs"`.

- [ ] **Step 4: Gerar e rodar o teste**: `npm run gerar:mapa-brasil && npm run test:meta-marketing` → PASS, tamanho < 60 KB.

- [ ] **Step 5: Conferência visual rápida**: gerar um HTML temporário no scratchpad com o `<svg viewBox>` e os 27 paths para ver que o contorno não ficou serrilhado nem com buracos (DF visível dentro de GO, ilhas do litoral ok). Não commitar o HTML.

- [ ] **Step 6: Commit** `feat: geometria dos estados do Brasil para o mapa`.

---

### Task 4: Lógica pura — faixas de cor e dados da aba

**Files:**
- Create: `components/charts/brazil-map-scale.ts`, `tests/brazil-map-scale.test.mjs`
- Create: `app/meta-marketing/regioes-dados.ts`, `tests/meta-marketing-regioes.test.mjs`
- Modify: `package.json` (`test:meta-marketing` inclui os dois testes)

**Interfaces:**

```ts
// components/charts/brazil-map-scale.ts
export const BRAZIL_MAP_STEPS = 5;
/** Limites superiores das faixas por quantil dos valores não nulos (até 4 cortes). */
export function quantileBreaks(values: number[], steps?: number): number[];
/** Faixa 0..steps-1 do valor; null quando o valor é null. */
export function stepFor(value: number | null, breaks: number[]): number | null;
/** Intensidade 0..1 da faixa; "sequential-inverted" inverte (menor valor = mais forte). */
export function stepIntensity(step: number, steps: number, scale: "sequential" | "sequential-inverted"): number;

// app/meta-marketing/regioes-dados.ts
export interface UfMesRow { uf: string; region_group: string | null; mes: string; estacao: string;
  spend: number; leads_meta: number; leads_ghl: number; mockups: number; vendas: number; faturamento: number; }
export interface UfTotal { uf: string; region_group: string | null; spend: number; mockups: number;
  vendas: number; faturamento: number; roas: number | null; custo_mockup: number | null; }
export interface SazonalidadeRow { region_group: string; estacao: string; spend: number; vendas: number;
  faturamento: number; roas: number | null; cpa: number | null; }
export type MetricaRegiao = "roas" | "spend" | "custo_mockup" | "faturamento";
export function somarPorUf(rows: UfMesRow[]): UfTotal[];          // números chegam como string do PostgREST: usar Number()
export function sazonalidade(rows: UfMesRow[]): SazonalidadeRow[]; // mesma conta de v_sazonalidade_regiao
export function valorMetrica(t: UfTotal, m: MetricaRegiao): number | null;
export const METRICAS_REGIAO: Record<MetricaRegiao, { label: string; escala: "sequential" | "sequential-inverted" }>;
```

Regras (copiar literalmente):
- `roas = spend > 0 ? faturamento / spend : null`; `custo_mockup = mockups > 0 ? spend / mockups : null`.
- `valorMetrica`: `spend` e `faturamento` devolvem o número, inclusive 0 (valor válido); `roas` e `custo_mockup` devolvem o campo, que pode ser `null`.
- `sazonalidade`: ignora linhas com `region_group` nulo; agrupa por `region_group` + `estacao`; `roas = round2(Σfat/Σspend)` se Σspend > 0, senão null; `cpa = round2(Σspend/Σvendas)` se Σvendas > 0, senão null (`round2 = Math.round(x*100)/100`).
- `METRICAS_REGIAO`: `roas` → "ROAS", sequential; `spend` → "Investimento", sequential; `custo_mockup` → "Custo/Mockup", sequential-inverted; `faturamento` → "Faturamento", sequential.
- `quantileBreaks`: ordena os valores, para `i` de 1 a `steps-1` pega `sorted[Math.floor(i * n / steps)]` e remove repetidos; com menos de 2 valores devolve `[]` (o valor único cai na faixa 0, ver teste).
- `stepFor`: primeiro índice `i` com `value < breaks[i]`; se nenhum, `breaks.length`. Escala a faixa para o intervalo `0..steps-1` quando houver menos cortes: `Math.round(i * (steps - 1) / Math.max(breaks.length, 1))`.
- `stepIntensity`: `sequential` → `0.2 + 0.8 * step / (steps - 1)`; invertida → mesma fórmula com `steps - 1 - step`.

- [ ] **Step 1: Testes que falham**

`tests/brazil-map-scale.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { quantileBreaks, stepFor, stepIntensity } from "../components/charts/brazil-map-scale.ts";

test("cinco faixas por quantil", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const breaks = quantileBreaks(values, 5);
  assert.deepEqual(breaks, [3, 5, 7, 9]);
  assert.equal(stepFor(1, breaks), 0);
  assert.equal(stepFor(4, breaks), 1);
  assert.equal(stepFor(10, breaks), 4);
  assert.equal(stepFor(null, breaks), null);
});

test("valores repetidos não criam faixas vazias", () => {
  const breaks = quantileBreaks([5, 5, 5, 5, 10], 5);
  assert.deepEqual(breaks, [5, 10]);
  assert.equal(stepFor(5, breaks), 2);
  assert.equal(stepFor(10, breaks), 4);
});

test("um valor só fica na faixa 0", () => {
  assert.deepEqual(quantileBreaks([7], 5), []);
  assert.equal(stepFor(7, []), 0);
});

test("escala invertida pinta o menor valor mais forte", () => {
  assert.equal(stepIntensity(0, 5, "sequential"), 0.2);
  assert.equal(stepIntensity(4, 5, "sequential"), 1);
  assert.equal(stepIntensity(0, 5, "sequential-inverted"), 1);
  assert.equal(stepIntensity(4, 5, "sequential-inverted"), 0.2);
});
```

Atenção ao caso "valores repetidos": com `[5,5,5,5,10]`, cortes brutos `[5,5,5,10]` → sem repetidos `[5,10]`; `stepFor(5)` → índice 1 → `round(1*4/2) = 2`; `stepFor(10)` → índice 2 → `round(2*4/2) = 4`. Com `[]`: `stepFor(7)` → índice 0 → `round(0*4/1) = 0`.

`tests/meta-marketing-regioes.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { somarPorUf, sazonalidade, valorMetrica } from "../app/meta-marketing/regioes-dados.ts";

const rows = [
  { uf: "SP", region_group: "Sudeste", mes: "2026-08-01", estacao: "inverno", spend: "100", leads_meta: 0, leads_ghl: 3, mockups: 2, vendas: 1, faturamento: "400" },
  { uf: "SP", region_group: "Sudeste", mes: "2026-09-01", estacao: "inverno", spend: 100, leads_meta: 0, leads_ghl: 1, mockups: 0, vendas: 1, faturamento: 200 },
  { uf: "RS", region_group: "Sul", mes: "2026-09-01", estacao: "inverno", spend: 0, leads_meta: 0, leads_ghl: 0, mockups: 0, vendas: 2, faturamento: 300 },
  { uf: "XX", region_group: null, mes: "2026-09-01", estacao: "inverno", spend: 50, leads_meta: 0, leads_ghl: 0, mockups: 0, vendas: 0, faturamento: 0 },
];

test("soma por UF e calcula ROAS e custo por mockup", () => {
  const sp = somarPorUf(rows).find((t) => t.uf === "SP");
  assert.deepEqual(sp, { uf: "SP", region_group: "Sudeste", spend: 200, mockups: 2, vendas: 2, faturamento: 600, roas: 3, custo_mockup: 100 });
  const rs = somarPorUf(rows).find((t) => t.uf === "RS");
  assert.equal(rs.roas, null);
  assert.equal(valorMetrica(rs, "roas"), null);
  assert.equal(valorMetrica(rs, "faturamento"), 300);
});

test("sazonalidade igual à view: ignora UF sem região", () => {
  assert.deepEqual(sazonalidade(rows).sort((a, b) => a.region_group.localeCompare(b.region_group)), [
    { region_group: "Sudeste", estacao: "inverno", spend: 200, vendas: 2, faturamento: 600, roas: 3, cpa: 100 },
    { region_group: "Sul", estacao: "inverno", spend: 0, vendas: 2, faturamento: 300, roas: null, cpa: 0 },
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar.** Incluir os dois arquivos em `test:meta-marketing`.
- [ ] **Step 3: Implementar os dois módulos** seguindo as regras acima.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat: faixas de cor do mapa e somas por estado da aba Regiões`.

---

### Task 5: Componente `BrazilMap`

**Files:**
- Create: `components/charts/brazil-map.tsx`

**Interfaces:**
- Consumes: `BRAZIL_STATES`, `BRAZIL_VIEWBOX` (Task 3); `quantileBreaks`, `stepFor`, `stepIntensity`, `BRAZIL_MAP_STEPS` (Task 4); `TooltipBox`, `TooltipContent`, `TooltipRow` de `./tooltip`; `DEFAULT_CHART_ENTER_TRANSITION` de `./animation`; `chartCssVars` de `./chart-context`; `cn` de `@/lib/utils`.
- Produces:

```ts
export interface BrazilMapDatum { uf: string; value: number | null }
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
  valueLabel?: string; // rótulo da linha principal do tooltip, ex.: "ROAS"
  className?: string;
}
export function BrazilMap(props: BrazilMapProps): JSX.Element;
```

Comportamento (requisitos):
1. `<div ref={containerRef} className={cn("relative w-full", className)}>` com um `<svg viewBox="0 0 {width} {height}" className="h-auto w-full" role="group" aria-label="Mapa dos estados do Brasil">`.
2. Cor de cada estado: `color-mix(in oklch, {color} {intensidade*100}%, var(--chart-background))` com a intensidade de `stepIntensity`. Estado sem dado (`value == null` ou UF ausente em `data`): preenchimento por `<pattern>` de hachura diagonal com traço `var(--chart-scale-pattern-color)` sobre `var(--chart-background)`; o id do pattern vem de `useId()` para não colidir entre instâncias.
3. Contorno: `stroke="var(--chart-background)"`, `strokeWidth={0.8}`, `vectorEffect="non-scaling-stroke"`. Selecionado: contorno `var(--chart-foreground)` com `strokeWidth={1.6}` e desenhado por último (renderizar o estado selecionado depois dos outros).
4. Hover/foco: os demais estados vão para `opacity: 0.35` com transição de 150 ms (mesmo efeito de esmaecer do `series-hover-dim`); o estado em foco fica com opacidade 1.
5. Entrada: cada `<motion.path>` entra com `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` e `transition={{ ...DEFAULT_CHART_ENTER_TRANSITION, duration: 0.6, delay: index * 0.015 }}`. Respeitar `useReducedMotion()` (sem animação quando reduzido).
6. Tooltip: `TooltipBox` posicionado no ponto do mouse relativo ao container (`x`, `y` em px, `containerWidth`/`containerHeight` do `getBoundingClientRect` atualizados por `ResizeObserver`), visível enquanto houver estado em hover/foco; dentro, `TooltipContent` com `title` = nome do estado e `rows` = `[{ color: <cor do estado>, label: valueLabel ?? "Valor", value: value == null ? "—" : formatValue(value) }, ...(tooltipRows?.(uf) ?? [])]`. Em foco por teclado, posicionar no ponto de rótulo do estado convertido para px.
7. Acessibilidade: cada estado `tabIndex={0}`, `role="button"`, `aria-pressed={selected}`, `aria-label="{nome}: {valor formatado ou 'sem dados'}"`; Enter/Espaço alterna a seleção (`onSelectUf(selected ? null : uf)`), Esc limpa (`onSelectUf(null)`); `focus-visible` com o mesmo contorno do selecionado.
8. DF: além do path, um `<circle>` clicável no ponto de rótulo, raio 7 (unidades do viewBox), com a mesma cor e os mesmos handlers, para dar área de clique.
9. Legenda abaixo do mapa: as 5 faixas como quadradinhos `size-2.5 rounded-sm` com a cor de cada faixa e o texto do limite (`formatValue`) no estilo `text-xs text-muted-foreground`, mais um item "Sem dados" com a hachura. A ordem é sempre da faixa 0 à 4 (valores menores à esquerda); na escala invertida a cor mais forte fica à esquerda. Com menos de 2 valores, a legenda mostra só "Sem comparação" e "Sem dados".
10. Clique no fundo (fora de estado) limpa a seleção.

- [ ] **Step 1: Implementar o componente** com os requisitos acima. Sem testes automatizados de DOM (o projeto não tem jsdom); a lógica testável já está na Task 4.
- [ ] **Step 2: Typecheck e eslint**: `npx tsc --noEmit -p . && npx eslint components/charts/brazil-map.tsx`.
- [ ] **Step 3: Commit** `feat: componente de mapa dos estados do Brasil`.

---

### Task 6: Aba Regiões com mapa, ranking e cache

**Files:**
- Modify: `app/meta-marketing/components/regioes.tsx`
- Modify: o componente que renderiza `<Regioes>` (procurar com `grep -rn "<Regioes" app/meta-marketing`) para passar `periodo` e `customRange` como as outras abas (ver como `<Anuncios>` recebe).

**Interfaces:**
- Consumes: `fetchMarketingReport`, `fetchMarketingSnapshot` (`../report-client`); `somarPorUf`, `sazonalidade`, `valorMetrica`, `METRICAS_REGIAO`, `type UfMesRow`, `type MetricaRegiao` (Task 4); `BrazilMap` (Task 5); `periodoParaDatas` (`@/lib/periodo`) e `janelaComparacao` (`../lib`) para o período, igual a `anuncios.tsx`.

Requisitos:
1. Remover `createClient` e as leituras de `v_desempenho_uf_mes`/`v_sazonalidade_regiao`. Buscar em paralelo, com `AbortController`:
   - `fetchMarketingReport<UfMesRow[]>("regions", inicio, fim)` com `inicio`/`fim` da janela da página (`janelaComparacao(...).inicio/fim`, recortado em 01/07/2026);
   - `fetchMarketingSnapshot<UfMesRow[]>("regions-history")`.
   Erro em uma das buscas mostra a mensagem no card correspondente, sem derrubar o outro.
2. Card novo no topo, "Mapa por estado": descrição curta com o período e a regra da métrica; `Select` de métrica com as quatro opções de `METRICAS_REGIAO` (padrão ROAS); à esquerda (`lg:col-span-2`) o `BrazilMap` com `data = somarPorUf(regions).map(t => ({ uf: t.uf, value: valorMetrica(t, metrica) }))`, `colorScale = METRICAS_REGIAO[metrica].escala`, `valueLabel = METRICAS_REGIAO[metrica].label`, `formatValue` = `x.toFixed(1)+"x"` para ROAS e `fmtBrl` para as outras, `tooltipRows` com Investimento, Mockups, Vendas e Faturamento do estado (`color: "var(--chart-grid)"`); à direita, "Top 5" com os cinco estados de melhor valor (maior, ou menor quando a escala é invertida; nulos fora), cada linha clicável selecionando o estado. No celular empilha.
3. A tabela estado × mês continua igual, mas alimentada por `regions-history` e com a métrica do mesmo `Select` (o seletor da tabela atual sai; Faturamento também vale na tabela, colorido como investimento). A linha do estado selecionado ganha `bg-muted` e, quando a seleção muda, `scrollIntoView({ block: "nearest", behavior: "smooth" })` (ref por UF).
4. Sazonalidade: `sazonalidade(regionsHistory)`, mesmos cards de hoje.
5. Recarregar (`refreshKey`) e trocar período refazem as buscas; trocar métrica não busca de novo.
6. Estados de carregamento com `Skeleton` no lugar de cada card.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: tsc, eslint nos arquivos alterados, `npm run test:meta-marketing`.**
- [ ] **Step 3: Conferir no navegador** (`preview_start` / servidor já rodando em `localhost:3000`, logado como aprovado): mapa com cores, tooltip, clique destacando a linha, temas claro e escuro, 375 px. Se não houver sessão, registrar no relatório e seguir.
- [ ] **Step 4: Commit** `feat: mapa dos estados na aba Regiões, lendo pela rota com cache`.

---

### Task 7: Pré-aquecimento do cache depois dos syncs

**Files:**
- Create: `lib/meta-marketing/report-cache.ts`
- Modify: `app/api/meta-marketing/report/route.ts`
- Create: `app/api/cron/prewarm-meta-marketing/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces (`lib/meta-marketing/report-cache.ts`, só servidor, `import "server-only"` se o projeto usar esse pacote; senão nada):

```ts
export type ParsedOk = Extract<ParsedReportRequest, { ok: true }>;
export interface ReportResult { data: unknown; updatedAt: string | null; stale: boolean }
/** O que a rota faz hoje: cache fresco → devolve; vencido → devolve e atualiza em segundo plano; sem cache → calcula. */
export async function serveReport(req: ParsedOk, background: (task: () => Promise<void>) => void):
  Promise<{ status: 200; body: ReportResult } | { status: 202; body: { pending: true } } | { status: 502; body: { error: string } }>;
/** Pré-aquecimento: recalcula se não estiver fresco, esperando terminar. Devolve "fresh" | "refreshed" | "busy". */
export async function warmReport(req: ParsedOk): Promise<"fresh" | "refreshed" | "busy">;
```

Requisitos:
1. Mover para `report-cache.ts`, sem mudar comportamento: `serviceClient`, `todaySaoPaulo`, `ttlMs`, `refresh`, a montagem da chave de cache, a leitura de cache + `sync_log`, a checagem de frescor, o `try_claim_meta_marketing_report` e o `summarizeTopCampaigns` do `responseData`. A rota fica só com: `requireApprovedUser`, `parseReportRequest`, `serveReport(parsed, after)` e a resposta com `HEADERS`.
2. `GET /api/cron/prewarm-meta-marketing`: `const denied = requireCronSecret(request); if (denied) return denied;` (de `@/lib/security/route-guards`). Monta a lista:
   - janela padrão "30d": `periodoParaDatas("30d")` → `janelaComparacao(inicio, fim)`; para cada relatório com período `summary`, `funnel`, `sources`, `ads`, `top-campaigns`, `sales-without-pairs`, `regions`: a janela `inicio..fim`, e também `atualFechado` (se diferente) e `anterior` (se houver) para `funnel` e `ads`, que a tela pede;
   - os relatórios sem período: `pipelines`, `health`, `utm-unmatched`, `leads-without-sale`, `regions-history`.
   Roda em sequência (não sobrecarregar o banco) com `warmReport`, e responde `{ ok: true, resultados: [{ report, inicio, fim, resultado, ms }] }` com `Cache-Control: no-store`. `export const maxDuration = 300`.
   Montar os pedidos com `parseReportRequest(new URLSearchParams(...))` para reaproveitar a validação.
3. `vercel.json`: novo item em `crons`: `{ "path": "/api/cron/prewarm-meta-marketing", "schedule": "45 12 * * *" }` (9h45 em Brasília) e em `functions`: `"app/api/cron/prewarm-meta-marketing/route.ts": { "maxDuration": 300 }`.

- [ ] **Step 1: Extrair e ligar a rota**; `npx tsc --noEmit -p .`, `npm run test:meta-marketing`.
- [ ] **Step 2: Rota de cron e `vercel.json`.**
- [ ] **Step 3: Testar localmente**: `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/prewarm-meta-marketing` (pegar `CRON_SECRET` de `.env.local` sem imprimir o valor) → 200 com a lista; segunda chamada → tudo `"fresh"`. Sem o cabeçalho → 401.
- [ ] **Step 4: Commit** `feat: cron que pré-aquece o cache do Meta Marketing depois dos syncs`.

---

### Task 8: PR e limpeza das views antigas (depois do deploy)

- [ ] **Step 1:** rebase em `main` (depois do merge do PR #31), push, PR com: o que muda, tempos medidos (11 s → 0,04 s / 0,3 s), reconciliação da Task 1, conferência no navegador.
- [ ] **Step 2:** depois do merge e do deploy, conferir em `query_logs` que `/rest/v1/v_desempenho_uf_mes` e `/rest/v1/v_sazonalidade_regiao` não recebem chamadas e que nenhuma view/função depende delas (`pg_depend`, `prosrc`).
- [ ] **Step 3:** migration `drop_views_regioes_antigas`:

```sql
-- A aba Regiões lê get_desempenho_uf pela rota de cache; as duas views
-- (11 s cada) ficaram sem uso. Sem CASCADE: se algo depender, o drop falha.
drop view if exists public.v_sazonalidade_regiao;
drop view if exists public.v_desempenho_uf_mes;
```

  Salvar o arquivo com a versão registrada, com a definição antiga das duas views em comentário para rollback, e commitar num PR curto.
