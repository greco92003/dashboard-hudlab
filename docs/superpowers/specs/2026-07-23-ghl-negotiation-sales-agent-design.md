# Agente Comercial de Avaliação e Coaching — Conversas GHL em Negociação

**Data:** 2026-07-23
**Status:** Aprovado para planejamento de implementação

## Objetivo

Usar a API de Conversas do GoHighLevel (WhatsApp) para avaliar como os vendedores conduzem
negociações reais e oferecer orientação em tempo real durante negociações ainda abertas —
com nota, insights e sugestões de próximo passo ancorados no Manual Comercial e Agente Hud Lab v1.0
(`Manual_Comercial_e_Agente_Hud_Lab_v1.pdf`), não em critérios genéricos.

Objetivo primário: **coaching/ranking** dos vendedores, alimentando a aba `/sellers_v2` já existente
(hoje só com ranking de vendas e treino simulado com IA).

## Contexto — o que já existe

- **`ghl_funnel_events`** (`app/api/webhooks/ghl/funnel/route.ts`): webhook já em produção, grava um
  evento sempre que uma tag de etapa do funil dispara no GHL, incluindo `emnegociacao` ("Em
  Negociação") com `contact_id` e `received_at`. Não precisa de nenhuma mudança.
- **`ghl_opportunities`** (`supabase/functions/sync-ghl`): sync diário (cron `sync-ghl-daily`,
  09:10 UTC) mantém `status` (`open`/`won`/`lost`/outros) atualizado por oportunidade.
- **`/sellers_v2`** (`app/sellers_v2/page.tsx`): página de gamificação já existente, com aba de
  ranking e aba de treino simulado com IA (cliente fictício via Gemini, avaliação com breakdown
  fixo). A nota do treino simulado usa critérios genéricos de venda — **não** deve ser reaproveitada
  aqui; os critérios de negociação real vêm do manual comercial (seção 7).
- **`lib/ghl/api.ts`**: cliente HTTP para a API do GHL (opportunities/contacts), com padrão de retry
  em 429 e extração de custom fields — modelo a seguir para o cliente de Conversas.

## Validação técnica (feita antes de aprovar este desenho)

Testei ao vivo (script descartável, não commitado) contra a location real da Hud Lab:

- `GET /conversations/search` e `GET /conversations/{id}/messages` funcionam com o
  `GHL_PRIVATE_INTEGRATION_TOKEN` já configurado em `.env.local`.
- Numa conversa real de WhatsApp em negociação (Ygor Pires, 47 mensagens): **10 inbound (cliente) +
  37 outbound (vendedor)**, todas com `body` de texto completo. As mensagens `outbound` trazem
  `userId` consistente (o vendedor que respondeu) em toda a conversa.
- Isso resolve a limitação que inviabilizou uma tentativa anterior com ManyChat, onde só o lado do
  cliente chegava via webhook. Aqui a leitura é via API (histórico completo sob demanda, não
  webhook), e funciona porque o vendedor responde **de dentro da caixa de entrada do GHL** — se
  algum dia isso mudar (vendedor respondendo por fora do GHL), a mesma limitação do ManyChat volta.
- **Achado 1**: a resposta real de `GET /conversations/{id}/messages` tem uma camada de aninhamento
  extra que a documentação pública não mostra: `{"messages": {"messages": [...], "lastMessageId":
  ..., "nextPage": ...}}`, não `{"messages": [...]}` direto.
- **Achado 2**: a conversa mistura mensagens de sistema (ex. `messageType: TYPE_ACTIVITY_OPPORTUNITY`,
  "Opportunity updated") com mensagens reais de WhatsApp — confirma que filtrar por
  `messageType=TYPE_WHATSAPP` é obrigatório, não opcional.

## Escopo

- **Canal**: só WhatsApp (`messageType=TYPE_WHATSAPP`). Sem SMS, e-mail, chamadas, redes sociais.
- **Gatilho de entrada**: evento `emnegociacao` já existente em `ghl_funnel_events` — só
  oportunidades que chegaram em "Em Negociação" entram no radar (mantém o sistema leve).
- **Sem backfill**: só oportunidades que atingirem `emnegociacao` a partir do lançamento. Nada
  retroativo.
- **Sem webhook em tempo real**: nem para captura de mensagem a mensagem, nem para alertas. A
  avaliação final roda em lote (cron diário); o coaching é sob demanda (usuário clica).
- **Identificação do vendedor**: campo custom "Vendedor" da oportunidade (texto livre, já usado em
  outras partes do sistema) — não o `assignedTo`/`userId` nativo do GHL.
- **Fora de escopo nesta fase**: alertas em tempo real, auditoria/compliance como objetivo primário,
  chamadas de voz/transcrição, qualquer canal além de WhatsApp.

## Dois modos de operação (do manual, seção 8.2)

### Modo 1 — Auditor de atendimento (nota final)

Roda automaticamente quando uma negociação se resolve.

1. Job periódico (`/api/cron/evaluate-negotiations`, Vercel Cron, agendado depois do
   `sync-ghl-daily`) busca oportunidades onde:
   - existe um evento `emnegociacao` em `ghl_funnel_events` para o `contact_id`;
   - `ghl_opportunities.status` já está resolvido (`!= 'open'` — a confirmar quais valores terminais
     existem de fato em produção além de `won`/`lost`, ex. `abandoned`). Mapeamento para a coluna
     `outcome`: `won` se `status = 'won'`, senão `lost` (qualquer outro status terminal cai como
     perda);
   - ainda não existe linha em `ghl_negotiation_evaluations` para essa oportunidade.
2. Para cada uma: `GET /conversations/search?contactId=X` → `GET /conversations/{id}/messages`
   (paginado), filtrando `messageType=TYPE_WHATSAPP` e `dateAdded >= received_at` do evento
   `emnegociacao`.
3. Chama o Gemini (mesmo provider do `sellers_v2/training`, `gemini-2.5-flash`, `responseSchema`
   para JSON garantido) com o Manual Comercial completo como contexto + a transcrição + dados da
   oportunidade (etapa, valor, qty_pares, outcome).
4. Grava o resultado em `ghl_negotiation_evaluations`.

Critérios (manual, seção 7.1) — nota 0-100, soma dos pesos:

| Critério | Peso |
|---|---|
| Precisão das informações | 25 |
| Entendimento da necessidade | 20 |
| Construção de valor | 20 |
| Condução para o próximo passo | 20 |
| Clareza e comunicação | 15 |

Âncoras (seção 7.2): 90-100 Excelente, 80-89 Bom, 70-79 Atenção, 60-69 Insuficiente, <60 Crítico.
Erros críticos (seção 7.3, ex. desconto >10% sem autorização, pagamento pedido antes da Amostra
Digital, falsa urgência) limitam a nota a no máximo 69, mesmo com o resto bem conduzido — a
instrução vai no prompt; o código não faz esse clamp separadamente, mas registra
`has_critical_error` para facilitar filtragem/auditoria.
Regras de justiça (seção 7.4): não punir por não-resposta do cliente, nem só porque a venda não
fechou — a nota mede a condução, o `outcome` (won/lost) é contexto para o insight, não input da
nota.

Saída estruturada (seção 8.4): resumo, nota geral, nota e justificativa por critério, evidências,
acertos, falhas/oportunidades perdidas, erros críticos/divergências de política, exemplo de
resposta melhor.

### Modo 2 — Copiloto de negociação (coaching sob demanda)

Para negociações **ainda abertas**.

1. UI lista "Negociações Ativas": oportunidades com evento `emnegociacao` cujo
   `ghl_opportunities.status` ainda é `open`.
2. Usuário clica "Gerar Insight" numa linha → `POST /api/sellers-v2/negotiation-insight` com o
   `opportunityId`.
3. Mesma busca de conversa ao vivo (não usa cache/histórico salvo — sempre a versão mais atual).
4. Mesmo manual como grounding, prompt de orientação (não é avaliação, é conselho).
5. Grava em `ghl_negotiation_insights` (histórico — cada chamada gera uma nova linha, não
   sobrescreve).
6. Sem restrição de quem pode gerar — qualquer usuário autenticado do dashboard.

Saída estruturada (seção 8.5): situação atual (avançando/estagnada/em risco/aguardando
cliente/aguardando ação interna), objetivo provável do cliente com evidências, sinais de compra,
objeções/bloqueios abertos, informações ainda necessárias, uma única próxima melhor ação, mensagem
sugerida, o que evitar na próxima resposta.

## Base do agente — Manual Comercial versionado

O PDF (`Manual_Comercial_e_Agente_Hud_Lab_v1.pdf`, seções 1-8: fonte de verdade comercial, tabela de
preços, processo do pedido, método RERA de persuasão, biblioteca de scripts, critérios de avaliação,
especificação do agente) vira um arquivo markdown versionado no repositório
(`lib/ghl/sales-agent/manual-comercial-v1.md`), extraído com `pdftotext -layout` (**atenção**: rodar
com `-enc UTF-8`, a extração de teste teve problemas de acentuação) e revisado manualmente antes do
commit. Um export `MANUAL_VERSION = "1.0 — Julho/2026"` acompanha o arquivo.

Ambas as rotas (Auditor e Copiloto) carregam o manual inteiro (até a seção 8, sem a seção 9 de
governança nem o Anexo A — não são relevantes para o prompt) como contexto/system instruction. Cada
avaliação e cada insight salvo registra `manual_version`, para que uma futura v1.1 não altere
retroativamente o significado de registros antigos (exigência da seção 9.1 do próprio manual).

Regra de governança do manual que o prompt deve preservar (seção 1.2 / 8.6): o agente **não decide**
pendências de política em aberto (ex. se o desconto de vendedor de até 10% acumula com os 5% do
PIX) — ele sinaliza a dúvida e pede validação humana, nunca inventa a regra.

## Modelo de dados

Ambas as tabelas no projeto Supabase **Dashboard-v2** (mesmo do módulo Meta x GHL), com a política
RLS `"read authenticated"` (mesma das tabelas irmãs — lição já aprendida com `ghl_funnel_events`,
ver `meta-ghl-bi-module` na memória do projeto).

### `ghl_negotiation_evaluations` (Modo 1, uma linha por oportunidade)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid pk | |
| `opportunity_id` | text, unique | FK lógica para `ghl_opportunities.id` |
| `contact_id` | text | |
| `vendedor` | text nullable | do custom field "Vendedor"; pode vir vazio |
| `outcome` | text | `won` \| `lost` |
| `score` | integer | nota geral 0-100 |
| `classification` | text | Excelente/Bom/Atenção/Insuficiente/Crítico |
| `has_critical_error` | boolean | |
| `report` | jsonb | saída estruturada completa (seção 8.4) |
| `manual_version` | text | |
| `message_count` | integer | mensagens WhatsApp consideradas |
| `negotiation_started_at` | timestamptz | `received_at` do evento `emnegociacao` |
| `resolved_at` | timestamptz | quando `status` virou won/lost |
| `evaluated_at` | timestamptz default now() | |

### `ghl_negotiation_insights` (Modo 2, histórico — múltiplas linhas por oportunidade)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid pk | |
| `opportunity_id` | text | |
| `contact_id` | text | |
| `vendedor` | text nullable | |
| `report` | jsonb | saída estruturada completa (seção 8.5) |
| `manual_version` | text | |
| `message_count` | integer | |
| `requested_by` | uuid nullable | usuário autenticado que pediu o insight |
| `created_at` | timestamptz default now() | |

## Camada de código compartilhada

- `lib/ghl/negotiation-conversations.ts`: função tipo `getNegotiationTranscript(contactId, sinceISO)`
  que faz `conversations/search` → `conversations/{id}/messages` (paginando via `lastMessageId`),
  filtra `messageType=TYPE_WHATSAPP` e `dateAdded >= sinceISO`, e já desembrulha o aninhamento extra
  encontrado na validação. Reaproveita o padrão de retry em 429 de `lib/ghl/api.ts`.
- `lib/ghl/sales-agent/manual-comercial-v1.md` + `manual.ts` (export do texto + `MANUAL_VERSION`).
- Ambos os endpoints novos rodam em Next.js/Node (não Deno/edge function), para compartilhar esse
  código diretamente com o `sellers_v2/training` existente sem duplicar lógica entre runtimes.

## Rotas novas

- `POST /api/cron/evaluate-negotiations` — Modo 1, protegida como as outras rotas de
  `/api/cron/*` já existentes (`lib/security/route-guards.ts`), agendada em `vercel.json`.
- `POST /api/sellers-v2/negotiation-insight` — Modo 2, autenticada (mesmo padrão de
  `sellers-v2/training`), recebe `opportunityId`.
- `GET /api/sellers-v2/negotiations` — lista negociações ativas (para a UI do Modo 2) e
  avaliações fechadas (para a UI do Modo 1), com paginação simples.

## UI

Nova aba **"Atendimentos Reais"** em `/sellers_v2`, ao lado de "Rankings" e "Treinamento IA":

- Seção **"Em Negociação"**: lista de oportunidades ativas (contato, vendedor, dias em negociação),
  botão "Gerar Insight" por linha, mostra o histórico de insights já gerados (se houver) num
  timeline.
- Seção **"Fechadas"**: lista de negociações avaliadas (nota, classificação, outcome), expande para
  o relatório completo (evidências, acertos, falhas, erros críticos, exemplo de resposta melhor).
- Novo card de ranking **"Atendimento Real"** por vendedor (nota média), separado do ranking de
  treino simulado — critérios diferentes, escalas não comparáveis 1:1.

## Tratamento de erros e limites

- **Sem conversa encontrada** para o `contactId` → loga e pula (Modo 1) ou retorna mensagem amigável
  (Modo 2); não trava o job nem a UI.
- **Campo "Vendedor" vazio** → registro sem atribuição a vendedor específico; ainda aparece na lista
  geral, mas fica fora do ranking por vendedor.
- **Rate limit da API GHL** → mesmo retry único com backoff de `lib/ghl/api.ts`.
- **Falha do LLM** (quota/timeout): Modo 1 deixa a oportunidade pendente para o próximo ciclo do
  cron; Modo 2 mostra erro na tela sem travar a UI (mesmo padrão do `sellers_v2` atual).
- **Conversa muito curta**: o manual pede para marcar como "não avaliável" quando não há dados
  suficientes — o prompt instrui isso explicitamente; a UI trata esse caso como um estado próprio,
  não como nota zero.

## Pendências de configuração antes de ligar em produção

- `GHL_PRIVATE_INTEGRATION_TOKEN` e `GHL_LOCATION_ID` já estão em `.env.local` (adicionados durante
  este brainstorm) — confirmar que o token tem os escopos `conversations.readonly` e
  `conversations/message.readonly` habilitados no painel do GHL (a busca funcionou no teste, então
  aparentemente já tem; vale reconfirmar antes de produção). Adicionar as mesmas variáveis no
  ambiente de produção (Vercel) quando for além do teste local.
- Extrair o manual para markdown com `pdftotext -enc UTF-8 -layout` e revisar acentuação antes de
  commitar.

## Fora de escopo / não decidido aqui

- Pendências operacionais que o próprio manual lista para a v1.1 (ex. cumulatividade do desconto
  do vendedor com o PIX) — o agente sinaliza, não resolve.
- Backfill de negociações já fechadas antes do lançamento.
- Alertas em tempo real / auditoria de compliance como caso de uso.
- Chamadas de voz e transcrição (a API suporta, mas fora do escopo desta fase).
