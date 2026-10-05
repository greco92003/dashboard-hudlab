# Meta Marketing fase 2 (segurança) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usuário logado e não aprovado deixa de ler qualquer dado do Meta Marketing; o navegador só acessa o módulo pela rota `/api/meta-marketing/report`.

**Architecture:** As leituras que o navegador fazia direto no banco viram relatórios da rota de cache existente, servidos por funções `security definer` executáveis só pelo `service_role`. O banco é fechado em duas migrations: A (antes do deploy, não quebra nada) e B (depois do deploy, tira o acesso que as telas antigas usavam).

**Tech Stack:** Next.js 15 (App Router), Supabase Postgres 17, `node --test` com `--experimental-strip-types`.

Spec: `docs/superpowers/specs/2026-10-05-meta-marketing-seguranca-e-mapa-design.md` (seção PR 1).

## Global Constraints

- Projeto Supabase: `ubqervuhvwnztxmsodlg`. Migrations aplicadas com `apply_migration`; o arquivo em `supabase/migrations/` leva a versão registrada pelo banco.
- Funções novas: `security definer`, `set search_path = ''` (nomes qualificados com `public.`), `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`.
- Nunca `cascade` em `drop`/`revoke`.
- Respostas da rota com `Cache-Control: private, no-store`.
- Comentários e textos de interface em português, no tom do código vizinho.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `meta-fase2-seguranca`.

## File Structure

- Create `app/meta-marketing/report-catalog.ts`: lista fechada de relatórios (nome → função SQL, se usa período) e `parseReportRequest`. Puro, sem dependência de servidor, importável pelo cliente e pelos testes.
- Modify `app/api/meta-marketing/report/route.ts`: usa o catálogo; relatórios sem período usam chave `:all`.
- Modify `app/meta-marketing/report-client.ts`: tipo vem do catálogo; nova `fetchMarketingSnapshot` para relatórios sem período.
- Modify `app/meta-marketing/components/saude.tsx`, `anuncios.tsx`, `visao-geral.tsx`: trocam leitura direta pela rota.
- Create `tests/meta-marketing-report-catalog.test.mjs`.
- Modify `package.json`: script `test:meta-marketing`.
- Create `supabase/migrations/<versão>_meta_fase2_seguranca_a.sql` e `<versão>_meta_fase2_seguranca_b.sql`.

---

### Task 1: Migration A no banco (aditiva)

**Files:**
- Create: `supabase/migrations/<versão>_meta_fase2_seguranca_a.sql`

**Interfaces:**
- Produces (SQL, só `service_role`):
  - `public.get_atribuicao_saude() returns setof public.v_atribuicao_saude`
  - `public.get_utm_sem_match() returns setof public.v_utm_sem_match` (no máximo 100 linhas)
  - `public.get_leads_sem_venda() returns setof public.v_leads_sem_venda`
  - `public.get_vendas_sem_pares(p_inicio date, p_fim date) returns setof public.v_vendas_sem_pares`

- [ ] **Step 1: Snapshot do estado atual (para rollback e para comparar depois)**

Rodar com `execute_sql` e guardar a saída no corpo do PR:

```sql
select p.oid::regprocedure::text as fn,
  array_to_string(array(select grantee::regrole::text || ':' || privilege_type
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))), ', ') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('_kpis_periodo','get_resumo_periodo','get_serie_diaria',
  'get_funil_etapas','get_desempenho_fonte','get_funnel_por_anuncio','get_nomes_pipelines',
  'reconciliacao_meta_ghl','sync_ghl_contact_tags');

select tablename, policyname, permissive, roles::text, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in
  ('meta_ad_attributes','meta_ad_creative_analysis','meta_ad_creative_insights','meta_ghl_ad_insights','ghl_contact_tags');
```

Dependências conferidas em 05/10 (refazer se o banco mudou): `v_pedidos_ganhos`
(security_invoker) lê `mv_contato_atribuicao`, `v_contatos_importados`
(security_invoker) lê `mv_contatos_importados`, `v_leads_sem_venda` lê `v_vendas`
e `get_followup_regua()` (invoker) cita essas fontes. Nenhuma é lida pelo
navegador nem por rota com o cliente do usuário (`/api/ghl/followup` usa
`service_role`) e nenhuma política RLS as cita, então o revoke não quebra nada.

```sql
select distinct dep.relname as depende_de, v.relname as view_que_usa
from pg_depend d join pg_rewrite r on r.oid = d.objid
join pg_class v on v.oid = r.ev_class join pg_class dep on dep.oid = d.refobjid
where dep.relname in ('v_vendas','mv_contato_atribuicao','mv_contatos_importados') and v.oid <> dep.oid;
```

- [ ] **Step 2: Aplicar a migration A**

`apply_migration` com nome `meta_fase2_seguranca_a` e este SQL:

```sql
-- Fase 2 do Meta Marketing (segurança), parte A: tudo o que pode entrar
-- antes do deploy das telas sem quebrar nada. A parte B tira o acesso que as
-- telas antigas ainda usam.

-- 1) Leituras que as telas faziam direto nas views passam a sair pela rota
--    /api/meta-marketing/report, que exige usuário aprovado e usa service_role.
create or replace function public.get_atribuicao_saude()
returns setof public.v_atribuicao_saude
language sql stable security definer set search_path = ''
as $$ select * from public.v_atribuicao_saude $$;

create or replace function public.get_utm_sem_match()
returns setof public.v_utm_sem_match
language sql stable security definer set search_path = ''
as $$ select * from public.v_utm_sem_match limit 100 $$;

create or replace function public.get_leads_sem_venda()
returns setof public.v_leads_sem_venda
language sql stable security definer set search_path = ''
as $$ select * from public.v_leads_sem_venda $$;

create or replace function public.get_vendas_sem_pares(p_inicio date, p_fim date)
returns setof public.v_vendas_sem_pares
language sql stable security definer set search_path = ''
as $$
  select * from public.v_vendas_sem_pares
  where dia_venda between p_inicio and p_fim
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_atribuicao_saude()',
    'public.get_utm_sem_match()',
    'public.get_leads_sem_venda()',
    'public.get_vendas_sem_pares(date,date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 2) Funções de relatório que o navegador não chama: só service_role (rota
--    e edge functions). get_nomes_pipelines fica para a parte B.
do $$
declare f text;
begin
  foreach f in array array[
    'public._kpis_periodo(date,date)',
    'public.get_resumo_periodo(date,date)',
    'public.get_serie_diaria(date,date)',
    'public.get_funil_etapas(date,date)',
    'public.get_desempenho_fonte(date,date)',
    'public.get_funnel_por_anuncio(date,date)',
    'public.reconciliacao_meta_ghl(date,date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 3) Função de trigger: só roda pelo trg_ghl_contact_tags, ninguém precisa
--    de EXECUTE nela.
revoke execute on function public.sync_ghl_contact_tags() from public, anon, authenticated;

-- 4) Views e MVs do módulo nunca recebem escrita pelo navegador.
do $$
declare r text;
begin
  foreach r in array array[
    'v_atribuicao_saude','v_leads_sem_venda','v_utm_sem_match','v_vendas_sem_pares',
    'v_vendas','v_desempenho_uf_mes','v_sazonalidade_regiao',
    'mv_contato_atribuicao','mv_contatos_importados'
  ] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', r);
  end loop;
end $$;

-- 5) Views e MVs que o navegador não lê: só service_role e funções do dono.
revoke select on public.v_vendas, public.mv_contato_atribuicao, public.mv_contatos_importados
  from anon, authenticated;

-- 6) Tabelas do módulo: "read authenticated" (true) somado ao
--    approved_user_gate permissivo liberava leitura a qualquer logado e
--    escrita pelo navegador ao aprovado. Fica só leitura para aprovado, como
--    deals_cache; quem grava são as edge functions com service_role.
do $$
declare t text;
begin
  foreach t in array array[
    'meta_ad_attributes','meta_ad_creative_analysis','meta_ad_creative_insights',
    'meta_ghl_ad_insights','ghl_contact_tags'
  ] loop
    execute format('drop policy if exists "read authenticated" on public.%I', t);
    execute format('drop policy if exists approved_user_gate on public.%I', t);
    execute format('drop policy if exists approved_read on public.%I', t);
    execute format(
      'create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
```

- [ ] **Step 3: Conferir o resultado**

```sql
select 'fn' as tipo, p.oid::regprocedure::text as obj,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
  has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('_kpis_periodo','get_resumo_periodo','get_serie_diaria',
  'get_funil_etapas','get_desempenho_fonte','get_funnel_por_anuncio','reconciliacao_meta_ghl',
  'get_atribuicao_saude','get_utm_sem_match','get_leads_sem_venda','get_vendas_sem_pares')
union all
select 'tabela', t, has_table_privilege('authenticated', format('public.%I', t), 'insert'), null
from unnest(array['meta_ad_attributes','meta_ad_creative_analysis','meta_ad_creative_insights',
  'meta_ghl_ad_insights','ghl_contact_tags']) t;
```

Esperado: `authenticated = false` em todas as linhas `fn` e `tabela`; `service_role = true` nas `fn`.

- [ ] **Step 4: Testar as funções novas como service_role**

```sql
select (select count(*) from public.get_atribuicao_saude()) as saude,
       (select count(*) from public.get_utm_sem_match()) as utm,
       (select count(*) from public.get_leads_sem_venda()) as frios,
       (select count(*) from public.get_vendas_sem_pares(current_date - 30, current_date)) as sem_pares;
```

Esperado: mesmas contagens das views (15, 0, 31 e as de `v_vendas_sem_pares` nos últimos 30 dias), sem erro.

- [ ] **Step 5: Salvar o arquivo com a versão registrada e commitar**

Pegar a versão com `select version from supabase_migrations.schema_migrations where name = 'meta_fase2_seguranca_a'`, gravar o SQL do Step 2 em `supabase/migrations/<versão>_meta_fase2_seguranca_a.sql` e:

```bash
git add supabase/migrations/*_meta_fase2_seguranca_a.sql
git commit -m "fix: Meta Marketing só para usuário aprovado, parte A no banco"
```

---

### Task 2: Catálogo de relatórios e rota

**Files:**
- Create: `app/meta-marketing/report-catalog.ts`
- Modify: `app/api/meta-marketing/report/route.ts`
- Create: `tests/meta-marketing-report-catalog.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: funções SQL da Task 1.
- Produces:
  - `type MarketingReport` (união das chaves de `REPORTS`)
  - `REPORTS: Record<MarketingReport, { rpc: string; period: boolean }>`
  - `parseReportRequest(params: URLSearchParams): { ok: true; report: MarketingReport; rpc: string; inicio: string | null; fim: string | null } | { ok: false }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/meta-marketing-report-catalog.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { parseReportRequest, REPORTS } from "../app/meta-marketing/report-catalog.ts";

const q = (obj) => new URLSearchParams(obj);

test("relatório com período exige datas válidas e em ordem", () => {
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-09-01", fim: "2026-09-30" })), {
    ok: true, report: "summary", rpc: "get_resumo_periodo", inicio: "2026-09-01", fim: "2026-09-30",
  });
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-09-30", fim: "2026-09-01" })), { ok: false });
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-02-30", fim: "2026-03-01" })), { ok: false });
  assert.deepEqual(parseReportRequest(q({ report: "summary" })), { ok: false });
});

test("período acima de 366 dias é recusado", () => {
  assert.deepEqual(parseReportRequest(q({ report: "ads", inicio: "2025-01-01", fim: "2026-09-30" })), { ok: false });
});

test("relatório sem período ignora datas", () => {
  assert.deepEqual(parseReportRequest(q({ report: "health" })), {
    ok: true, report: "health", rpc: "get_atribuicao_saude", inicio: null, fim: null,
  });
  assert.deepEqual(parseReportRequest(q({ report: "pipelines", inicio: "x", fim: "y" })), {
    ok: true, report: "pipelines", rpc: "get_nomes_pipelines", inicio: null, fim: null,
  });
});

test("relatório fora da lista e nomes herdados de Object são recusados", () => {
  for (const report of ["nada", "toString", "__proto__", "constructor", ""]) {
    assert.deepEqual(parseReportRequest(q({ report, inicio: "2026-09-01", fim: "2026-09-30" })), { ok: false });
  }
});

test("catálogo cobre os relatórios que as telas usam", () => {
  assert.deepEqual(Object.keys(REPORTS).sort(), [
    "ads", "funnel", "health", "leads-without-sale", "pipelines", "sales-without-pairs",
    "series", "sources", "summary", "top-campaigns", "utm-unmatched",
  ]);
});
```

- [ ] **Step 2: Adicionar o script e ver o teste falhar**

Em `package.json`, junto aos outros `test:*`:

```json
"test:meta-marketing": "node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test tests/meta-marketing-report-catalog.test.mjs tests/top-campaigns.test.mjs",
```

Run: `npm run test:meta-marketing`
Expected: FAIL (módulo `report-catalog.ts` não existe).

- [ ] **Step 3: Implementar o catálogo**

`app/meta-marketing/report-catalog.ts`:

```ts
// Lista fechada de relatórios que a rota /api/meta-marketing/report serve.
// Fica fora da rota para o cliente e os testes usarem os mesmos nomes.
export const REPORTS = {
  summary: { rpc: "get_resumo_periodo", period: true },
  series: { rpc: "get_serie_diaria", period: true },
  funnel: { rpc: "get_funil_etapas", period: true },
  sources: { rpc: "get_desempenho_fonte", period: true },
  ads: { rpc: "get_funnel_por_anuncio", period: true },
  "top-campaigns": { rpc: "get_funnel_por_anuncio", period: true },
  "sales-without-pairs": { rpc: "get_vendas_sem_pares", period: true },
  pipelines: { rpc: "get_nomes_pipelines", period: false },
  health: { rpc: "get_atribuicao_saude", period: false },
  "utm-unmatched": { rpc: "get_utm_sem_match", period: false },
  "leads-without-sale": { rpc: "get_leads_sem_venda", period: false },
} as const satisfies Record<string, { rpc: string; period: boolean }>;

export type MarketingReport = keyof typeof REPORTS;

export type ParsedReportRequest =
  | { ok: true; report: MarketingReport; rpc: string; inicio: string | null; fim: string | null }
  | { ok: false };

const MAX_PERIOD_MS = 366 * 86_400_000;

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseReportRequest(params: URLSearchParams): ParsedReportRequest {
  const report = params.get("report") ?? "";
  if (!Object.prototype.hasOwnProperty.call(REPORTS, report)) return { ok: false };
  const entry = REPORTS[report as MarketingReport];
  if (!entry.period) {
    return { ok: true, report: report as MarketingReport, rpc: entry.rpc, inicio: null, fim: null };
  }
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  if (!validDate(inicio) || !validDate(fim) || inicio > fim ||
      Date.parse(fim) - Date.parse(inicio) > MAX_PERIOD_MS) {
    return { ok: false };
  }
  return { ok: true, report: report as MarketingReport, rpc: entry.rpc, inicio, fim };
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npm run test:meta-marketing`
Expected: PASS (todos os testes, incluindo `top-campaigns`).

- [ ] **Step 5: Ligar a rota ao catálogo**

Em `app/api/meta-marketing/report/route.ts`:

1. Remover `REPORTS`, `type Report` e `validDate` locais; importar:

```ts
import { parseReportRequest, type MarketingReport } from "@/app/meta-marketing/report-catalog";
```

2. Trocar `ttlMs` por duas funções:

```ts
function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ttlMs(fim: string) {
  const today = todaySaoPaulo();
  if (fim >= today) return 30 * 60_000;
  const recent = new Date(`${today}T00:00:00Z`);
  recent.setUTCDate(recent.getUTCDate() - 28);
  return fim >= recent.toISOString().slice(0, 10) ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
}
```

3. `responseData(report: MarketingReport, payload: unknown)` (só troca o tipo).

4. `refresh` recebe os argumentos da RPC prontos:

```ts
async function refresh(
  supabase: ServiceClient, cacheKey: string, rpcName: string,
  args: { p_inicio: string; p_fim: string } | undefined, ttlUntil: string,
) {
  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) throw new Error(`${rpcName}: ${error.message}`);
  const refreshedAt = new Date();
  const { error: saveError } = await supabase.from("meta_marketing_report_cache")
    .update({
      payload: data,
      refreshed_at: refreshedAt.toISOString(),
      expires_at: new Date(refreshedAt.getTime() + ttlMs(ttlUntil)).toISOString(),
      claim_started_at: null,
    })
    .eq("cache_key", cacheKey);
  if (saveError) throw new Error(`Cache ${rpcName}: ${saveError.message}`);
  return { data, updatedAt: refreshedAt.toISOString() };
}
```

5. No `GET`, substituir a validação e o cálculo da chave:

```ts
  const parsed = parseReportRequest(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Relatório ou período inválido" }, { status: 400, headers: HEADERS });
  }
  const { report, rpc: rpcName } = parsed;
  // Relatório sem período é um retrato do momento: chave fixa e o dia de
  // hoje como período, o que dá a validade curta (30 min) do ttlMs.
  const today = todaySaoPaulo();
  const inicio = parsed.inicio ?? today;
  const fim = parsed.fim ?? today;
  const args = parsed.inicio && parsed.fim ? { p_inicio: parsed.inicio, p_fim: parsed.fim } : undefined;
  const periodKey = args ? `${inicio}:${fim}` : "all";
  // All current SQL reports cover every account in this Supabase project.
  // Keep scope and calculation version in the key to prevent later cross-account reuse.
  const cacheKey = `marketing:v1:project-all-accounts:America-Sao_Paulo:${rpcName}:${periodKey}`;
```

6. As duas chamadas de `refresh` passam a ser `refresh(serviceClient(), cacheKey, rpcName, args, fim)` e `refresh(supabase, cacheKey, rpcName, args, fim)`. O `try_claim_meta_marketing_report` continua recebendo `p_inicio: inicio, p_fim: fim`.

- [ ] **Step 6: Typecheck e lint**

Run: `npx tsc --noEmit -p . && npm run lint -- --file app/api/meta-marketing/report/route.ts --file app/meta-marketing/report-catalog.ts`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add app/meta-marketing/report-catalog.ts app/api/meta-marketing/report/route.ts tests/meta-marketing-report-catalog.test.mjs package.json
git commit -m "feat: rota do Meta Marketing serve saúde, UTMs, leads frios, vendas sem pares e pipelines"
```

---

### Task 3: Telas leem só pela rota

**Files:**
- Modify: `app/meta-marketing/report-client.ts`
- Modify: `app/meta-marketing/components/saude.tsx:3-4,61-82`
- Modify: `app/meta-marketing/components/anuncios.tsx:320-341`
- Modify: `app/meta-marketing/components/visao-geral.tsx:270-361`

**Interfaces:**
- Consumes: `MarketingReport` (Task 2).
- Produces: `fetchMarketingSnapshot<T>(report: MarketingReport, signal?: AbortSignal): Promise<MarketingReportResult<T>>`.

- [ ] **Step 1: Cliente**

Em `app/meta-marketing/report-client.ts`, trocar a declaração do tipo por re-export e extrair o laço para um helper interno:

```ts
import type { MarketingReport } from "./report-catalog";

export type { MarketingReport };

export interface MarketingReportResult<T> {
  data: T;
  updatedAt: string | null;
  stale: boolean;
}

export function fetchMarketingReport<T>(
  report: MarketingReport,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  return fetchReport<T>(report, new URLSearchParams({ report, inicio, fim }), signal);
}

/** Relatórios sem período (retrato do momento, cache de 30 min). */
export function fetchMarketingSnapshot<T>(
  report: MarketingReport,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  return fetchReport<T>(report, new URLSearchParams({ report }), signal);
}

async function fetchReport<T>(
  report: MarketingReport,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  const url = `/api/meta-marketing/report?${params.toString()}`;
  // (corpo do laço for/202/erro idêntico ao atual de fetchMarketingReport)
}
```

O corpo de `fetchReport` é o laço `for (let attempt = 0; attempt < 16; ...)` atual, sem mudança.

- [ ] **Step 2: Saúde**

Em `saude.tsx`, remover `import { createClient } ...`, importar `fetchMarketingSnapshot` de `../report-client` e trocar o `useEffect`:

```tsx
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetchMarketingSnapshot<SaudeRow[]>("health", controller.signal),
      fetchMarketingSnapshot<UtmSemMatchRow[]>("utm-unmatched", controller.signal),
    ]).then(([saude, utms]) => {
      if (controller.signal.aborted) return;
      setRows([...(saude.data ?? [])].sort((a, b) => a.semana.localeCompare(b.semana)));
      setSemMatch(utms.data ?? []);
    }).catch((error) => {
      if (!controller.signal.aborted) console.error("Saúde da atribuição", error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refreshKey]);
```

- [ ] **Step 3: Anúncios**

Em `anuncios.tsx`, no `useEffect` das linhas 320-363: remover `const supabase = createClient();` e trocar `supabase.from("v_leads_sem_venda").select("*")` por `fetchMarketingSnapshot<LeadFrioRow[]>("leads-without-sale", controller.signal)`. O `setFrios((leadsFrios.data as LeadFrioRow[]) ?? [])` continua igual. Importar `fetchMarketingSnapshot` junto de `fetchMarketingReport`. Remover o import de `createClient` se não sobrar uso no arquivo (`grep -n createClient`).

- [ ] **Step 4: Visão Geral**

Em `visao-geral.tsx`:

1. No `useEffect` do funil (≈ linha 270): remover `const supabase = createClient();` e trocar `supabase.rpc("get_nomes_pipelines")` por `fetchMarketingSnapshot<{ pipeline_id: string; pipeline_name: string }[]>("pipelines", controller.signal)`. O `pipes.data` continua sendo lido do mesmo jeito.
2. Substituir o `useEffect` de saúde/vendas sem pares (≈ linhas 346-361) por:

```tsx
  useEffect(() => {
    const controller = new AbortController();
    const semana = inicioSemana(hojeSaoPaulo());
    Promise.all([
      fetchMarketingSnapshot<{ semana: string; pct_com_utm: number | null }[]>("health", controller.signal),
      fetchMarketingReport<VendaSemParesRow[]>("sales-without-pairs", inicio, fim, controller.signal),
    ]).then(([saude, semPares]) => {
      if (controller.signal.aborted) return;
      const atual = (saude.data ?? []).filter((r) => r.semana >= semana)
        .sort((a, b) => b.semana.localeCompare(a.semana))[0];
      setSaudePct(atual?.pct_com_utm ?? null);
      setVendasSemPares(semPares.data ?? []);
    }).catch((error) => {
      if (!controller.signal.aborted) console.error("Saúde e vendas sem pares", error);
    });
    return () => controller.abort();
  }, [periodo, customRange?.inicio, customRange?.fim, refreshKey]);
```

3. Remover o import de `createClient` se não sobrar uso no arquivo.

- [ ] **Step 5: Confirmar que não sobrou leitura direta no módulo**

Run: `grep -rn "createClient\|\.rpc(\|\.from(\"v_\|\.from(\"mv_" app/meta-marketing`
Expected: só `criativos.tsx` e `insights.tsx` lendo `meta_ad_creative_*` e `meta_ghl_ad_insights` (tabelas com `approved_read` desde a Task 1) e `regioes.tsx` (fica para o PR 2).

- [ ] **Step 6: Typecheck, lint e testes**

Run: `npx tsc --noEmit -p . && npm run lint && npm run test:meta-marketing && npm run test:periodo`
Expected: sem erros.

- [ ] **Step 7: Conferir no navegador**

Com `preview_start`, logado como usuário aprovado, abrir `/meta-marketing` nas abas Visão Geral, Anúncios, Saúde, Criativos e Insights. Esperado: tudo carrega, sem erro no console, e em `read_network_requests` nenhuma chamada a `/rest/v1/v_*` ou `/rest/v1/rpc/get_nomes_pipelines`.

Depois, numa aba sem login, `fetch("/api/meta-marketing/report?report=health")` deve responder 401; com `report=nada`, logado, 400.

- [ ] **Step 8: Commit**

```bash
git add app/meta-marketing
git commit -m "fix: abas do Meta Marketing leem só pela rota com usuário aprovado"
```

---

### Task 4: PR, deploy e migration B

**Files:**
- Create: `supabase/migrations/<versão>_meta_fase2_seguranca_b.sql`

- [ ] **Step 1: Abrir o PR**

Push do branch e `gh pr create` com: o que muda, snapshot do Step 1 da Task 1 (rollback), a ordem A → deploy → B e o que foi conferido.

- [ ] **Step 2: Esperar o merge e o deploy em produção**

Só seguir quando o usuário fizer o merge e a Vercel publicar. Conferir com `get_runtime_logs`/deploy do projeto ou abrindo `/meta-marketing` em produção.

- [ ] **Step 3: Confirmar que ninguém mais chama as views pela API**

`query_logs` nas últimas horas depois do deploy:

```sql
select countIf(event_message ilike '%/rest/v1/v_atribuicao_saude%') as saude,
       countIf(event_message ilike '%/rest/v1/v_leads_sem_venda%') as frios,
       countIf(event_message ilike '%/rest/v1/v_utm_sem_match%') as utm,
       countIf(event_message ilike '%/rest/v1/v_vendas_sem_pares%') as sem_pares,
       countIf(event_message ilike '%/rest/v1/rpc/get_nomes_pipelines%') as pipelines
from logs where source = 'edge_logs'
```

Expected: zero (navegadores com a versão antiga aberta somem com o recarregamento; se houver poucas chamadas, esperar e repetir).

- [ ] **Step 4: Aplicar a migration B**

`apply_migration` com nome `meta_fase2_seguranca_b`:

```sql
-- Fase 2 do Meta Marketing (segurança), parte B: com as telas lendo pela
-- rota, o navegador perde o acesso direto ao que ainda usava.
revoke select on public.v_atribuicao_saude, public.v_leads_sem_venda,
  public.v_utm_sem_match, public.v_vendas_sem_pares
  from anon, authenticated;

revoke execute on function public.get_nomes_pipelines() from public, anon, authenticated;
grant execute on function public.get_nomes_pipelines() to service_role;
```

- [ ] **Step 5: Verificar como usuário não aprovado e aprovado**

Escolher um `id` de `user_profiles` com `approved is not true` e um com `approved is true` e rodar, trocando `<uuid>`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
select
  has_function_privilege('get_resumo_periodo(date,date)', 'execute') as resumo,
  has_function_privilege('get_nomes_pipelines()', 'execute') as pipelines,
  has_table_privilege('public.v_atribuicao_saude', 'select') as saude,
  has_table_privilege('public.v_vendas', 'select') as vendas,
  (select count(*) from public.meta_ghl_ad_insights) as insights_visiveis,
  (select count(*) from public.ghl_contact_tags) as tags_visiveis;
rollback;
```

Expected: as quatro permissões `false` para os dois usuários. `insights_visiveis` e `tags_visiveis` = 0 para o não aprovado e > 0 para o aprovado. Se não houver usuário não aprovado, usar um uuid aleatório (`gen_random_uuid()`), que também não é aprovado.

- [ ] **Step 6: Conferir produção e versionar a B**

Recarregar `/meta-marketing` em produção como aprovado e passar pelas abas. Salvar o SQL do Step 4 em `supabase/migrations/<versão>_meta_fase2_seguranca_b.sql`, commitar no `main` por um PR curto (ou no mesmo PR, se ainda aberto) e registrar o resultado do Step 5 no PR.
