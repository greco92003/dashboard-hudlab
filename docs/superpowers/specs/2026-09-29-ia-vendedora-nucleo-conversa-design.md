# IA vendedora — fatia 1: núcleo de conversa

Data: 2026-09-29

## Objetivo

Substituir o vendedor humano no WhatsApp por uma IA autônoma, do ponto em que o humano assume hoje até o fechamento. A IA conversa, tira dúvidas, ajusta o orçamento, pede alteração de arte ao design e escala para uma pessoa quando não deve decidir sozinha.

O projeto inteiro é grande demais para um ciclo só. Este documento detalha a **fatia 1**; as outras ganham desenho próprio.

| Fatia | Entrega |
|---|---|
| 1. Núcleo de conversa | A IA responde, age e escala. Fechamento ainda passa por humano (só para gerar a cobrança). |
| 2. Fechamento | Cobrança no Asaas criada pela IA + webhook de pagamento confirmado → oportunidade ganha. Remove o escalonamento "pronto para pagar". O campo personalizado "link de pagamento" da oportunidade (já previsto no spec do fluxo de caixa) liga a cobrança ao negócio. |
| 3. Cadência de follow-up | Reengajamento fora da janela de 24h com templates aprovados na Meta, coordenado com as automações existentes (promo de quinta). |
| 4. Medição | Painel IA × humano: conversão, tempo até fechar, notas do Auditor. |

## Decisões

- **Autonomia total.** A IA não pede aprovação para responder.
- **Entra onde o humano entra hoje.** O bot de intake (workflow do GHL) continua igual: mockup básico, orçamento rápido, botões. A IA assume na primeira mensagem livre do cliente depois dele.
- **Persona com nome próprio**, tom humano e caloroso, que nunca nega ser IA se perguntada e oferece uma pessoa. Nome em constante (`AI_SELLER_PERSONA_NAME`, padrão "Lia").
- **Arquitetura híbrida.** O GHL cuida do gatilho e da espera (workflow); o app decide e age. Sem fila nem infraestrutura nova no Vercel.
- **24/7 com atraso natural.** Espera ~90s e responde tudo que o cliente mandou em sequência de uma vez.
- **Rollout por split de leads novos**, começando em 10%.
- **Sem follow-up proativo nesta fatia.** A IA só responde. Reengajamento continua com as automações atuais até a fatia 3.
- **Modelo**: `gpt-5.6-terra` via Responses API com ferramentas, esforço de raciocínio `medium` — o mesmo do Copiloto.

## Fluxo

1. **Quem é da IA.** No fim do bot de intake, um passo de split do workflow sorteia a fatia. Na fatia da IA: tag `ia-atendimento` no contato e campo Vendedor = persona. Fora dela, nada muda. Contato com a tag `ia-teste` (ver "Ambiente de teste") cai sempre na fatia da IA, sem sorteio.
2. **Gatilho.** Workflow "Cliente respondeu" (WhatsApp) com filtro na tag `ia-atendimento` → espera 90s → webhook `POST /api/ai-seller/respond` com `contactId`, protegido pelo cabeçalho `x-ai-seller-secret` (`AI_SELLER_WEBHOOK_SECRET`).
3. **Decisão de rodar** (função pura, testável), lendo a conversa pelo `getNegotiationTranscript` existente:
   - mensagem do cliente mais nova tem menos de 80s → `pulou:agrupando` (a chamada disparada por ela vai responder por todas);
   - já existe mensagem da IA depois da última do cliente → `pulou:ja_respondido`;
   - há mensagem de humano com data posterior à criação da oportunidade atual → `humano_assumiu` (remove a tag `ia-atendimento`, não responde). A data de corte evita que o histórico antigo de um cliente recorrente cale a IA num lead novo;
   - limite de 6 mensagens da IA para o contato na última hora atingido → `pulou:limite` e escala;
   - senão → roda o cérebro.
4. **Cérebro** decide e chama ferramentas (abaixo), em loop de no máximo 5 passos.
5. **Registro** da rodada em `ai_seller_runs`.

**Botão de pânico**: desativar o workflow no GHL. Para imediatamente todos os gatilhos, sem deploy, e qualquer pessoa da equipe consegue fazer.

**Como se sabe que uma fala é da IA**: o id de toda mensagem enviada pela IA fica gravado em `ai_seller_runs.sent_message_ids`. "Humano" = mensagem de saída com `source` diferente de `"workflow"` e cujo id não está nesse registro. Não depende de como o GHL rotula mensagens enviadas por API.

## Cérebro

Uma chamada ao modelo com:

- **Instruções**: persona + manual comercial completo (`MANUAL_COMERCIAL_TEXT`) + as regras já validadas no Copiloto (mensagens `AUTOMAÇÃO` não são conduta do vendedor, data de hoje, valor do CRM é só o orçamento automático inicial, nunca atribuir ao cliente algo que ele não disse) + regras de escalonamento + estilo WhatsApp (mensagens curtas, uma pergunta por vez, sem textão).
- **Contexto**: oportunidade ao vivo (etapa, vendedor, quantidade — como o `generateCopilotoInsight` já resolve) e a conversa inteira com imagens e áudio transcrito (`buildTranscriptParts` de `agent.ts`, que passa a ser exportado).

## Ferramentas

| Ferramenta | Entrada | O que faz |
|---|---|---|
| `enviar_mensagens` | 1 a 3 textos | Envia em sequência pela API de conversas do GHL. Encerra a rodada. |
| `atualizar_orcamento` | quantidade de pares | Calcula o preço unitário **no código** pela tabela de faixas do manual (12–23: 67,90; 24–99: 59,90; 100–499: 54,90; 500–999: 52,90; 1.000+: 49,90) e grava a cadeia do orçamento no GHL (oportunidade e contato, ver memória `ghl-escrita-via-api`). Devolve os valores para a IA citar. O LLM nunca faz conta de preço. |
| `cotar_frete` | CEP, quantidade de pares | Usa o motor de frete existente (`lib/freight`). Frete grátis a partir de 36 pares é regra do manual, aplicada no código. |
| `solicitar_ajuste_arte` | resumo do pedido de ajuste | Move a demanda do contato no pipeline "Fábrica de Mockups" para "Alteração". O agente de briefing que já existe (`lib/ghl/mockup-instructions`) escreve para os designers. A IA avisa o cliente do prazo. O workflow de "mockup pronto" envia a nova arte como hoje; a resposta do cliente a ela aciona a IA normalmente. |
| `escalar_para_humano` | motivo, resumo | Remove `ia-atendimento`, adiciona `ia-escalado`, atribui o contato ao usuário `AI_SELLER_ESCALATION_USER_ID` (padrão: Schay), cria nota interna com motivo e resumo, e envia ao cliente uma mensagem curta de passagem. |
| `nao_responder` | motivo | Registra que nenhuma resposta cabe (despedida já encerrada, mensagem que não era para a Hud Lab, spam). |

**Escalonamento obrigatório**:

- pedido de 500 pares ou mais;
- desconto ou condição fora do manual, ou tema marcado como "pendente de decisão" no manual;
- reclamação, garantia, defeito ou problema com pedido anterior;
- cliente pede para falar com uma pessoa;
- **pronto para pagar** (arte aprovada, grade, CEP e forma de pagamento definidos) — temporário, até a fatia 2.

## Dados

`ai_seller_runs` — uma linha por acionamento do endpoint.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | |
| `contact_id` | text | |
| `opportunity_id` | text, nulo | |
| `triggered_at` | timestamptz | |
| `decision` | text | `respondeu`, `nao_respondeu`, `escalou`, `humano_assumiu`, `pulou:agrupando`, `pulou:ja_respondido`, `pulou:limite`, `erro` |
| `escalation_reason` | text, nulo | |
| `tool_calls` | jsonb | ferramentas chamadas, entradas e saídas |
| `sent_message_ids` | text[] | ids devolvidos pelo GHL |
| `model` | text | |
| `usage` | jsonb | tokens |
| `latency_ms` | integer | |
| `error` | text, nulo | |

RLS no padrão do projeto: leitura para autenticados aprovados, escrita só pelo service role.

## Falhas

Regra: **o cliente nunca fica sem resposta em silêncio.**

- Falha do modelo ou de uma ferramenta: tenta mais uma vez. Falhou de novo → `escalar_para_humano` com motivo "falha técnica" e `decision = erro`.
- Falha ao enviar pelo GHL depois de a resposta estar pronta: mesma coisa.
- Se até o escalonamento falhar, a linha fica com `decision = erro` e o log do Vercel registra — o resumo diário (abaixo) mostra.

## Ambiente de teste

O teste usa o mesmo caminho da produção, só com o sorteio forçado. Não existe versão paralela da IA para teste.

- **Entrada por palavra-chave.** Qualquer pessoa convidada manda a palavra-chave (`LIA TESTE`) no WhatsApp da Hud Lab. Um workflow aplica a tag `ia-teste` e dispara o bot de intake normal: mockup básico, orçamento rápido, Amostra Digital Oficial.
- **Braço forçado.** No split, `ia-teste` vai sempre para a IA. Enquanto os testes rodam, o split real fica em **0%**: nenhum cliente de verdade é atendido pela IA até a decisão de abrir.
- **Design de verdade, marcado como teste.** A Amostra Digital Oficial e os pedidos de ajuste chegam à Fábrica de Mockups identificados como TESTE, para o time de design saber que não é venda real. Cada testador custa tempo de designer e espera de até 24h úteis, então o número de testadores simultâneos é pequeno e combinado com o design.
- **Fechamento com a Schay.** Como no fluxo real desta fatia, "pronto para pagar" escala para a Schay. Com `ia-teste`, ela encerra sem gerar cobrança.
- **Fora das métricas de negócio, dentro das de qualidade.** Contatos `ia-teste` são excluídos do funil, do BI e dos rankings (senão inflam lead e conversão), mas continuam sendo avaliados pelo Copiloto e pelo Auditor, porque é assim que se mede a qualidade da IA.

## Testes e rollout

1. **Testes automatizados** das partes puras: decisão de rodar (agrupar, já respondido, humano assumiu, limite), preço por faixa, frete grátis a partir de 36 pares.
2. **Piloto por palavra-chave**, com split real em 0%. Roteiro mínimo que os testadores cobrem entre si: dúvida de preço e prazo, mudança de quantidade, pedido de ajuste de arte, áudio, pedido de desconto acima do manual, pedido de 600 pares, "quero falar com uma pessoa", cliente pronto para pagar, vendedor humano entrando no meio.
3. **Split em 10%** dos leads novos. Acompanhamento diário pelo Copiloto (já roda a cada 15 min nas negociações abertas) e pelo Auditor (nas resolvidas), mais contagem de `decision` em `ai_seller_runs`. A fatia sobe conforme os números.

## Fora do escopo desta fatia

- Criar cobrança no Asaas (fatia 2).
- Follow-up proativo e templates da Meta (fatia 3).
- Painel comparativo IA × humano (fatia 4).
- Substituir o bot de intake.
- Negociações que já estão com humano hoje: só leads novos entram no split.

## A confirmar no plano de implementação

Pontos de API que o plano precisa verificar ao vivo antes de codar, como foi feito com o campo `source`:

- corpo exato do envio de mensagem WhatsApp pela API de conversas do GHL e o `source` com que essas mensagens voltam na leitura;
- como o pipeline "Fábrica de Mockups" liga a demanda de design ao contato (para a IA achar a oportunidade certa a mover);
- conversão de quantidade de pares em volumes para o motor de frete;
- se o passo de split do workflow e o filtro por tag cobrem o gatilho como descrito;
- como o workflow da palavra-chave inicia o bot de intake (hoje ele começa pela mensagem padrão "tenho interesse", com código `HL-`);
- como a demanda de teste aparece para o time de design na Fábrica de Mockups (tag visível no card, prefixo no nome ou nota no briefing);
- em quais leituras entra o filtro da tag `ia-teste`: `sync-ghl` / `ghl_opportunities`, funil, BI Meta × GHL, rankings de vendedores.
