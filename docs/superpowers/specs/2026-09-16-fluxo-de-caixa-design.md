# Fluxo de caixa contínuo no /financial-dashboard

Data: 2026-09-16

## Objetivo

Trocar o dashboard financeiro atual (leitura direta do Tiny, gráfico de previsto × realizado) por um fluxo de caixa contínuo no estilo Conta Azul: entradas (verde, positivas), saídas (vermelho, negativas) e fechamento (linha azul, saldo acumulado), com contas atrasadas, baixa e — nas fases seguintes — conciliação automática com Asaas, Sicredi e DDA.

Hoje a baixa é feita à mão: alguém abre o Asaas e o Sicredi, vê o que entrou/saiu e dá baixa no Tiny. São muitos pagamentos por dia. O app deve sugerir as ligações e dar a baixa no Tiny com um clique.

## Decisões

- **O Tiny é a fonte oficial.** Contas a pagar/receber e baixas vivem no Tiny, porque relatórios, DRE e contador dependem dele. O app lê, sugere e grava no Tiny pela API v3.
- **Espelho do Tiny no Supabase.** A tela e a conciliação leem do Supabase; gravações vão ao Tiny e depois atualizam o espelho.
- **Seletor de período próprio da página**, não o seletor global de pedidos.
- **Gráfico `@bklit/composed-chart`** (visx). O domínio do Y já se estende abaixo de zero quando há valores negativos.
- **Crescimento em fases**, cada uma visível na tela antes da próxima.

## Fases

| Fase | Entrega |
|---|---|
| 1. Fluxo de caixa | Espelho do Tiny, gráfico, seletor de período, listas de atrasadas/a vencer/pagas, baixa manual e nova saída gravando no Tiny. Saldo inicial manual. |
| 2. Asaas | Cobranças recebidas e crédito previsto em `fin_movimentos`; vínculo com a oportunidade do GHL pelo campo personalizado "link de pagamento". |
| 3. Sicredi | Extrato, PIX recebidos e saldo real (substitui o saldo manual). Saques do Asaas que caem no Sicredi são reconhecidos para não contar em dobro. |
| 4. Conciliação | Sugestões movimento ↔ conta (valor, data, contraparte, link de pagamento). Confirmar = baixa no Tiny. |
| 5. DDA | Boletos DDA (API Multipag, escopo `multipag.dda.consultar`) viram sugestão de nova conta a pagar no Tiny. |

Este documento detalha a **fase 1**. As fases 2–5 ganham desenho próprio quando as credenciais estiverem em mãos.

## Fase 1

### Dados (Supabase)

`fin_contas` — espelho do Tiny, uma linha por conta.

| coluna | tipo | nota |
|---|---|---|
| `tipo` + `tiny_id` | text + bigint | chave primária composta; `tipo` ∈ `pagar`, `receber` |
| `situacao` | text | como o Tiny devolve (`aberto`, `pago`, `recebido`, `parcial`, `cancelada`, `prevista`, …) |
| `data_emissao`, `data_vencimento`, `data_pagamento` | date | `data_pagamento` vem do detalhe/recebimentos; nulo se em aberto |
| `valor`, `saldo` | numeric(14,2) | `saldo` = quanto falta pagar/receber |
| `historico`, `numero_documento` | text | |
| `contato_id`, `contato_nome`, `contato_cpf_cnpj` | | |
| `categoria_id`, `categoria_nome`, `forma_pagamento` | | |
| `raw` | jsonb | resposta do Tiny |
| `detalhe_hash` | text | hash dos campos da listagem; se mudar, o detalhe é buscado de novo |
| `synced_at` | timestamptz | |

`fin_sync_runs` — `id`, `iniciado_em`, `terminado_em`, `status` (`ok`/`erro`), `contas_lidas`, `contas_removidas`, `erro`.

`fin_config` — linha única: `saldo_inicial`, `saldo_inicial_data`, `updated_at`, `updated_by_email`.

RLS habilitado, sem políticas: só o servidor (service role) lê e grava, como em `erp_ordens_producao`.

### Sincronização

- Disparos: cron `/api/cron/sync-fluxo-caixa` a cada 15 min; botão "Atualizar"; refresh da conta específica após cada gravação.
- Janela: (a) todas as contas em aberto, sem limite de data; (b) qualquer situação com vencimento entre hoje − 180 dias e hoje + 365 dias.
- Detalhe (`GET /contas-pagar/{id}`, `/contas-receber/{id}`) só para contas novas ou com `detalhe_hash` diferente — traz categoria e data de pagamento. Concorrência baixa (2) por causa do limite do Tiny.
- Poda: conta dentro da janela que não voltou na listagem é apagada do espelho. Sync com erro não poda.
- Uma sync por vez: se já há run sem `terminado_em` há menos de 10 min, a nova é recusada.

### Regras de cálculo (funções puras, testadas)

- **Status derivado:** `cancelada` → cancelada; `pago`/`recebido` → paga; `saldo > 0` e vencimento < hoje → atrasada; senão a vencer (parcial continua a vencer/atrasada pelo saldo).
- **Data de caixa:** paga → `data_pagamento` (fallback vencimento); a vencer → vencimento; atrasada → hoje.
- **Valor de caixa:** paga → `valor − saldo` (ou `valor` se saldo 0); em aberto → `saldo`. Saídas negativas.
- **Buckets:** dia, semana (segunda a domingo) ou mês, cobrindo todo o período mesmo sem movimento.
- **Fechamento:** saldo inicial + soma de (entradas − saídas) de todos os buckets desde `saldo_inicial_data` até o bucket. Movimentos antes do período mas depois da data do saldo entram no ponto de partida.
- Canceladas ficam fora do gráfico e dos cartões.

### API (Next.js, `requireRole(ADMIN_ROLES)`)

- `GET /api/fluxo-caixa?inicio&fim&agrupamento` → `{ pontos, cartoes, contas, ultimaSync, saldoInicial }`.
- `POST /api/fluxo-caixa/sync` → roda a sincronização.
- `PUT /api/fluxo-caixa/config` → saldo inicial e data.
- `GET /api/fluxo-caixa/opcoes` → categorias de despesa, contas financeiras (Tiny); `GET /api/fluxo-caixa/contatos?q=` busca contatos.
- `POST /api/fluxo-caixa/contas-pagar` → cria no Tiny (`POST /contas-pagar`) e atualiza o espelho.
- `POST /api/fluxo-caixa/baixa` → `{ tipo, tinyId, data, valorPago, contaOrigem, juros, desconto }` → `POST /contas-{pagar|receber}/{id}/baixar` e refresh da conta.

### Tela

- Topo: seletor de período (próximos 7/30/90 dias, este mês, mês que vem, personalizado), agrupamento dia/semana/mês, "Atualizar", "+ Nova saída", "dados de hh:mm" (aviso se a última sync falhou).
- Cartões: saldo inicial/atual, entradas previstas, saídas previstas, fechamento projetado, atrasadas a pagar, atrasadas a receber.
- Gráfico composto: barras de entradas e saídas, linha de fechamento; tooltip com os três valores e total atrasado incluído no dia de hoje.
- Abas "A pagar" / "A receber", filtro Atrasadas · A vencer · Pagas, botão "Dar baixa" por linha (diálogo: data, valor pago, conta de origem, juros, desconto).
- "+ Nova saída": descrição, fornecedor (busca no Tiny), categoria de despesa, vencimento, valor, recorrência, nº documento.
- Banner "Conectar Tiny" continua quando o OAuth expira.

### Erros

- Gravação recusada pelo Tiny → mensagem do Tiny na tela; espelho não muda.
- Sync com falha → tela usa o espelho e mostra "dados desatualizados desde hh:mm".

### Testes

`tests/fluxo-caixa.test.mjs`: status derivado, data/valor de caixa, buckets, fechamento, mapeamento Tiny → linha do espelho. Sync e gravações validadas na tela com dados reais.

### Fora da fase 1

Asaas, Sicredi, DDA, conciliação, edição/exclusão de contas, contas a receber manuais.

## Variáveis de ambiente (placeholders)

```
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
SICREDI_API_URL=https://mtls-api-parceiro.sicredi.com.br
SICREDI_CLIENT_ID=
SICREDI_CLIENT_SECRET=
SICREDI_CERT_PEM=
SICREDI_KEY_PEM=
SICREDI_COOPERATIVA=
SICREDI_CONTA=
SICREDI_DOCUMENTO=
```
