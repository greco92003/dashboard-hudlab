# Fluxo de caixa — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o /financial-dashboard por um fluxo de caixa contínuo (entradas verdes, saídas vermelhas negativas, fechamento azul) lido de um espelho do Tiny no Supabase, com baixa e nova saída gravando no Tiny.

**Architecture:** Regras puras em `lib/fluxo-caixa/regras.ts` (testadas). Sincronização server-side (`lib/fluxo-caixa/sync.ts`) copia contas a pagar/receber do Tiny v3 para `fin_contas`. Rotas em `app/api/fluxo-caixa/*` leem o espelho e gravam no Tiny. A página usa `@bklit/composed-chart` (já instalado em `components/charts/`).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service role), Tiny/Olist API v3 (`tinyV3Request`), zod, shadcn/ui, visx (bklit charts), date-fns, sonner.

Spec: `docs/superpowers/specs/2026-09-16-fluxo-de-caixa-design.md`

## Global Constraints

- Datas internas sempre `YYYY-MM-DD` (string). "Hoje" = fuso `America/Sao_Paulo`.
- Saídas são valores **negativos**; entradas positivos.
- Tiny é a fonte oficial: nenhuma gravação local sem sucesso no Tiny.
- Rotas: `requireRole(ADMIN_ROLES)` de `@/lib/security/route-guards`; cron: `requireCronSecret`.
- Tabelas Supabase só via service role (`createServiceClient()` com cast para `from(table: string)`, como em `lib/erp/tiny-production-order.ts:84`).
- Textos de interface em português.
- Testes: `node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test tests/fluxo-caixa.test.mjs`.
- Não tocar em `lib/utils.ts` nem nos arquivos não relacionados já modificados no working tree (`app/expedicao`, `app/producao`, `app/programacao`, `components/programacao`, `lib/programacao`, `tests/programacao-relatorio.test.mjs`, `public/logo-hudlab-box.png`). Commits com `git add` de caminhos explícitos.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/fluxo-caixa/regras.ts` | Tipos + funções puras: datas, status, lançamentos, buckets, fluxo, mapeamento Tiny, mensagens de erro |
| `tests/fluxo-caixa.test.mjs` | Testes das regras |
| `components/charts/series-bar.tsx` | Patch: barras negativas a partir do zero |
| `supabase/migrations/fin_fluxo_caixa.sql` | `fin_contas`, `fin_sync_runs`, `fin_config` |
| `lib/fluxo-caixa/repositorio.ts` | Leitura/gravação Supabase |
| `lib/fluxo-caixa/tiny.ts` | Chamadas Tiny v3 financeiras |
| `lib/fluxo-caixa/sync.ts` | Sincronização e refresh de uma conta |
| `app/api/fluxo-caixa/**/route.ts` | Rotas |
| `app/api/cron/sync-fluxo-caixa/route.ts` | Cron 15 min |
| `components/fluxo-caixa/*.tsx` | Período, cartões, gráfico, tabela, diálogos |
| `app/financial-dashboard/page.tsx` | Página reescrita |

---

## Tasks

O código de cada task está no próprio repositório (commit indicado); este plano registra ordem, contratos e validação.

### Task 1: Regras puras + testes ✅ (5f50ad5)
- Files: `lib/fluxo-caixa/regras.ts`, `tests/fluxo-caixa.test.mjs`
- Produces: `statusDaConta`, `lancamentosDaConta`, `montarFluxo({contas,inicio,fim,agrupamento,hoje,saldoInicial}) → {pontos,resumo}`, `contasDoPeriodo`, `mapearContaTiny(tipo, listagem, detalhe?)`, `assinaturaDaListagem`, `mensagemDoTiny`, `formatarDataTiny`, `agrupamentoAutomatico`, tipos `RespostaFluxo`, `ContaComStatus`, `PontoFluxo`, `ResumoFluxo`.
- Validação: 11 testes passando.

### Task 2: Gráfico aceita negativos ✅ (5f50ad5)
- `npx shadcn@latest add @bklit/composed-chart` (responder **n** ao sobrescrever `lib/utils.ts`); corrigir `var(----x)` gerado em `app/globals.css`.
- `components/charts/series-bar.tsx` → `computeSeriesBarLayout` não empilhado: barra entre `yScale(0)` e `yScale(valor)`.

### Task 3: Migração + repositório ✅ (5f50ad5; aplicada no Supabase `ubqervuhvwnztxmsodlg`)
- `supabase/migrations/fin_fluxo_caixa.sql`, `lib/fluxo-caixa/repositorio.ts`.
- Colunas extras em relação ao spec: `listagem_hash`, `ultima_run` (poda), `fin_sync_runs.detalhes_pendentes`.

### Task 4: Tiny + sincronização + cron ✅ (5f50ad5)
- `lib/fluxo-caixa/tiny.ts` (`/contas-pagar`, `/contas-receber`, `/{id}/baixar`, `/categorias-receita-despesa`, `/contas-financeiras`, `/contatos`), `lib/fluxo-caixa/sync.ts`, `app/api/cron/sync-fluxo-caixa/route.ts`, `vercel.json` (`*/15 * * * *`, maxDuration 300).
- Detalhe limitado a 400 contas / 200 s por execução; poda só com listagem completa.

### Task 5: Rotas ✅ (5f50ad5)
- `GET /api/fluxo-caixa`, `POST /sync`, `PUT /config`, `GET /opcoes`, `GET /contatos`, `POST /contas-pagar`, `POST /baixa`.

### Task 6: UI (worker)
- `components/fluxo-caixa/{formatos.ts,periodo-fluxo,cartoes-fluxo,grafico-fluxo,tabela-contas,dialogo-baixa,dialogo-nova-saida,dialogo-saldo-inicial}.tsx`, `app/financial-dashboard/page.tsx` reescrita, remoção de `components/financial-dashboard/*` e rotas `payables|receivables|summary|timeline`.
- Validação: `npx tsc --noEmit`, `npx eslint app/financial-dashboard components/fluxo-caixa`.

### Task 7: Verificação na tela
- Dev server, "Atualizar" (primeira sincronização real), conferir gráfico com barras negativas, listas, saldo inicial.
- **Validar com dados reais antes de confiar:** formato de data aceito pela baixa (`dd/MM/yyyy`), campo `id` na resposta de criar conta, recorrência mensal (`ocorrencia: "M"` + `diaVencimento`), e se a listagem v3 traz `saldo`.
