# Agente Comercial de Negociação (GHL Conversas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Auditor (nota final automática) and Copiloto (coaching sob demanda) modes that read real WhatsApp negotiation conversations from the GHL Conversations API, evaluate/guide sellers using the Hud Lab Manual Comercial v1.0 as grounding, and surface both in a new "Atendimentos Reais" tab in `/sellers_v2`.

**Architecture:** Two Next.js API routes (one cron-triggered batch job for closed negotiations, one on-demand endpoint for open ones) share a GHL Conversations client and a Gemini-based agent module. Both write structured JSON reports to two new Supabase tables in the Dashboard-v2 project. A new tab in the existing `/sellers_v2` page reads and displays both.

**Tech Stack:** Next.js API routes (Node runtime), `@google/genai` (`gemini-2.5-flash`, `responseSchema` for structured output — same pattern as `app/api/sellers-v2/training/route.ts`), Supabase (Postgres + RLS, project `Dashboard-v2` / `ubqervuhvwnztxmsodlg`), GHL API v2 Conversations endpoints (`services.leadconnectorhq.com`).

## Global Constraints

- Design spec: [docs/superpowers/specs/2026-07-23-ghl-negotiation-sales-agent-design.md](../specs/2026-07-23-ghl-negotiation-sales-agent-design.md) — read it before starting, it has the full rationale.
- Source manual: `C:\Users\User\Downloads\Manual_Comercial_e_Agente_Hud_Lab_v1.pdf` (Hud Lab Manual Comercial v1.0, Julho/2026). Version string to embed everywhere: `"1.0 — Julho/2026"`.
- **No test runner in this repo** (no jest/vitest/testing-library configured — checked `package.json`). Every task's verification step is either a standalone Node script hitting the real GHL API (same pattern used to validate the design) or a `curl`/browser check against `next dev`, matching how the rest of this codebase is actually verified. Do not add a test framework as a side effect of this plan.
- GHL Conversations endpoints require the API `Version` header `2021-04-15` — different from the `2021-07-28` used elsewhere in this repo for opportunities/contacts. Never reuse `GHL_API_VERSION` for these calls.
- `GET /conversations/{id}/messages` responses are nested one level deeper than the public docs show: `{"messages": {"lastMessageId":..., "nextPage":..., "messages": [...]}}`, not `{"messages": [...]}` directly. Confirmed live against production data.
- Only `messageType === "TYPE_WHATSAPP"` counts as a real conversation message — conversations also contain system entries like `TYPE_ACTIVITY_OPPORTUNITY`.
- Seller identity comes from the opportunity's custom field named exactly `"Vendedor"` (confirmed live: field id `QbfXsa8G1pDMFEFuRyUX` in the Hud Lab location, but **do not hardcode this id** — resolve it by name at runtime, the way `fetchParesFieldIds` already does in `supabase/functions/sync-ghl/index.ts:305-315`).
- Supabase project for all new tables: **Dashboard-v2** (`ubqervuhvwnztxmsodlg`) — same project already used by `ghl_opportunities`, `ghl_funnel_events`, `meta_insights_daily`. `process.env.NEXT_PUBLIC_SUPABASE_URL` already points here.
- RLS lesson already learned the hard way in this project (see `ghl_funnel_events_rls_read_authenticated.sql`): any new table read client-side needs an explicit `create policy "read authenticated" ... for select to authenticated using (true)` — the project-wide `approved_user_gate` restrictive policy only applies to tables explicitly listed in `20260721141158_harden_rls_and_privileged_functions.sql`, our new tables are not in that list, so we don't need to worry about it, but we do need the standard read policy.
- All writes to the two new tables go through the service-role client (`createSupabaseServerForSync()` from `lib/supabase/server.ts:63-79`), never through the user-session client — this avoids needing INSERT policies entirely and matches how `app/api/webhooks/ghl/funnel/route.ts` already writes to `ghl_funnel_events`.
- Money values in `ghl_opportunities.monetary_value` are already in whole currency units (reais), not cents — do not multiply/divide by 100 (that conversion only applies to the legacy `deals_cache`/ActiveCampaign shape in `lib/ghl/api.ts`).

---

## Task 1: Manual Comercial as a versioned TypeScript module

**Files:**
- Create: `lib/ghl/sales-agent/manual.ts`

**Interfaces:**
- Produces: `MANUAL_VERSION: string`, `MANUAL_COMERCIAL_TEXT: string` — consumed by Task 4 (`lib/ghl/sales-agent/agent.ts`).

This is the grounding document for both agent modes. It's embedded as a plain TS string constant (not read from a `.md` file at runtime) so it's guaranteed to be included in the Vercel serverless bundle without relying on `fs` path tracing.

- [ ] **Step 1: Create the file with the full manual text**

```typescript
// lib/ghl/sales-agent/manual.ts
//
// Transcribed from "Manual_Comercial_e_Agente_Hud_Lab_v1.pdf" (Hud Lab,
// Julho/2026), sections 1-8 only (section 9 "Governança e implantação" and
// "Anexo A. Catálogo 2026" are process/reference material, not needed as
// LLM grounding). Two tables in the source PDF (2.3 "Tipos de
// personalização" reads fine; 4.4 "Argumentação por aplicação" and 7.1
// "Critérios e pesos" had columns visually reflowed by PDF text extraction)
// were reconstructed here by matching rows to their correct column
// semantically — cross-check against the original PDF if the business
// rules described here are ever in doubt.
//
// Whenever this manual changes (new prices, new policy, new criteria),
// bump MANUAL_VERSION and update this file in the same commit — every
// evaluation/insight record stores which version produced it, so old
// records keep their original meaning.

export const MANUAL_VERSION = "1.0 — Julho/2026";

export const MANUAL_COMERCIAL_TEXT = `# Manual Comercial e Agente de Vendas — Hud Lab

Fonte oficial para vendedores, gestores e agentes de IA. Em caso de conflito com mensagem, campanha ou material antigo, prevalece a versão mais recente deste manual.

## 1. Fonte de verdade comercial

As regras desta seção podem ser usadas diretamente por vendedores, automações e agentes de IA. Nenhuma condição deve ser inventada para acelerar um fechamento.

### 1.1 Regras oficiais

- Produto: Chinelo Slide personalizado.
- Pedido mínimo: 12 pares.
- Grade: livre entre as numerações disponíveis.
- Preço: varia somente pela quantidade total do pedido.
- Personalização: não altera o preço; respeita o mínimo de cada técnica.
- Frete: grátis a partir de 36 pares para todo o Brasil.
- Prazo de produção: 15 dias úteis.
- Início do prazo: data do pagamento, após a Amostra Digital.
- Amostra Digital: entregue antes do pagamento, em até 24 horas úteis.
- Alterações da Amostra Digital: sem limite formal definido.
- Garantia: garantia de fábrica contra defeitos.
- Desconto do vendedor: até 10% sem autorização.
- Follow-up: 1, 3 e 7 dias.

### 1.2 Regras que não podem ser improvisadas

- Não prometer prazo menor do que 15 dias úteis sem validação interna.
- Não oferecer frete grátis abaixo de 36 pares como se fosse regra geral.
- Não conceder desconto superior a 10% sem autorização.
- Não alterar pedido mínimo ou condições de personalização para fechar a venda.
- Não prometer ausência absoluta de variação entre a Amostra Digital e o produto físico.
- Não garantir reposição antes da análise do defeito de fabricação.

**Ponto que ainda exige decisão:** definir se o desconto comercial de até 10% pode ser acumulado com os 5% de desconto do PIX. Até essa decisão, o agente deve sinalizar a dúvida e pedir validação humana — nunca decidir por conta própria.

## 2. Produto, preços e personalizações

### 2.1 Tabela de preços

| Quantidade | Preço por par | Observação |
|---|---|---|
| 12 a 23 pares | R$ 67,90 | Hud Lab Start; Silk em 1 cor |
| 24 a 99 pares | R$ 59,90 | Silk disponível; frete grátis a partir de 36 pares |
| 100 a 499 pares | R$ 54,90 | Desconto progressivo por volume |
| 500 a 999 pares | R$ 52,90 | Desconto progressivo por volume |
| 1.000 pares ou mais | R$ 49,90 | Condição de grande volume |

Os valores acima seguem a quantidade total do pedido. A técnica de personalização não altera o preço, desde que o pedido respeite o mínimo da técnica escolhida.

### 2.2 Formas de pagamento

- PIX à vista: 5% de desconto.
- Cartão de crédito: até 3x sem juros.
- Cartão de crédito: até 6x com juros da operadora.
- Pagamento em 2 etapas: 50% para liberar a produção e 50% antes do envio.

### 2.3 Tipos de personalização

| Técnica | Mínimo | Aplicação conhecida | Observação comercial |
|---|---|---|---|
| Hud Lab Start | 12 pares | Serigrafia Silk em 1 cor | Entrada para pedidos menores |
| Silk | 24 pares | Até 3 cores de serigrafia | Boa relação entre impacto visual e escala |
| Silk Relevo | 60 pares | Serigrafia com relevo + 1 cor de Silk | Maior percepção tátil e visual |
| 3D | 132 pares | Logo em 3D + 1 cor de Silk | Solução premium e de alto impacto |
| Sola colorida | 100 pares | Adicional ao projeto | Acréscimo de R$ 5,00 por par |

### 2.4 Materiais e elementos do produto

- Sola Micro Expandida Comfort.
- Gáspea em Napa Way de aproximadamente 3,5 mm.
- Etiqueta lateral externa em TPU, aproximadamente 1,5 x 1,8 cm.
- Caixa personalizada.
- Cola base d'água e acabamento de fábrica.

### 2.5 Numerações

| Linha | Numeração | Tamanho aproximado |
|---|---|---|
| Infantil | 28/29 | 20 cm |
| Infantil | 30/31 | 21,5 cm |
| Infantil | 32/33 | 22,5 cm |
| Adulto | 34/35 | 24 cm |
| Adulto | 36/37 | 25,5 cm |
| Adulto | 38/39 | 26,5 cm |
| Adulto | 40/41 | 28 cm |
| Adulto | 42/43 | 29,5 cm |
| Adulto | 44/45 | 30,2 cm |

A grade é livre. O cliente distribui a quantidade entre as numerações disponíveis de acordo com sua necessidade.

## 3. Processo do pedido

### 3.1 Fluxo oficial

1. Entendimento inicial da necessidade.
2. Recebimento do logo e das informações básicas do projeto.
3. Criação da Amostra Digital em até 24 horas úteis.
4. Ajustes da Amostra Digital, quando solicitados.
5. Aprovação do cliente.
6. Definição de quantidade, grade, endereço e forma de pagamento.
7. Pagamento ou entrada de 50%.
8. Início da produção: 15 dias úteis a partir do pagamento.
9. Pagamento do saldo, quando aplicável.
10. Expedição e transporte.

**Regra central:** não existe fluxo de pagamento antes da Amostra Digital. A visualização e a aprovação do projeto vêm primeiro; o pagamento libera a produção.

### 3.2 Frete

- Frete grátis: a partir de 36 pares para todo o Brasil.
- Pedidos abaixo de 36 pares: o frete deve ser calculado conforme CEP e condições logísticas.
- Prazo de entrega: é o prazo de produção somado ao prazo da transportadora.
- Comunicação: o vendedor deve sempre separar "prazo de produção" de "prazo de transporte".

### 3.3 Garantia

A Hud Lab oferece garantia de fábrica contra defeitos de fabricação. O vendedor deve coletar informações e evidências do problema antes de prometer reposição, crédito ou reembolso:

- Solicitar fotos ou vídeos claros do defeito.
- Confirmar quantidade de pares afetados e numerações.
- Registrar número do pedido e data do recebimento.
- Encaminhar o caso para análise interna.
- Não caracterizar desgaste, uso inadequado ou divergência estética sem avaliação técnica.

## 4. Método de persuasão Hud Lab

A abordagem comercial deve ser consultiva, objetiva e orientada ao avanço da negociação. O vendedor não deve atuar como atendente passivo nem pressionar o cliente com urgências artificiais.

### 4.1 Método RERA

| Etapa | Ação | Pergunta do vendedor (exemplo) |
|---|---|---|
| Responder | Entregar primeiro a informação objetiva pedida. | "O mínimo começa em 12 pares." |
| Entender | Descobrir a aplicação e o contexto. | "Seria para revenda, equipe, empresa ou evento?" |
| Recomendar | Indicar a solução adequada. | "Para essa quantidade, o Silk atende bem e permite até 3 cores." |
| Avançar | Conduzir para um próximo passo claro. | "Pode me enviar o logo para prepararmos a Amostra Digital?" |

### 4.2 Princípios

- Responder a pergunta antes de argumentar.
- Usar o contexto do cliente para construir valor.
- Transformar benefícios genéricos em aplicação concreta.
- Trabalhar microcompromissos: logo, quantidade, aprovação, grade e pagamento.
- Usar prova social compatível com o segmento.
- Usar urgência somente quando houver prazo, capacidade ou condição real.
- Evitar interrogatórios longos; qualificar durante a conversa.

### 4.3 Linguagem da marca

| Preferir | Evitar |
|---|---|
| Chinelo Slide | Slide isolado |
| Produto de marca ou produto de portfólio | Brinde barato ou lembrancinha |
| Amostra Digital | Arte grátis como isca |
| Personalização e uso real | Promessas exageradas |
| Manda um Direct | Palavras-chave artificiais quando não necessárias |
| Prazo real | Falsa urgência |

### 4.4 Argumentação por aplicação

| Aplicação | Valor principal | Direção da conversa |
|---|---|---|
| Marcas e collabs | Extensão do portfólio e identidade | Produto próprio, drop, comunidade e valor percebido |
| Times e CTs | Uso antes e depois do treino | Identidade, equipe, revenda e comunidade |
| Empresas | Experiência de marca e utilidade | Onboarding, eventos, reconhecimento e clientes |
| Eventos | Continuidade da experiência | Participantes, patrocinadores, venda e lembrança de uso |
| Revenda | Margem e diferenciação | Preço, grade, embalagem e potencial de recompra |

## 5. Qualificação e leitura da negociação

### 5.1 Informações essenciais

- Aplicação: revenda, equipe, empresa, evento ou outro projeto.
- Quantidade estimada.
- Data desejada ou evento relacionado.
- Estado ou CEP de entrega.
- Logo ou arte disponível.
- Responsável pela decisão e necessidade de aprovação interna.

Essas informações podem ser obtidas ao longo da conversa. A ausência de uma informação não deve travar o atendimento quando ainda for possível avançar com segurança.

### 5.2 Sinais de compra

- Envia o logo ou solicita a Amostra Digital.
- Pergunta sobre prazo, pagamento, frete ou grade.
- Define quantidade ou faixa de quantidade.
- Solicita alteração na Amostra Digital.
- Menciona sócio, diretoria, cliente final ou aprovação interna.
- Pergunta como realizar o pagamento.

### 5.3 Sinais de risco

- Conversa sem próximo passo definido.
- Prazo incompatível com produção e transporte.
- Cliente compara apenas preço sem reconhecer diferenças de solução.
- Amostra Digital enviada sem retorno após a cadência completa.
- Vendedor repete informações sem tratar a objeção real.
- Dados importantes não foram registrados no CRM.

### 5.4 Próximo melhor passo

O vendedor deve priorizar uma ação por vez. Exemplos: receber o logo, confirmar a quantidade, obter aprovação da arte, definir a grade, validar a condição comercial ou encaminhar o pagamento.

## 6. Biblioteca de scripts

Os textos abaixo são estruturas adaptáveis. O vendedor deve preservar a informação e ajustar a linguagem ao contexto real da conversa.

### 6.1 Entrada e qualificação

**Primeiro contato inbound** (quando o cliente chega sem explicar o projeto):
"Olá! Trabalhamos com Chinelo Slide personalizado a partir de 12 pares. Para eu te orientar pela opção mais adequada, seria para revenda, equipe, empresa ou algum evento?"

**Cliente pergunta somente o preço** (primeira mensagem é "qual o valor?"):
"O valor começa em R$ 67,90 por par de 12 a 23 pares. De 24 a 99 pares, fica R$ 59,90 por par, e a partir de 36 pares o frete é grátis para todo o Brasil. Qual quantidade você está imaginando?"

**Cliente pergunta o pedido mínimo:**
"O pedido mínimo começa em 12 pares. A grade é livre entre as numerações disponíveis. A partir de 24 pares, também liberamos outras possibilidades de personalização. Seria para qual tipo de projeto?"

**Solicitação de logo** (quando já existe contexto suficiente para criar a Amostra Digital):
"Pode me enviar o logo ou a arte que vocês querem aplicar? Com isso, nosso time prepara uma Amostra Digital para você visualizar o projeto antes do pagamento."

### 6.2 Personalização e Amostra Digital

**Explicar as personalizações:**
"Temos Silk em 1 cor a partir de 12 pares, Silk com até 3 cores a partir de 24, Silk Relevo a partir de 60 e aplicação 3D a partir de 132 pares. O preço varia pela quantidade do pedido, não pela técnica. Qual efeito combina mais com a identidade de vocês?"

**Prazo da Amostra Digital:**
"A primeira Amostra Digital é preparada em até 24 horas úteis. Depois você pode pedir os ajustes necessários antes de aprovar e realizar o pagamento."

**Envio da Amostra Digital:**
"Sua Amostra Digital ficou pronta. Dá uma olhada na aplicação, nas cores e na composição geral. Você prefere aprovar essa versão ou quer ajustar algum detalhe antes de avançarmos?"

**Após alteração:**
"Fizemos o ajuste solicitado e esta é a nova versão. Agora ela representa o que vocês imaginavam para o projeto?"

### 6.3 Orçamento, pagamento e fechamento

**Resumo comercial** (quando o cliente já definiu quantidade e solução):
"Para [quantidade] pares, o valor fica em [valor por par], com [condição de frete]. A produção leva 15 dias úteis a partir do pagamento, mais o transporte. No PIX há 5% de desconto; no cartão, até 3x sem juros; ou podemos fazer 50% para liberar a produção e 50% antes do envio."

**Aprovação e grade** (quando a Amostra Digital foi aprovada):
"Perfeito, arte aprovada. Agora preciso da distribuição das numerações e do CEP de entrega para deixarmos o pedido pronto para pagamento e produção."

**Envio do pagamento:**
"Está tudo confirmado: arte, quantidade, grade e entrega. Vou te enviar a condição de pagamento escolhida. Assim que o pagamento for identificado, começa o prazo de 15 dias úteis de produção."

### 6.4 Objeções

**Preço acima do esperado:**
"Entendo. Para eu te ajudar de forma objetiva: o ponto é o valor total do projeto ou o valor por par? Dependendo da quantidade, conseguimos reduzir o preço unitário e avaliar uma condição comercial dentro da nossa autonomia."
Atenção: não conceder desconto antes de entender a objeção.

**Comparação com fornecedor mais barato:**
"Faz sentido comparar. Além do valor, vale confirmar se o outro orçamento inclui a mesma personalização, caixa personalizada, etiqueta lateral, Amostra Digital e condições de frete. Se você me passar a quantidade e o que está incluído, eu consigo comparar com transparência."

**Pedido mínimo** (cliente quer menos de 12 pares):
"Nossa produção personalizada começa em 12 pares. A grade é livre, então você pode distribuir entre as numerações que realmente precisa. Abaixo disso, hoje não conseguimos manter o padrão de produção e personalização."

**Frete em pedido menor** (menos de 36 pares):
"O frete grátis começa em 36 pares. Para essa quantidade, calculamos pelo CEP. Posso verificar o valor e também te mostrar quanto ficaria o pedido com 36 pares para você comparar o custo total."

**Prazo curto:**
"Nosso prazo padrão é de 15 dias úteis de produção após o pagamento, mais o transporte. Pela sua data, preciso validar a viabilidade antes de prometer. Qual é o dia exato em que o pedido precisa estar com vocês?"

**Aprovação interna** (pessoa depende de sócio, diretoria ou cliente final):
"Posso te deixar um resumo objetivo com a Amostra Digital, quantidade, valor, prazo e forma de pagamento para facilitar essa aprovação. Quem participa da decisão e qual informação costuma ser mais importante para essa pessoa?"

### 6.5 Follow-up

**Follow-up D1** (um dia depois do envio de orçamento ou Amostra Digital):
"Passando para confirmar se você conseguiu analisar a proposta. O que falta para conseguirmos avançar: ajuste na arte, definição da quantidade ou aprovação interna?"

**Follow-up D3** (três dias depois, sem resposta):
"Retomando seu projeto: a Amostra Digital e a condição continuam disponíveis. Posso ajustar algum ponto para facilitar a decisão ou o projeto ficou para outro momento?"

**Follow-up D7** (sete dias depois, encerrando a cadência):
"Vou encerrar o acompanhamento por enquanto para não ficar insistindo. Quando fizer sentido retomar, já teremos o contexto e a Amostra Digital do projeto. Caso ainda queira avançar agora, me chama por aqui."

### 6.6 Garantia e pós-venda

**Recebimento de reclamação:**
"Sinto muito pelo problema. Temos garantia de fábrica contra defeitos e vamos analisar o caso. Pode me enviar fotos ou vídeos, a quantidade de pares afetados, as numerações e o número do pedido? Com isso, encaminho para a avaliação interna."
Atenção: não prometer reposição antes da análise.

**Recompra:**
"Que bom que o projeto ficou como esperado. Quando vocês planejarem uma nova ação ou reposição, conseguimos partir desta base e avaliar novas cores, técnicas ou quantidades."

## 7. Avaliação do vendedor

A nota avalia a qualidade do trabalho do vendedor, não apenas o resultado final. Uma venda pode ocorrer com atendimento ruim; uma negociação pode não fechar apesar de uma condução correta.

### 7.1 Critérios e pesos

| Critério | Peso | O que deve ser observado |
|---|---|---|
| Precisão das informações | 25 | Preço, mínimo, prazo, frete, pagamento, personalização e garantia |
| Entendimento da necessidade | 20 | Aplicação, quantidade, data, contexto e decisão |
| Construção de valor | 20 | Conexão entre produto e objetivo do cliente |
| Condução para o próximo passo | 20 | Pergunta útil, microcompromisso e avanço |
| Clareza e comunicação | 15 | Objetividade, tom, português e organização |

### 7.2 Âncoras de pontuação

| Faixa | Classificação | Interpretação |
|---|---|---|
| 90 a 100 | Excelente | Preciso, contextual e orientado ao avanço |
| 80 a 89 | Bom | Boa condução com melhorias pontuais |
| 70 a 79 | Atenção | Perdeu oportunidades importantes |
| 60 a 69 | Insuficiente | Falhas relevantes de condução ou informação |
| Abaixo de 60 | Crítico | Risco comercial, de experiência ou de política |

### 7.3 Erros críticos

- Preço, pedido mínimo, frete ou prazo informados incorretamente.
- Desconto superior a 10% sem autorização.
- Promessa de personalização incompatível com o mínimo.
- Pagamento solicitado antes da Amostra Digital.
- Promessa de reposição antes da análise de garantia.
- Falsa urgência, pressão indevida ou informação inventada.
- Exposição indevida de dados do cliente.

Um erro crítico pode limitar a nota geral a 69, mesmo que o restante da conversa tenha sido bem conduzido.

### 7.4 Regras de justiça

- Não descontar pontos porque o cliente não respondeu.
- Não descontar pontos somente porque a venda não ocorreu.
- Avaliar apenas o que estava sob controle do vendedor.
- Citar evidência textual para cada perda relevante de pontos.
- Marcar como "não avaliável" quando a conversa não oferece dados suficientes.
- Separar qualidade do atendimento, saúde da negociação e resultado comercial.

### 7.5 Formato da avaliação

Saída padrão: nota geral; notas por critério; acertos; falhas; oportunidades perdidas; erros de política; próxima ação; exemplo de mensagem melhor.

## 8. Especificação do Agente Comercial

### 8.1 Objetivo

O agente deve apoiar o vendedor em duas tarefas: avaliar conversas concluídas ou parciais e orientar negociações em andamento. Ele não substitui o julgamento do vendedor ou do gestor.

### 8.2 Modos de operação

- **Auditor de atendimento** — comando sugerido: "Avalie meu atendimento nesta conversa." Entrega: nota, evidências, acertos, falhas e melhoria.
- **Copiloto de negociação** — comando sugerido: "Analise esta negociação e diga o próximo passo." Entrega: diagnóstico, riscos, informação faltante e mensagem sugerida.

### 8.3 Entrada mínima

- Conversa completa ou trecho relevante.
- Etapa atual do CRM, quando disponível.
- Nome do vendedor, para fins de relatório.
- Quantidade, valor e prazo, quando já definidos.
- Objetivo da solicitação: avaliar ou orientar.

### 8.4 Saída do modo Auditor

1. Resumo objetivo da conversa.
2. Nota geral de 0 a 100.
3. Nota e justificativa para cada critério.
4. Evidências da conversa.
5. Principais acertos.
6. Falhas e oportunidades perdidas.
7. Erros críticos ou divergências de política.
8. Exemplo de resposta melhor.

### 8.5 Saída do modo Copiloto

1. Situação atual: avançando, estagnada, em risco, aguardando cliente ou aguardando ação interna.
2. Objetivo provável do cliente, com evidências.
3. Sinais de compra.
4. Objeções ou bloqueios abertos.
5. Informações ainda necessárias.
6. Uma única próxima melhor ação.
7. Mensagem sugerida.
8. O que evitar na próxima resposta.

### 8.6 Regras do agente

- Consultar sempre a versão vigente da base comercial.
- Não inventar preço, prazo, frete, desconto ou política.
- Diferenciar fato, inferência e recomendação.
- Não afirmar emoção ou intenção sem evidência.
- Não dar probabilidade de fechamento inventada.
- Não avaliar conversa curta como se fosse uma negociação completa.
- Não recomendar desconto antes de entender a objeção.
- Não enviar mensagens ao cliente automaticamente sem ação explícita do vendedor.
- Sinalizar dúvidas de política para validação humana.

### 8.7 Prompt-base do agente

Instrução central: "Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes. Avalie o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo. Nunca invente condições comerciais."

### 8.8 Exemplo de saída — Copiloto (Aguardando aprovação interna)

- Situação: cliente enviou o logo e pediu prazo e forma de pagamento.
- Sinal de compra: pergunta objetiva sobre prazo e pagamento.
- Bloqueio: sócio ainda não avaliou a Amostra Digital.
- Próxima ação: facilitar a aprovação com um resumo objetivo.
- Mensagem: "Posso te enviar um resumo com a Amostra Digital, quantidade, valor, prazo e pagamento para você encaminhar ao seu sócio?"
- Evitar: oferecer desconto antes de saber se preço é a objeção.
`;
```

- [ ] **Step 2: Verify the module loads and contains the expected content**

Run (from the repo root):

```bash
node --experimental-strip-types -e "
const { MANUAL_VERSION, MANUAL_COMERCIAL_TEXT } = require('./lib/ghl/sales-agent/manual.ts');
console.log('version:', MANUAL_VERSION);
console.log('length:', MANUAL_COMERCIAL_TEXT.length);
console.log('has RERA:', MANUAL_COMERCIAL_TEXT.includes('Método RERA'));
console.log('has price table:', MANUAL_COMERCIAL_TEXT.includes('67,90'));
console.log('has criteria:', MANUAL_COMERCIAL_TEXT.includes('Precisão das informações'));
console.log('has copiloto format:', MANUAL_COMERCIAL_TEXT.includes('Copiloto de negociação'));
"
```

If `require` with `.ts` fails on your Node version, instead run this equivalent check with plain `node` against a temporary copy with the `export` keywords stripped, or just open the file and confirm visually. Expected: `version: 1.0 — Julho/2026`, length > 10000, all four `has *` lines `true`.

- [ ] **Step 3: Commit**

```bash
git add lib/ghl/sales-agent/manual.ts
git commit -m "feat: add Hud Lab Manual Comercial v1.0 as agent grounding module"
```

---

## Task 2: Shared GHL Conversations client

**Files:**
- Modify: `lib/ghl/api.ts` (export the existing private helper)
- Create: `lib/ghl/negotiation-conversations.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (for Tasks 5, 6, 7): `getNegotiationTranscript(contactId: string, sinceISO: string): Promise<NegotiationTranscript>`, `getVendedorForOpportunity(raw: unknown): Promise<string | null>`, `formatTranscriptForPrompt(messages: NegotiationMessage[]): string`, `NEGOTIATION_TRACKING_START_ISO: string`, and the types `NegotiationMessage`, `NegotiationTranscript`.

- [ ] **Step 1: Export the custom-field value extractor from `lib/ghl/api.ts`**

Open `lib/ghl/api.ts` and change line 168 from:

```typescript
function extractOpportunityFieldValue(
```

to:

```typescript
export function extractOpportunityFieldValue(
```

No other change to that file.

- [ ] **Step 2: Create `lib/ghl/negotiation-conversations.ts`**

```typescript
/**
 * GHL Conversations API client for the negotiation sales agent.
 *
 * Reads the real WhatsApp thread of a negotiation (both the client's and
 * the seller's messages) so the Auditor/Copiloto agent (lib/ghl/sales-agent)
 * has full context. Separate from lib/ghl/api.ts because the Conversations
 * endpoints require a different API `Version` header (2021-04-15) than
 * opportunities/contacts (2021-07-28), and because the response shapes are
 * unrelated.
 */
import { extractOpportunityFieldValue } from "@/lib/ghl/api";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
// Conversations endpoints pin this specific version — confirmed via the
// public OpenAPI spec (github.com/GoHighLevel/highlevel-api-docs). Do not
// swap in GHL_API_VERSION (2021-07-28), it 404s/behaves differently here.
const CONVERSATIONS_API_VERSION = "2021-04-15";

function requireGhlEnv(): { token: string; locationId: string } {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error(
      "GHL credentials missing: set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID",
    );
  }
  return { token, locationId };
}

async function ghlConversationsFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const { token } = requireGhlEnv();
  const url = new URL(path, GHL_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  // Single retry on rate limit, same policy as lib/ghl/api.ts (PIT burst
  // limit: 100 requests / 10s).
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: CONVERSATIONS_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GHL Conversations API error ${response.status} on ${url.pathname}: ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`GHL Conversations API rate limited on ${url.pathname}`);
}

interface GhlConversationSearchResult {
  conversations: Array<{ id: string; type: string; contactId: string }>;
  total: number;
}

/** Find the WhatsApp/SMS/Call conversation thread for a contact (GHL groups them under type TYPE_PHONE). */
async function findPhoneConversationId(
  contactId: string,
): Promise<string | null> {
  const { locationId } = requireGhlEnv();
  const result = await ghlConversationsFetch<GhlConversationSearchResult>(
    "/conversations/search",
    { locationId, contactId, limit: "10" },
  );
  if (!result.conversations || result.conversations.length === 0) return null;
  const phoneConversation = result.conversations.find(
    (c) => c.type === "TYPE_PHONE",
  );
  return (phoneConversation ?? result.conversations[0]).id;
}

interface GhlRawMessage {
  id: string;
  messageType: string;
  direction: "inbound" | "outbound";
  body?: string;
  dateAdded: string;
  userId?: string;
}

interface GhlMessagesPage {
  lastMessageId: string;
  nextPage: boolean;
  messages: GhlRawMessage[];
}

/** GET .../messages nests an extra "messages" layer that the public docs don't show. */
interface GhlMessagesResponse {
  messages: GhlMessagesPage;
}

const MAX_MESSAGE_PAGES = 20; // safety cap: 20 * 100 = 2000 messages per conversation

async function fetchAllMessages(
  conversationId: string,
): Promise<GhlRawMessage[]> {
  const all: GhlRawMessage[] = [];
  let lastMessageId: string | undefined;

  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    const params: Record<string, string> = { limit: "100" };
    if (lastMessageId) params.lastMessageId = lastMessageId;

    const raw = await ghlConversationsFetch<GhlMessagesResponse>(
      `/conversations/${conversationId}/messages`,
      params,
    );
    const page_ = raw.messages;
    all.push(...page_.messages);

    if (!page_.nextPage || page_.messages.length === 0) break;
    lastMessageId = page_.lastMessageId;
  }

  return all;
}

export interface NegotiationMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  dateAdded: string;
  userId: string | null;
}

export interface NegotiationTranscript {
  conversationId: string | null;
  messages: NegotiationMessage[];
}

/**
 * Full WhatsApp transcript of a negotiation from `sinceISO` onward, both
 * directions (client + seller), oldest first. Returns an empty message
 * array (not an error) when there's no conversation yet or nothing in the
 * window — callers decide how to handle "not enough data".
 */
export async function getNegotiationTranscript(
  contactId: string,
  sinceISO: string,
): Promise<NegotiationTranscript> {
  const conversationId = await findPhoneConversationId(contactId);
  if (!conversationId) return { conversationId: null, messages: [] };

  const rawMessages = await fetchAllMessages(conversationId);
  const sinceMs = Date.parse(sinceISO);

  const messages = rawMessages
    .filter((m) => m.messageType === "TYPE_WHATSAPP")
    .filter((m) => {
      const t = Date.parse(m.dateAdded);
      return Number.isFinite(t) && t >= sinceMs;
    })
    .map(
      (m): NegotiationMessage => ({
        id: m.id,
        direction: m.direction,
        body: m.body ?? "",
        dateAdded: m.dateAdded,
        userId: m.userId ? m.userId : null,
      }),
    )
    // API returns newest-first; the agent needs a chronological transcript.
    .sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));

  return { conversationId, messages };
}

export function formatTranscriptForPrompt(
  messages: NegotiationMessage[],
): string {
  return messages
    .map((m) => {
      const who = m.direction === "outbound" ? "VENDEDOR" : "CLIENTE";
      return `[${m.dateAdded}] ${who}: ${m.body || "(mensagem sem texto, ex.: anexo/imagem)"}`;
    })
    .join("\n");
}

/**
 * Scope decision from the design spec: no backfill. Only negotiations that
 * entered "Em Negociação" from this date onward are tracked by either
 * agent mode — a ghl_funnel_events row with stage_slug='emnegociacao' and
 * received_at before this is invisible to both the Auditor batch job and
 * the Copiloto on-demand endpoint. Update this only if the launch date
 * actually changes; do not move it forward casually, it defines what "no
 * backfill" means operationally.
 */
export const NEGOTIATION_TRACKING_START_ISO = "2026-07-23T00:00:00.000Z";

let vendedorFieldIdCache: { id: string | null; fetchedAt: number } | null =
  null;
const FIELD_ID_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, field defs rarely change

async function fetchVendedorFieldId(): Promise<string | null> {
  const now = Date.now();
  if (
    vendedorFieldIdCache &&
    now - vendedorFieldIdCache.fetchedAt < FIELD_ID_CACHE_TTL_MS
  ) {
    return vendedorFieldIdCache.id;
  }

  const { locationId } = requireGhlEnv();
  // Opportunity custom fields use the 2021-07-28 API version, not the
  // Conversations one — reuse the default via ghlConversationsFetch is
  // wrong here, so call fetch directly with the standard version.
  const { token } = requireGhlEnv();
  const url = new URL(
    `/locations/${locationId}/customFields`,
    GHL_BASE_URL,
  );
  url.searchParams.set("model", "opportunity");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    vendedorFieldIdCache = { id: null, fetchedAt: now };
    return null;
  }
  const data = (await response.json()) as {
    customFields: Array<{ id: string; name: string }>;
  };
  const field = (data.customFields || []).find(
    (f) => (f.name || "").trim().toLowerCase() === "vendedor",
  );
  vendedorFieldIdCache = { id: field ? field.id : null, fetchedAt: now };
  return vendedorFieldIdCache.id;
}

/**
 * Seller name for an opportunity, read from the "Vendedor" custom field
 * already cached in `ghl_opportunities.raw` (no extra GHL API call for the
 * opportunity itself — only the field-id lookup is cached/fetched).
 */
export async function getVendedorForOpportunity(
  raw: unknown,
): Promise<string | null> {
  const fieldId = await fetchVendedorFieldId();
  if (!fieldId) return null;
  const customFields = (raw as { customFields?: Array<Record<string, unknown> & { id: string }> })
    ?.customFields;
  if (!customFields) return null;
  const entry = customFields.find((f) => f.id === fieldId);
  if (!entry) return null;
  return extractOpportunityFieldValue(entry);
}
```

- [ ] **Step 2: Verify against the real GHL API**

Create a throwaway script (do not commit it) to confirm the module's assumptions still hold, reusing the same contact discovered during design validation:

```bash
cat > /tmp/verify-negotiation-lib.mjs <<'EOF'
import fs from "node:fs";
const envText = fs.readFileSync(
  "C:/Users/User/Documents/hudlab/dashboard-hudlab/.env.local",
  "utf-8",
);
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const TOKEN = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

async function get(path, params, version) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Version: version || "2021-04-15", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// 1. Confirm a recent WhatsApp opportunity's contact resolves to a TYPE_PHONE conversation
const search = await get("/conversations/search", {
  locationId: LOCATION_ID,
  lastMessageType: "TYPE_WHATSAPP",
  limit: "1",
});
const contactId = search.conversations[0].contactId;
console.log("contactId:", contactId);

const convSearch = await get("/conversations/search", { locationId: LOCATION_ID, contactId, limit: "10" });
console.log("conversation types found:", convSearch.conversations.map((c) => c.type));

const conversationId = convSearch.conversations[0].id;
const msgs = await get(`/conversations/${conversationId}/messages`, { limit: "10" });
console.log("nested shape ok:", typeof msgs.messages === "object" && Array.isArray(msgs.messages.messages));
console.log("sample messageTypes:", msgs.messages.messages.map((m) => m.messageType));

// 2. Confirm the Vendedor field resolves and has values
const defs = await get(`/locations/${LOCATION_ID}/customFields`, { model: "opportunity" }, "2021-07-28");
const vendedorField = defs.customFields.find((f) => f.name.trim().toLowerCase() === "vendedor");
console.log("vendedor field found:", !!vendedorField, vendedorField?.id);

const opps = await get("/opportunities/search", { location_id: LOCATION_ID, limit: "5", status: "all" }, "2021-07-28");
const withVendedor = opps.opportunities.find((o) =>
  (o.customFields || []).some((f) => f.id === vendedorField.id),
);
console.log("sample opportunity has vendedor value:", !!withVendedor);
EOF
node /tmp/verify-negotiation-lib.mjs
```

Expected output: `contactId` printed, `conversation types found` includes `"TYPE_PHONE"`, `nested shape ok: true`, `sample messageTypes` includes `"TYPE_WHATSAPP"`, `vendedor field found: true` with an id, `sample opportunity has vendedor value: true`.

- [ ] **Step 3: Type-check the new/modified files**

```bash
npx tsc --noEmit lib/ghl/negotiation-conversations.ts lib/ghl/api.ts
```

Expected: no errors (or only pre-existing unrelated errors if the repo doesn't already pass a full `tsc --noEmit` — if so, confirm no *new* errors were introduced by diffing against `git stash`).

- [ ] **Step 4: Commit**

```bash
git add lib/ghl/api.ts lib/ghl/negotiation-conversations.ts
git commit -m "feat: add shared GHL Conversations client for negotiation transcripts"
```

---

## Task 3: Database schema — `ghl_negotiation_evaluations` and `ghl_negotiation_insights`

**Files:**
- Create: `supabase/migrations/ghl_negotiation_agent_schema.sql`

**Interfaces:**
- Produces: the two tables consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Agente Comercial de Negociação — Auditor (nota final automática) e
-- Copiloto (coaching sob demanda) sobre conversas reais de WhatsApp na
-- etapa "Em Negociação".
-- Ver docs/superpowers/specs/2026-07-23-ghl-negotiation-sales-agent-design.md
-- ============================================================

-- Modo 1 (Auditor): uma linha por oportunidade, gravada quando a
-- negociação se resolve (won/lost). Escrita sempre via service role
-- (cron job), nunca pelo cliente autenticado — por isso não há política
-- de INSERT para "authenticated".
create table if not exists public.ghl_negotiation_evaluations (
  id                     uuid primary key default gen_random_uuid(),
  opportunity_id         text not null unique,
  contact_id             text not null,
  vendedor               text,
  outcome                text not null check (outcome in ('won', 'lost')),
  score                  int check (score is null or (score >= 0 and score <= 100)),
  classification         text,
  has_critical_error     boolean not null default false,
  report                 jsonb not null,
  manual_version         text not null,
  message_count          int not null default 0,
  negotiation_started_at timestamptz not null,
  resolved_at            timestamptz,
  evaluated_at           timestamptz not null default now()
);

comment on table public.ghl_negotiation_evaluations is
  'Modo Auditor: nota final (0-100), classificação e relatório estruturado por oportunidade fechada (won/lost) que passou por "Em Negociação". Um registro por oportunidade.';

create index if not exists idx_gne_vendedor on public.ghl_negotiation_evaluations (vendedor);
create index if not exists idx_gne_contact on public.ghl_negotiation_evaluations (contact_id);

alter table public.ghl_negotiation_evaluations enable row level security;

drop policy if exists "read authenticated" on public.ghl_negotiation_evaluations;
create policy "read authenticated" on public.ghl_negotiation_evaluations
  for select to authenticated using (true);

-- Modo 2 (Copiloto): histórico append-only de insights gerados sob
-- demanda para negociações ainda abertas. Escrita via service role,
-- disparada por uma rota autenticada (o usuário autenticado nunca
-- escreve direto na tabela).
create table if not exists public.ghl_negotiation_insights (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  contact_id     text not null,
  vendedor       text,
  report         jsonb not null,
  manual_version text not null,
  message_count  int not null default 0,
  requested_by   uuid references auth.users (id),
  created_at     timestamptz not null default now()
);

comment on table public.ghl_negotiation_insights is
  'Modo Copiloto: histórico de orientações geradas sob demanda para negociações ainda abertas. Múltiplos registros por oportunidade (não sobrescreve).';

create index if not exists idx_gni_opportunity on public.ghl_negotiation_insights (opportunity_id);
create index if not exists idx_gni_contact on public.ghl_negotiation_insights (contact_id);

alter table public.ghl_negotiation_insights enable row level security;

drop policy if exists "read authenticated" on public.ghl_negotiation_insights;
create policy "read authenticated" on public.ghl_negotiation_insights
  for select to authenticated using (true);
```

- [ ] **Step 2: Apply the migration to the Dashboard-v2 Supabase project**

Apply this SQL to project `ubqervuhvwnztxmsodlg` (Dashboard-v2) using whichever Supabase access you have (Supabase MCP tool's migration/SQL runner, `supabase db push` if the CLI is linked, or the Supabase Studio SQL editor) — same project every other `meta_ghl_bi_*`/`ghl_funnel_events*` migration in this repo already targets.

- [ ] **Step 3: Verify the tables and policies exist**

Run this query against the Dashboard-v2 project (via whichever tool you used to apply the migration) and confirm both tables appear with `rowsecurity = true` and exactly one `read authenticated` SELECT policy each:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ghl_negotiation_evaluations', 'ghl_negotiation_insights');

select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('ghl_negotiation_evaluations', 'ghl_negotiation_insights');
```

Expected: both tables listed with `rls_enabled = true`; both show a `read authenticated` row with `cmd = 'SELECT'` and `roles = {authenticated}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ghl_negotiation_agent_schema.sql
git commit -m "feat: add ghl_negotiation_evaluations and ghl_negotiation_insights tables"
```

---

## Task 4: Sales agent LLM module (Auditor + Copiloto)

**Files:**
- Create: `lib/ghl/sales-agent/agent.ts`

**Interfaces:**
- Consumes: `MANUAL_VERSION`, `MANUAL_COMERCIAL_TEXT` from `lib/ghl/sales-agent/manual.ts` (Task 1).
- Produces (for Tasks 5, 6): `runAuditor(transcript: string, context: AuditorContext): Promise<AuditorResult>`, `runCopiloto(transcript: string, context: CopilotoContext): Promise<CopilotoReport>`, and the types `AuditorContext`, `AuditorReport`, `AuditorResult`, `CopilotoContext`, `CopilotoReport`.

- [ ] **Step 1: Write the module**

```typescript
// lib/ghl/sales-agent/agent.ts
//
// Runs the Hud Lab "Agente Comercial" (manual.ts section 8) in its two
// modes: Auditor (final score for a resolved negotiation) and Copiloto
// (coaching for a negotiation still open). Same Gemini setup as
// app/api/sellers-v2/training/route.ts (gemini-2.5-flash, responseSchema
// for guaranteed JSON) but grounded in the real commercial manual instead
// of generic sales criteria.
import { GoogleGenAI, Type } from "@google/genai";
import { MANUAL_COMERCIAL_TEXT, MANUAL_VERSION } from "./manual";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const AGENT_BASE_INSTRUCTION = `Você é o Agente Comercial Hud Lab. Use apenas as políticas vigentes descritas no manual abaixo. Avalie ou oriente apenas o que estava sob controle do vendedor. Responda de forma objetiva, cite evidências da conversa e proponha um único próximo passo quando aplicável. Nunca invente condições comerciais (preço, prazo, frete, desconto ou política). Se uma regra estiver marcada como "pendente de decisão" no manual, sinalize a dúvida em vez de decidir por conta própria. Se a conversa não tiver dados suficientes, marque-a como não avaliável em vez de inventar uma nota.`;

function buildSystemPrompt(modeInstructions: string): string {
  return `${AGENT_BASE_INSTRUCTION}

===== MANUAL COMERCIAL HUD LAB (versão ${MANUAL_VERSION}) =====
${MANUAL_COMERCIAL_TEXT}
===== FIM DO MANUAL =====

${modeInstructions}`;
}

function contextBlock(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Modo Auditor
// ---------------------------------------------------------------------------

const AUDITOR_MODE_INSTRUCTIONS = `Modo: Auditor de atendimento.

Critérios e pesos (manual, seção 7.1) — a nota de cada critério deve estar
entre 0 e o peso máximo:
- precisaoInformacoes: 0 a 25 (preço, mínimo, prazo, frete, pagamento, personalização, garantia)
- entendimentoNecessidade: 0 a 20 (aplicação, quantidade, data, contexto, decisão)
- construcaoValor: 0 a 20 (conexão entre produto e objetivo do cliente)
- conducaoProximoPasso: 0 a 20 (pergunta útil, microcompromisso, avanço)
- clarezaComunicacao: 0 a 15 (objetividade, tom, português, organização)

Regras de justiça (manual, seção 7.4): não descontar pontos porque o
cliente não respondeu; não descontar pontos só porque a venda não
ocorreu (o outcome é contexto, não input da nota); avalie apenas o que
estava sob controle do vendedor; cite evidência textual para toda perda
relevante de pontos.

Liste em errosCriticos qualquer ocorrência da seção 7.3 do manual (ex.:
desconto >10% sem autorização, pagamento pedido antes da Amostra
Digital, falsa urgência) — não aplique o teto de nota você mesmo, apenas
relate os erros encontrados.

Se a conversa não tiver mensagens suficientes para avaliar com
segurança, defina naoAvaliavel=true e explique o motivo em
motivoNaoAvaliavel; nesse caso os demais campos podem vir vazios/zerados.`;

const AUDITOR_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    naoAvaliavel: {
      type: Type.BOOLEAN,
      description: "true se a conversa não tem dados suficientes para avaliar",
    },
    motivoNaoAvaliavel: {
      type: Type.STRING,
      description: "Motivo quando naoAvaliavel=true; string vazia caso contrário",
    },
    resumo: { type: Type.STRING, description: "Resumo objetivo da conversa" },
    notasPorCriterio: {
      type: Type.OBJECT,
      properties: {
        precisaoInformacoes: { type: Type.INTEGER, description: "0 a 25" },
        entendimentoNecessidade: { type: Type.INTEGER, description: "0 a 20" },
        construcaoValor: { type: Type.INTEGER, description: "0 a 20" },
        conducaoProximoPasso: { type: Type.INTEGER, description: "0 a 20" },
        clarezaComunicacao: { type: Type.INTEGER, description: "0 a 15" },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
    },
    justificativasPorCriterio: {
      type: Type.OBJECT,
      properties: {
        precisaoInformacoes: { type: Type.STRING },
        entendimentoNecessidade: { type: Type.STRING },
        construcaoValor: { type: Type.STRING },
        conducaoProximoPasso: { type: Type.STRING },
        clarezaComunicacao: { type: Type.STRING },
      },
      required: [
        "precisaoInformacoes",
        "entendimentoNecessidade",
        "construcaoValor",
        "conducaoProximoPasso",
        "clarezaComunicacao",
      ],
    },
    evidencias: { type: Type.ARRAY, items: { type: Type.STRING } },
    acertos: { type: Type.ARRAY, items: { type: Type.STRING } },
    falhas: { type: Type.ARRAY, items: { type: Type.STRING } },
    errosCriticos: { type: Type.ARRAY, items: { type: Type.STRING } },
    exemploRespostaMelhor: { type: Type.STRING },
  },
  required: [
    "naoAvaliavel",
    "motivoNaoAvaliavel",
    "resumo",
    "notasPorCriterio",
    "justificativasPorCriterio",
    "evidencias",
    "acertos",
    "falhas",
    "errosCriticos",
    "exemploRespostaMelhor",
  ],
};

export interface AuditorContext {
  vendedor: string | null;
  etapaCrm: string | null;
  valorNegociacao: number | null;
  qtyPares: number | null;
  outcome: "won" | "lost";
}

export interface AuditorReport {
  naoAvaliavel: boolean;
  motivoNaoAvaliavel: string;
  resumo: string;
  notasPorCriterio: {
    precisaoInformacoes: number;
    entendimentoNecessidade: number;
    construcaoValor: number;
    conducaoProximoPasso: number;
    clarezaComunicacao: number;
  };
  justificativasPorCriterio: {
    precisaoInformacoes: string;
    entendimentoNecessidade: string;
    construcaoValor: string;
    conducaoProximoPasso: string;
    clarezaComunicacao: string;
  };
  evidencias: string[];
  acertos: string[];
  falhas: string[];
  errosCriticos: string[];
  exemploRespostaMelhor: string;
}

export interface AuditorResult {
  report: AuditorReport;
  score: number | null;
  classification: string | null;
  hasCriticalError: boolean;
}

function clampCriterio(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, max));
}

function classify(score: number): string {
  if (score >= 90) return "Excelente";
  if (score >= 80) return "Bom";
  if (score >= 70) return "Atenção";
  if (score >= 60) return "Insuficiente";
  return "Crítico";
}

export async function runAuditor(
  transcript: string,
  context: AuditorContext,
): Promise<AuditorResult> {
  const contents = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
  Resultado: context.outcome === "won" ? "venda fechada (won)" : "negociação perdida (lost)",
})}

Avalie a condução do vendedor nesta conversa (o resultado acima é contexto para o relatório, não deve influenciar a nota por si só, conforme a seção 7.4 do manual):

${transcript}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(AUDITOR_MODE_INSTRUCTIONS),
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: AUDITOR_RESPONSE_SCHEMA,
    },
    contents,
  });

  const report = JSON.parse(result.text || "{}") as AuditorReport;

  if (report.naoAvaliavel) {
    return { report, score: null, classification: null, hasCriticalError: false };
  }

  const notas = report.notasPorCriterio;
  const somaBruta =
    clampCriterio(notas.precisaoInformacoes, 25) +
    clampCriterio(notas.entendimentoNecessidade, 20) +
    clampCriterio(notas.construcaoValor, 20) +
    clampCriterio(notas.conducaoProximoPasso, 20) +
    clampCriterio(notas.clarezaComunicacao, 15);

  const hasCriticalError = (report.errosCriticos || []).length > 0;
  const score = hasCriticalError ? Math.min(somaBruta, 69) : somaBruta;

  return { report, score, classification: classify(score), hasCriticalError };
}

// ---------------------------------------------------------------------------
// Modo Copiloto
// ---------------------------------------------------------------------------

const COPILOTO_MODE_INSTRUCTIONS = `Modo: Copiloto de negociação. A negociação ainda está aberta — não dê
nota, dê orientação (manual, seção 8.5). Não invente probabilidade de
fechamento. Proponha uma única próxima melhor ação.`;

const COPILOTO_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    situacaoAtual: {
      type: Type.STRING,
      format: "enum",
      enum: [
        "avancando",
        "estagnada",
        "em_risco",
        "aguardando_cliente",
        "aguardando_acao_interna",
      ],
    },
    objetivoProvavelCliente: { type: Type.STRING },
    sinaisCompra: { type: Type.ARRAY, items: { type: Type.STRING } },
    objecoesAbertas: { type: Type.ARRAY, items: { type: Type.STRING } },
    informacoesNecessarias: { type: Type.ARRAY, items: { type: Type.STRING } },
    proximaAcao: { type: Type.STRING },
    mensagemSugerida: { type: Type.STRING },
    evitar: { type: Type.STRING },
  },
  required: [
    "situacaoAtual",
    "objetivoProvavelCliente",
    "sinaisCompra",
    "objecoesAbertas",
    "informacoesNecessarias",
    "proximaAcao",
    "mensagemSugerida",
    "evitar",
  ],
};

export interface CopilotoContext {
  vendedor: string | null;
  etapaCrm: string | null;
  valorNegociacao: number | null;
  qtyPares: number | null;
}

export interface CopilotoReport {
  situacaoAtual:
    | "avancando"
    | "estagnada"
    | "em_risco"
    | "aguardando_cliente"
    | "aguardando_acao_interna";
  objetivoProvavelCliente: string;
  sinaisCompra: string[];
  objecoesAbertas: string[];
  informacoesNecessarias: string[];
  proximaAcao: string;
  mensagemSugerida: string;
  evitar: string;
}

export async function runCopiloto(
  transcript: string,
  context: CopilotoContext,
): Promise<CopilotoReport> {
  const contents = `Contexto da negociação:
${contextBlock({
  Vendedor: context.vendedor ?? "não identificado",
  "Etapa atual do CRM": context.etapaCrm ?? "desconhecida",
  "Valor da negociação": context.valorNegociacao != null ? `R$ ${context.valorNegociacao.toFixed(2)}` : "não definido",
  "Quantidade de pares": context.qtyPares != null ? String(context.qtyPares) : "não definida",
})}

Analise esta negociação em andamento e diga o próximo passo:

${transcript}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(COPILOTO_MODE_INSTRUCTIONS),
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: COPILOTO_RESPONSE_SCHEMA,
    },
    contents,
  });

  return JSON.parse(result.text || "{}") as CopilotoReport;
}
```

- [ ] **Step 2: Verify with a real (short) transcript against the live Gemini API**

```bash
cat > /tmp/verify-agent.mjs <<'EOF'
import fs from "node:fs";
const envText = fs.readFileSync("C:/Users/User/Documents/hudlab/dashboard-hudlab/.env.local", "utf-8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { runAuditor, runCopiloto } = await import(
  "C:/Users/User/Documents/hudlab/dashboard-hudlab/lib/ghl/sales-agent/agent.ts"
);

const transcript = `[2026-07-20T10:00:00.000Z] CLIENTE: Oi, qual o valor do chinelo personalizado?
[2026-07-20T10:01:00.000Z] VENDEDOR: O valor começa em R$ 67,90 por par de 12 a 23 pares, e cai pra R$ 59,90 a partir de 24 pares, com frete grátis a partir de 36. Quantos pares você precisa?
[2026-07-20T10:05:00.000Z] CLIENTE: Preciso de uns 50 pares pra minha equipe de treino.
[2026-07-20T10:06:00.000Z] VENDEDOR: Perfeito, pra 50 pares fica R$ 59,90 por par com frete grátis. Pode me mandar o logo da equipe pra gente montar a Amostra Digital?
[2026-07-20T10:10:00.000Z] CLIENTE: Vou mandar sim, obrigado!`;

const auditor = await runAuditor(transcript, {
  vendedor: "Teste",
  etapaCrm: "Em Negociação",
  valorNegociacao: 2995,
  qtyPares: 50,
  outcome: "won",
});
console.log("AUDITOR score:", auditor.score, "classification:", auditor.classification, "criticalError:", auditor.hasCriticalError);
console.log("AUDITOR resumo:", auditor.report.resumo);

const copiloto = await runCopiloto(transcript, {
  vendedor: "Teste",
  etapaCrm: "Em Negociação",
  valorNegociacao: 2995,
  qtyPares: 50,
});
console.log("COPILOTO situacaoAtual:", copiloto.situacaoAtual);
console.log("COPILOTO proximaAcao:", copiloto.proximaAcao);
EOF
node --experimental-strip-types /tmp/verify-agent.mjs
```

Expected: `AUDITOR score` is a number between 0-100 (likely high, this is a clean example with no critical errors), `classification` is one of Excelente/Bom/Atenção, `criticalError: false`; `COPILOTO situacaoAtual` is `"avancando"` or `"aguardando_cliente"`, `proximaAcao` mentions following up for the logo. If the import fails because `--experimental-strip-types` can't resolve the `@/lib/ghl/api` path alias used inside `negotiation-conversations.ts` (this script only imports `agent.ts`, which doesn't need that alias, so it should be fine) — if it still fails, fall back to testing this through the actual Next.js dev server once Task 5 or 6 wires it into a route.

- [ ] **Step 3: Commit**

```bash
git add lib/ghl/sales-agent/agent.ts
git commit -m "feat: add Auditor/Copiloto agent module grounded in the Manual Comercial"
```

---

## Task 5: On-demand insight API route (Modo 2 — Copiloto)

**Files:**
- Create: `app/api/sellers-v2/negotiation-insight/route.ts`

**Interfaces:**
- Consumes: `getNegotiationTranscript`, `getVendedorForOpportunity`, `formatTranscriptForPrompt`, `NEGOTIATION_TRACKING_START_ISO` (Task 2); `runCopiloto`, `CopilotoContext` (Task 4); `ghl_negotiation_insights` table (Task 3); `createClient` from `@/lib/supabase/server`, `createSupabaseServerForSync` from `@/lib/supabase/server`.
- Produces: `POST /api/sellers-v2/negotiation-insight` — request body `{ opportunityId: string }`, success response `{ success: true, insight: CopilotoReport, messageCount: number }`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/sellers-v2/negotiation-insight/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  getNegotiationTranscript,
  getVendedorForOpportunity,
  formatTranscriptForPrompt,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { runCopiloto } from "@/lib/ghl/sales-agent/agent";
import { MANUAL_VERSION } from "@/lib/ghl/sales-agent/manual";

const MIN_MESSAGES_TO_EVALUATE = 2;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const opportunityId = body?.opportunityId;
    if (!opportunityId || typeof opportunityId !== "string") {
      return NextResponse.json(
        { error: "opportunityId é obrigatório" },
        { status: 400 },
      );
    }

    const { data: opportunity, error: oppError } = await supabase
      .from("ghl_opportunities")
      .select("id, contact_id, stage_name, status, monetary_value, qty_pares, raw")
      .eq("id", opportunityId)
      .single();

    if (oppError || !opportunity) {
      return NextResponse.json(
        { error: "Oportunidade não encontrada" },
        { status: 404 },
      );
    }

    const { data: negotiationEvent, error: eventError } = await supabase
      .from("ghl_funnel_events")
      .select("received_at")
      .eq("contact_id", opportunity.contact_id)
      .eq("stage_slug", "emnegociacao")
      .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
      .order("received_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (eventError || !negotiationEvent) {
      return NextResponse.json(
        {
          error:
            "Esta oportunidade ainda não entrou em negociação (ou entrou antes do lançamento deste recurso)",
        },
        { status: 404 },
      );
    }

    const [vendedor, transcript] = await Promise.all([
      getVendedorForOpportunity(opportunity.raw),
      getNegotiationTranscript(opportunity.contact_id, negotiationEvent.received_at),
    ]);

    if (transcript.messages.length < MIN_MESSAGES_TO_EVALUATE) {
      return NextResponse.json(
        {
          error:
            "Conversa muito curta para gerar um insight ainda. Aguarde mais mensagens trocadas.",
        },
        { status: 422 },
      );
    }

    const report = await runCopiloto(formatTranscriptForPrompt(transcript.messages), {
      vendedor,
      etapaCrm: opportunity.stage_name,
      valorNegociacao: opportunity.monetary_value,
      qtyPares: opportunity.qty_pares,
    });

    const serviceClient = await createSupabaseServerForSync();
    const { error: insertError } = await serviceClient
      .from("ghl_negotiation_insights")
      .insert({
        opportunity_id: opportunity.id,
        contact_id: opportunity.contact_id,
        vendedor,
        report,
        manual_version: MANUAL_VERSION,
        message_count: transcript.messages.length,
        requested_by: user.id,
      });

    if (insertError) {
      console.error("Failed to save negotiation insight:", insertError);
      // Still return the insight to the user even if persistence failed —
      // don't block the coaching value on a logging failure.
    }

    return NextResponse.json({
      success: true,
      insight: report,
      messageCount: transcript.messages.length,
    });
  } catch (error) {
    console.error("negotiation-insight API error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify against the dev server**

```bash
npm run dev
```

In another terminal, once the server is up, find a real `opportunity_id` whose contact has an `emnegociacao` event (query `ghl_funnel_events` for a recent `stage_slug = 'emnegociacao'` row and cross-reference `ghl_opportunities.contact_id`), then, logged into the dashboard in a browser to get a valid session cookie, call the route from the browser devtools console (so cookies are attached automatically):

```javascript
fetch("/api/sellers-v2/negotiation-insight", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ opportunityId: "PASTE_REAL_OPPORTUNITY_ID" }),
}).then((r) => r.json()).then(console.log);
```

Expected: `{ success: true, insight: { situacaoAtual: ..., proximaAcao: ..., mensagemSugerida: ..., ... }, messageCount: N }`. Then confirm a new row exists in `ghl_negotiation_insights` for that `opportunity_id`.

- [ ] **Step 3: Commit**

```bash
git add app/api/sellers-v2/negotiation-insight/route.ts
git commit -m "feat: add on-demand negotiation coaching endpoint (Modo Copiloto)"
```

---

## Task 6: Periodic evaluation cron route (Modo 1 — Auditor)

**Files:**
- Create: `app/api/cron/evaluate-negotiations/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `getNegotiationTranscript`, `getVendedorForOpportunity`, `formatTranscriptForPrompt`, `NEGOTIATION_TRACKING_START_ISO` (Task 2); `runAuditor`, `AuditorContext` (Task 4); `ghl_negotiation_evaluations` table (Task 3); `requireCronSecret` from `@/lib/security/route-guards`; `createSupabaseServerForSync` from `@/lib/supabase/server`.
- Produces: `GET /api/cron/evaluate-negotiations` — batch job, response `{ success: true, evaluated: number, skipped: number, errors: number }`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/cron/evaluate-negotiations/route.ts
//
// Modo Auditor (batch): for every opportunity that reached "Em Negociação"
// (ghl_funnel_events, stage_slug='emnegociacao') and has since been
// resolved (ghl_opportunities.status != 'open') and doesn't have an
// evaluation yet, fetch its WhatsApp transcript and score it. Runs after
// sync-ghl-daily so ghl_opportunities.status is fresh.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import {
  getNegotiationTranscript,
  getVendedorForOpportunity,
  formatTranscriptForPrompt,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { runAuditor } from "@/lib/ghl/sales-agent/agent";
import { MANUAL_VERSION } from "@/lib/ghl/sales-agent/manual";

const MIN_MESSAGES_TO_EVALUATE = 2;
const MAX_OPPORTUNITIES_PER_RUN = 25; // keep each run well under the Vercel maxDuration

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = await createSupabaseServerForSync();

  // No-backfill scope decision: only negotiations tagged from
  // NEGOTIATION_TRACKING_START_ISO onward are ever evaluated.
  const { data: negotiationEvents, error: eventsError } = await supabase
    .from("ghl_funnel_events")
    .select("contact_id, received_at")
    .eq("stage_slug", "emnegociacao")
    .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
    .order("received_at", { ascending: true });

  if (eventsError) {
    console.error("evaluate-negotiations: failed to load funnel events", eventsError);
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  // A tag can fire more than once for the same contact — keep the earliest.
  const startedAtByContact = new Map<string, string>();
  for (const event of negotiationEvents || []) {
    if (!startedAtByContact.has(event.contact_id)) {
      startedAtByContact.set(event.contact_id, event.received_at);
    }
  }

  if (startedAtByContact.size === 0) {
    return NextResponse.json({ success: true, evaluated: 0, skipped: 0, errors: 0 });
  }

  const { data: resolvedOpportunities, error: oppError } = await supabase
    .from("ghl_opportunities")
    .select("id, contact_id, stage_name, status, monetary_value, qty_pares, raw, updated_at")
    .in("contact_id", Array.from(startedAtByContact.keys()))
    .neq("status", "open");

  if (oppError) {
    console.error("evaluate-negotiations: failed to load opportunities", oppError);
    return NextResponse.json({ error: oppError.message }, { status: 500 });
  }

  const { data: alreadyEvaluated, error: evalError } = await supabase
    .from("ghl_negotiation_evaluations")
    .select("opportunity_id");

  if (evalError) {
    console.error("evaluate-negotiations: failed to load existing evaluations", evalError);
    return NextResponse.json({ error: evalError.message }, { status: 500 });
  }

  const evaluatedIds = new Set((alreadyEvaluated || []).map((r) => r.opportunity_id));
  const pending = (resolvedOpportunities || [])
    .filter((o) => !evaluatedIds.has(o.id))
    .slice(0, MAX_OPPORTUNITIES_PER_RUN);

  let evaluated = 0;
  let skipped = 0;
  let errors = 0;

  for (const opportunity of pending) {
    try {
      const negotiationStartedAt = startedAtByContact.get(opportunity.contact_id)!;
      const [vendedor, transcript] = await Promise.all([
        getVendedorForOpportunity(opportunity.raw),
        getNegotiationTranscript(opportunity.contact_id, negotiationStartedAt),
      ]);

      const outcome: "won" | "lost" = opportunity.status === "won" ? "won" : "lost";

      // The opportunity is already resolved (won/lost), so its message
      // count will never grow — if it's too short to evaluate now, it
      // never will be. Record it as "não avaliável" once instead of
      // leaving it pending forever (which would make the cron re-fetch
      // and re-check it on every run, indefinitely).
      let result: {
        score: number | null;
        classification: string | null;
        hasCriticalError: boolean;
        report: unknown;
      };
      if (transcript.messages.length < MIN_MESSAGES_TO_EVALUATE) {
        result = {
          score: null,
          classification: null,
          hasCriticalError: false,
          report: {
            naoAvaliavel: true,
            motivoNaoAvaliavel: `Conversa com apenas ${transcript.messages.length} mensagem(ns) de WhatsApp após o início da negociação — sem dados suficientes.`,
            resumo: "",
            notasPorCriterio: {
              precisaoInformacoes: 0,
              entendimentoNecessidade: 0,
              construcaoValor: 0,
              conducaoProximoPasso: 0,
              clarezaComunicacao: 0,
            },
            justificativasPorCriterio: {
              precisaoInformacoes: "",
              entendimentoNecessidade: "",
              construcaoValor: "",
              conducaoProximoPasso: "",
              clarezaComunicacao: "",
            },
            evidencias: [],
            acertos: [],
            falhas: [],
            errosCriticos: [],
            exemploRespostaMelhor: "",
          },
        };
      } else {
        result = await runAuditor(formatTranscriptForPrompt(transcript.messages), {
          vendedor,
          etapaCrm: opportunity.stage_name,
          valorNegociacao: opportunity.monetary_value,
          qtyPares: opportunity.qty_pares,
          outcome,
        });
      }

      const { error: insertError } = await supabase
        .from("ghl_negotiation_evaluations")
        .insert({
          opportunity_id: opportunity.id,
          contact_id: opportunity.contact_id,
          vendedor,
          outcome,
          score: result.score,
          classification: result.classification,
          has_critical_error: result.hasCriticalError,
          report: result.report,
          manual_version: MANUAL_VERSION,
          message_count: transcript.messages.length,
          negotiation_started_at: negotiationStartedAt,
          resolved_at: opportunity.updated_at,
        });

      if (insertError) {
        console.error(
          `evaluate-negotiations: failed to save evaluation for ${opportunity.id}`,
          insertError,
        );
        errors++;
      } else {
        evaluated++;
      }
    } catch (err) {
      console.error(`evaluate-negotiations: failed to evaluate ${opportunity.id}`, err);
      errors++;
    }
  }

  return NextResponse.json({ success: true, evaluated, skipped, errors });
}
```

- [ ] **Step 2: Register the cron job in `vercel.json`**

Open `vercel.json` and add an entry to the `"crons"` array (after the existing `sync-deals`/`sync-designer-mockups` entries — this doesn't need to run at a specific minute relative to `sync-ghl-daily`, since `sync-ghl-daily` runs on Supabase's own `pg_cron` at 09:10 UTC, unrelated to this file; pick a time comfortably after that, e.g. 09:40 UTC):

```json
    {
      "path": "/api/cron/evaluate-negotiations",
      "schedule": "40 9 * * *"
    }
```

Also add a `maxDuration` entry to the `"functions"` object, matching the pattern of the other cron routes:

```json
    "app/api/cron/evaluate-negotiations/route.ts": {
      "maxDuration": 300
    }
```

- [ ] **Step 3: Verify with a manual invocation against the dev server**

```bash
npm run dev
```

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/evaluate-negotiations | node -e "process.stdin.pipe(require('fs').createWriteStream('/dev/stdout'))"
```

(Replace `$CRON_SECRET` with the actual value from `.env.local`.) Expected: `{"success":true,"evaluated":N,"skipped":M,"errors":0}` with no thrown exceptions in the `next dev` console. If there are zero resolved+tagged opportunities yet in the data, `evaluated` and `skipped` will both be `0` — that's a valid pass, it means the query logic ran without error, not that nothing was tested. To exercise the scoring path end-to-end before real data exists, temporarily insert one fake `ghl_funnel_events` row (`stage_slug='emnegociacao'`) and one fake `ghl_opportunities` row (`status='won'`) pointing at a contact_id with a real WhatsApp conversation, run the curl again, confirm a row appears in `ghl_negotiation_evaluations`, then delete the fake rows.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/evaluate-negotiations/route.ts vercel.json
git commit -m "feat: add periodic negotiation evaluation cron (Modo Auditor)"
```

---

## Task 7: Negotiations list API route

**Files:**
- Create: `app/api/sellers-v2/negotiations/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `NEGOTIATION_TRACKING_START_ISO` (Task 2).
- Produces: `GET /api/sellers-v2/negotiations` — response `{ active: ActiveNegotiation[], closed: ClosedNegotiation[], rankingByVendedor: VendedorRanking[] }`, consumed by Task 8 (UI).

- [ ] **Step 1: Write the route**

```typescript
// app/api/sellers-v2/negotiations/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEGOTIATION_TRACKING_START_ISO } from "@/lib/ghl/negotiation-conversations";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // No-backfill scope decision: same cutoff as the evaluate-negotiations
    // cron (Task 6) and the on-demand insight route (Task 5).
    const { data: negotiationEvents, error: eventsError } = await supabase
      .from("ghl_funnel_events")
      .select("contact_id, contact_name, received_at")
      .eq("stage_slug", "emnegociacao")
      .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
      .order("received_at", { ascending: true });
    if (eventsError) throw eventsError;

    const startedAtByContact = new Map<string, { name: string | null; startedAt: string }>();
    for (const event of negotiationEvents || []) {
      if (!startedAtByContact.has(event.contact_id)) {
        startedAtByContact.set(event.contact_id, {
          name: event.contact_name,
          startedAt: event.received_at,
        });
      }
    }
    const contactIds = Array.from(startedAtByContact.keys());

    const { data: openOpportunities, error: openError } = contactIds.length
      ? await supabase
          .from("ghl_opportunities")
          .select("id, contact_id, stage_name")
          .in("contact_id", contactIds)
          .eq("status", "open")
      : { data: [], error: null };
    if (openError) throw openError;

    const openOppIds = (openOpportunities || []).map((o) => o.id);
    const { data: latestInsights, error: insightsError } = openOppIds.length
      ? await supabase
          .from("ghl_negotiation_insights")
          .select("opportunity_id, report, created_at")
          .in("opportunity_id", openOppIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (insightsError) throw insightsError;

    const latestInsightByOpportunity = new Map<string, { report: unknown; createdAt: string }>();
    for (const insight of latestInsights || []) {
      if (!latestInsightByOpportunity.has(insight.opportunity_id)) {
        latestInsightByOpportunity.set(insight.opportunity_id, {
          report: insight.report,
          createdAt: insight.created_at,
        });
      }
    }

    const active = (openOpportunities || []).map((opp) => {
      const started = startedAtByContact.get(opp.contact_id);
      const latestInsight = latestInsightByOpportunity.get(opp.id) || null;
      return {
        opportunityId: opp.id,
        contactId: opp.contact_id,
        contactName: started?.name ?? null,
        stageName: opp.stage_name,
        negotiationStartedAt: started?.startedAt ?? null,
        latestInsight,
      };
    });

    const { data: closedRows, error: closedError } = await supabase
      .from("ghl_negotiation_evaluations")
      .select(
        "opportunity_id, contact_id, vendedor, outcome, score, classification, has_critical_error, report, evaluated_at",
      )
      .order("evaluated_at", { ascending: false })
      .limit(100);
    if (closedError) throw closedError;

    const closed = closedRows || [];

    const scoresByVendedor = new Map<string, number[]>();
    for (const row of closed) {
      if (!row.vendedor || row.score == null) continue;
      const list = scoresByVendedor.get(row.vendedor) ?? [];
      list.push(row.score);
      scoresByVendedor.set(row.vendedor, list);
    }
    const rankingByVendedor = Array.from(scoresByVendedor.entries())
      .map(([vendedor, scores]) => ({
        vendedor,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return NextResponse.json({ active, closed, rankingByVendedor });
  } catch (error) {
    console.error("negotiations list API error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify against the dev server**

```bash
npm run dev
```

While logged into the dashboard in a browser, open devtools console on any dashboard page and run:

```javascript
fetch("/api/sellers-v2/negotiations").then((r) => r.json()).then(console.log);
```

Expected: `{ active: [...], closed: [...], rankingByVendedor: [...] }` with no `error` key. `active`/`closed` can legitimately be empty arrays if Task 6's manual smoke test rows were cleaned up — that's fine, it means the query ran without throwing.

- [ ] **Step 3: Commit**

```bash
git add app/api/sellers-v2/negotiations/route.ts
git commit -m "feat: add negotiations list endpoint for the Atendimentos Reais tab"
```

---

## Task 8: UI — "Atendimentos Reais" tab in `/sellers_v2`

**Files:**
- Modify: `app/sellers_v2/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sellers-v2/negotiations` (Task 7), `POST /api/sellers-v2/negotiation-insight` (Task 5).

- [ ] **Step 1: Add the new types near the top of the file**

In `app/sellers_v2/page.tsx`, right after the existing `ChatMessage` interface (around line 73), add:

```typescript
interface AuditorReport {
  resumo: string;
  notasPorCriterio: {
    precisaoInformacoes: number;
    entendimentoNecessidade: number;
    construcaoValor: number;
    conducaoProximoPasso: number;
    clarezaComunicacao: number;
  };
  evidencias: string[];
  acertos: string[];
  falhas: string[];
  errosCriticos: string[];
  exemploRespostaMelhor: string;
}

interface CopilotoReport {
  situacaoAtual: string;
  objetivoProvavelCliente: string;
  sinaisCompra: string[];
  objecoesAbertas: string[];
  informacoesNecessarias: string[];
  proximaAcao: string;
  mensagemSugerida: string;
  evitar: string;
}

interface ActiveNegotiation {
  opportunityId: string;
  contactId: string;
  contactName: string | null;
  stageName: string | null;
  negotiationStartedAt: string | null;
  latestInsight: { report: CopilotoReport; createdAt: string } | null;
}

interface ClosedNegotiation {
  opportunityId: string;
  contactId: string;
  vendedor: string | null;
  outcome: "won" | "lost";
  score: number | null;
  classification: string | null;
  hasCriticalError: boolean;
  report: AuditorReport;
  evaluatedAt: string;
}

interface VendedorRanking {
  vendedor: string;
  avgScore: number;
  count: number;
}
```

Note the API returns snake_case for `closed` (straight from Postgres column names via supabase-js, which does *not* auto-camelCase). Map it explicitly in the fetch function in Step 2 rather than relying on the raw shape matching `ClosedNegotiation`.

- [ ] **Step 2: Add state and fetch logic**

Right after the existing evaluation-related state block (after `const [evaluation, setEvaluation] = useState<...>(null);`, around line 146), add:

```typescript
  // Atendimentos Reais state
  const [activeNegotiations, setActiveNegotiations] = useState<ActiveNegotiation[]>([]);
  const [closedNegotiations, setClosedNegotiations] = useState<ClosedNegotiation[]>([]);
  const [negotiationRanking, setNegotiationRanking] = useState<VendedorRanking[]>([]);
  const [loadingNegotiations, setLoadingNegotiations] = useState(true);
  const [generatingInsightFor, setGeneratingInsightFor] = useState<string | null>(null);
  const [negotiationError, setNegotiationError] = useState<string | null>(null);
  const [expandedClosedId, setExpandedClosedId] = useState<string | null>(null);

  const fetchNegotiations = useCallback(async () => {
    try {
      const res = await fetch(`/api/sellers-v2/negotiations?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch negotiations");
      const data = await res.json();
      setActiveNegotiations(data.active || []);
      setClosedNegotiations(
        (data.closed || []).map((row: any) => ({
          opportunityId: row.opportunity_id,
          contactId: row.contact_id,
          vendedor: row.vendedor,
          outcome: row.outcome,
          score: row.score,
          classification: row.classification,
          hasCriticalError: row.has_critical_error,
          report: row.report,
          evaluatedAt: row.evaluated_at,
        })),
      );
      setNegotiationRanking(data.rankingByVendedor || []);
    } catch (error) {
      console.error("Error fetching negotiations:", error);
    } finally {
      setLoadingNegotiations(false);
    }
  }, []);

  useEffect(() => {
    fetchNegotiations();
  }, [fetchNegotiations]);

  const generateInsight = async (opportunityId: string) => {
    setGeneratingInsightFor(opportunityId);
    setNegotiationError(null);
    try {
      const res = await fetch("/api/sellers-v2/negotiation-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNegotiationError(data.error || "Não foi possível gerar o insight.");
        return;
      }
      await fetchNegotiations();
    } catch (error) {
      console.error("Error generating insight:", error);
      setNegotiationError("Erro de conexão ao gerar insight.");
    } finally {
      setGeneratingInsightFor(null);
    }
  };
```

- [ ] **Step 3: Add the third tab trigger**

Change the `TabsList` (around line 409) from:

```tsx
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rankings" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Rankings</span>
            <span className="sm:hidden">Rank</span>
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Treinamento IA</span>
            <span className="sm:hidden">Treino</span>
          </TabsTrigger>
        </TabsList>
```

to:

```tsx
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rankings" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Rankings</span>
            <span className="sm:hidden">Rank</span>
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Treinamento IA</span>
            <span className="sm:hidden">Treino</span>
          </TabsTrigger>
          <TabsTrigger value="real" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Atendimentos Reais</span>
            <span className="sm:hidden">Reais</span>
          </TabsTrigger>
        </TabsList>
```

- [ ] **Step 4: Add the ranking card**

Inside the existing `rankings` `TabsContent` block, right after the closing `</Card>` of "Ranking 3: Weekly Training" (around line 668, just before the `</TabsContent>` that closes the rankings tab), add a fourth ranking card:

```tsx
          {/* Ranking 4: Atendimento Real */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                Ranking de Atendimento Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : negotiationRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação avaliada ainda
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">
                        Negociações
                      </TableHead>
                      <TableHead className="text-right">Nota Média</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {negotiationRanking.map((seller, idx) => (
                      <TableRow key={seller.vendedor} className={idx < 3 ? "bg-muted/30" : ""}>
                        <TableCell className="font-bold">
                          {idx < 3 ? medalIcons[idx] : idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">{seller.vendedor}</TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          {seller.count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={seller.avgScore >= 70 ? "default" : "secondary"}>
                            {seller.avgScore}/100
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 5: Add the new "Atendimentos Reais" tab content**

Right after the closing `</TabsContent>` of the `training` tab (around line 1208, right before the final `</Tabs>`), add:

```tsx
        {/* ======== ATENDIMENTOS REAIS TAB ======== */}
        <TabsContent value="real" className="space-y-6 mt-4">
          {negotiationError && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive flex-1">{negotiationError}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNegotiationError(null)}
                className="text-destructive hover:text-destructive"
              >
                ✕
              </Button>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                Em Negociação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : activeNegotiations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação em andamento
                </p>
              ) : (
                <div className="space-y-4">
                  {activeNegotiations.map((neg) => (
                    <div key={neg.opportunityId} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{neg.contactName || "Contato sem nome"}</p>
                          <p className="text-xs text-muted-foreground">
                            {neg.stageName || "Etapa desconhecida"}
                            {neg.negotiationStartedAt &&
                              ` · em negociação desde ${new Date(neg.negotiationStartedAt).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => generateInsight(neg.opportunityId)}
                          disabled={generatingInsightFor === neg.opportunityId}
                        >
                          {generatingInsightFor === neg.opportunityId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Gerar Insight"
                          )}
                        </Button>
                      </div>
                      {neg.latestInsight && (
                        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                          <p>
                            <span className="font-medium">Situação:</span>{" "}
                            {neg.latestInsight.report.situacaoAtual}
                          </p>
                          <p>
                            <span className="font-medium">Próxima ação:</span>{" "}
                            {neg.latestInsight.report.proximaAcao}
                          </p>
                          <p>
                            <span className="font-medium">Mensagem sugerida:</span>{" "}
                            {neg.latestInsight.report.mensagemSugerida}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Gerado em{" "}
                            {new Date(neg.latestInsight.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Fechadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : closedNegotiations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação avaliada ainda
                </p>
              ) : (
                <div className="space-y-3">
                  {closedNegotiations.map((neg) => (
                    <div key={neg.opportunityId} className="rounded-lg border p-4">
                      <button
                        className="flex w-full items-center justify-between text-left cursor-pointer"
                        onClick={() =>
                          setExpandedClosedId(
                            expandedClosedId === neg.opportunityId ? null : neg.opportunityId,
                          )
                        }
                      >
                        <div>
                          <p className="font-medium">{neg.vendedor || "Sem vendedor identificado"}</p>
                          <p className="text-xs text-muted-foreground">
                            {neg.outcome === "won" ? "Venda fechada" : "Negociação perdida"} ·{" "}
                            {new Date(neg.evaluatedAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {neg.hasCriticalError && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          {neg.score != null ? (
                            <Badge variant={neg.score >= 70 ? "default" : "secondary"}>
                              {neg.score}/100 · {neg.classification}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Não avaliável</Badge>
                          )}
                        </div>
                      </button>
                      {expandedClosedId === neg.opportunityId && neg.score != null && (
                        <div className="mt-4 space-y-3 text-sm border-t pt-3">
                          <p className="text-muted-foreground">{neg.report.resumo}</p>
                          {neg.report.errosCriticos.length > 0 && (
                            <div>
                              <p className="font-medium text-destructive">Erros críticos</p>
                              <ul className="list-disc list-inside text-muted-foreground">
                                {neg.report.errosCriticos.map((e, i) => (
                                  <li key={i}>{e}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">Acertos</p>
                            <ul className="list-disc list-inside text-muted-foreground">
                              {neg.report.acertos.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-medium">Falhas e oportunidades perdidas</p>
                            <ul className="list-disc list-inside text-muted-foreground">
                              {neg.report.falhas.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-medium">Exemplo de resposta melhor</p>
                            <p className="text-muted-foreground">{neg.report.exemploRespostaMelhor}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
```

- [ ] **Step 6: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:3000/sellers_v2`, click the new "Atendimentos Reais" tab, confirm:
- The tab renders without console errors.
- "Em Negociação" and "Fechadas" sections load (either real data or the "Nenhuma..." empty states — both are valid, not broken).
- If there's at least one active negotiation, clicking "Gerar Insight" shows a spinner, then either an insight block appears or `negotiationError` renders with a clear message (e.g., "conversa muito curta").
- Clicking a closed negotiation row expands/collapses the detailed report.
- The new "Ranking de Atendimento Real" card renders on the Rankings tab.

- [ ] **Step 7: Commit**

```bash
git add app/sellers_v2/page.tsx
git commit -m "feat: add Atendimentos Reais tab (Auditor/Copiloto UI) to sellers_v2"
```

---

## Post-implementation checklist (not a task — do this after Task 8)

- Confirm `GHL_PRIVATE_INTEGRATION_TOKEN`'s scopes include `conversations.readonly` and `conversations/message.readonly` in the GHL location's Private Integration settings (it worked in every verification script above, but re-confirm explicitly before relying on it in production).
- Add `GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_LOCATION_ID`, and `GEMINI_API_KEY` to the Vercel production environment (they currently only exist in local `.env.local`).
- Delete any leftover throwaway verification scripts under `/tmp` — none of them should be committed.
