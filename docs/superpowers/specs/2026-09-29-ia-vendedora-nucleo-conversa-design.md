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
2. **Gatilho.** Workflow "Cliente respondeu" (WhatsApp) com filtro na tag `ia-atendimento` → espera 90s → webhook `POST /api/ai-seller/respond` com `contactId`, protegido pelo cabeçalho `Authorization: Bearer <AI_SELLER_WEBHOOK_SECRET>`. O agrupamento é essa espera: o GHL ignora nova entrada de um contato ainda inscrito no workflow, então as mensagens que chegam durante os 90s não disparam chamada própria e são respondidas pela chamada da primeira. Por isso o endpoint devolve 202 na hora e roda em segundo plano (`after`): se segurasse o webhook enquanto a IA pensa, o contato seguiria inscrito e a mensagem seguinte também seria ignorada.
3. **Decisão de rodar** (função pura, testável), lendo a conversa pelo `getNegotiationTranscript` existente:
   - já existe mensagem da IA enviada por uma rodada que começou depois da última mensagem do cliente → `pulou:ja_respondido` (resposta de rodada que já rodava quando o cliente escreveu não conta: ela não viu a mensagem);
   - contato sem a tag `ia-atendimento` → `pulou:sem_tag` (defesa contra workflow mal configurado);
   - há mensagem de humano (saída com `userId`, que não é automação nem enviada pela IA) depois da primeira rodada da sessão atual da IA com esse contato → `humano_assumiu` (remove a tag `ia-atendimento`, deixa nota, não responde). Na primeira rodada não há essa checagem: o histórico antigo de um cliente recorrente não cala a IA;
   - limite de 6 mensagens da IA para o contato na última hora atingido → `pulou:limite` e escala;
   - senão → roda o cérebro.

   Uma rodada por contato por vez: a rodada real começa gravando uma linha `rodando` (índice único parcial por contato); uma segunda chamada simultânea vira `pulou:em_andamento`. Logo antes de enviar, a rodada relê o fim da conversa; se o cliente escreveu de novo, não envia (`pulou:mensagem_nova`) e a chamada da mensagem nova responde tudo. Exceção: se a rodada foi longa e essa chamada chegou com a trava ocupada (virou `pulou:em_andamento`), ela não volta; a rodada que terminou sem responder a mensagem nova escala para humano (`falha_tecnica`). A sessão nova depois de um escalonamento começa na primeira rodada em que a IA de fato rodou (não contam `pulou:sem_tag`, `pulou:em_andamento` nem erro não escalado).
4. **Cérebro** decide e chama ferramentas (abaixo), em loop de no máximo 5 passos.
5. **Registro** da rodada em `ai_seller_runs`.

**Botão de pânico**: desativar o workflow no GHL. Para imediatamente todos os gatilhos, sem deploy, e qualquer pessoa da equipe consegue fazer.

**Como se sabe que uma fala é da IA**: o id de toda mensagem enviada pela IA fica gravado em `ai_seller_runs.sent_message_ids`. "Humano" = mensagem de saída com `userId` preenchido, `source` diferente de `"workflow"` e cujo id não está nesse registro. Verificado ao vivo em 29/09: mensagem enviada pela API volta com `source: "app"` e `userId` vazio; a do vendedor, com `userId`. Saída sem `userId` que não é da IA é de origem desconhecida e não cala a IA.

## Cérebro

Uma chamada ao modelo com:

- **Instruções**: persona + manual comercial completo (`MANUAL_COMERCIAL_TEXT`) + as regras já validadas no Copiloto (mensagens `AUTOMAÇÃO` não são conduta do vendedor, data de hoje, valor do CRM é só o orçamento automático inicial, nunca atribuir ao cliente algo que ele não disse) + regras de escalonamento + estilo WhatsApp (mensagens curtas, uma pergunta por vez, sem textão).
- **Contexto**: oportunidade ao vivo (etapa, vendedor, quantidade — como o `generateCopilotoInsight` já resolve) e a conversa inteira com imagens e áudio transcrito (`buildTranscriptParts` de `agent.ts`, que passa a ser exportado).

## Ferramentas

| Ferramenta | Entrada | O que faz |
|---|---|---|
| `enviar_mensagens` | 1 a 3 textos | Envia em sequência pela API de conversas do GHL. Encerra a rodada. |
| `atualizar_orcamento` | quantidade de pares, CEP (opcional) | Calcula o preço unitário no código pela tabela de faixas, o frete pelo motor existente quando há CEP e menos de 36 pares (0 a partir de 36), grava a cadeia do orçamento no GHL e devolve os valores. O LLM nunca faz conta de preço. |
| `solicitar_ajuste_arte` | resumo do pedido de ajuste | Move a demanda do contato no pipeline "Fábrica de Mockups" para "Alteração". O agente de briefing que já existe (`lib/ghl/mockup-instructions`) escreve para os designers. A IA avisa o cliente do prazo. O workflow de "mockup pronto" envia a nova arte como hoje; a resposta do cliente a ela aciona a IA normalmente. |
| `escalar_para_humano` | motivo, resumo | Remove `ia-atendimento`, adiciona `ia-escalado`, atribui o contato ao usuário `AI_SELLER_ESCALATION_USER_ID` (padrão: Schay), cria nota interna com motivo e resumo, e envia ao cliente uma mensagem curta de passagem. |
| `nao_responder` | motivo | Registra que nenhuma resposta cabe (despedida já encerrada, mensagem que não era para a Hud Lab, spam). |
| `mover_etapa` | etapa ("Atendimento", "Negociação" ou "Prioridade de Fechamento") | Move a oportunidade para frente dentro do pipeline Atendimento: Atendimento na primeira resposta, Negociação quando o cliente discute condições, Prioridade de Fechamento quando diz que quer fechar. Nunca volta etapa e nunca tira a oportunidade da Fábrica de Mockups. |

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
| `decision` | text | `respondeu`, `nao_respondeu`, `escalou`, `humano_assumiu`, `pulou:sem_tag`, `pulou:ja_respondido`, `pulou:limite`, `pulou:em_andamento`, `pulou:mensagem_nova`, `erro`; `rodando` enquanto a rodada está em andamento (trava) |
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

- **Entrada com uma mensagem só.** A pessoa convidada manda no WhatsApp da Hud Lab uma mensagem com a palavra-chave e a palavra "chinelos", por exemplo "LIA TESTE, tenho interesse em chinelos". Dois workflows reagem à mesma mensagem:
  - um workflow novo, com gatilho "mensagem contém `LIA TESTE`", aplica a tag `ia-teste` na hora;
  - o "Atendimento Inicial" (o robô de atendimento, hoje com gatilho "mensagem contém chinelo/chinelos") começa normalmente: mockup básico, orçamento rápido, Amostra Digital Oficial.

  Não há corrida entre os dois: a tag só é lida no split, no fim do robô, minutos e várias respostas depois; ela é aplicada em segundos. "LIA TESTE" sozinho não inicia o robô.
- **Braço forçado.** No split, `ia-teste` vai sempre para a IA. Enquanto os testes rodam, o split real fica em **0%**: nenhum cliente de verdade é atendido pela IA até a decisão de abrir.
- **Design de verdade, marcado como teste.** A demanda de design é a própria oportunidade do lead, que passa pelo pipeline Fábrica de Mockups enquanto a arte é feita e depois volta. Ela recebe o prefixo `(TESTE IA)` no nome, no mesmo padrão do `(AMOSTRA)` que o time já usa, aplicado por um workflow do GHL quando a oportunidade é criada para um contato com `ia-teste`. O prefixo aparece no card da Fábrica, no briefing (que cita o nome do negócio) e nos painéis do app. Cada testador custa tempo de designer e espera de até 24h úteis, então o número de testadores simultâneos é pequeno e combinado com o design.
- **Fechamento com a Schay.** Como no fluxo real desta fatia, "pronto para pagar" escala para a Schay. Com `ia-teste`, ela encerra a oportunidade como **perdida**, motivo "teste", sem gerar cobrança. Nunca como ganha: dashboard, programação e rankings de venda só contam negócio ganho, então essa regra os mantém limpos sem filtro no código.
- **Fora das métricas de negócio, dentro das de qualidade.** Os contatos `ia-teste` entram na lista de exclusão que já tira os contatos migrados do BI (`v_contatos_importados_source`): uma migração cobre funil, KPIs, Meta × GHL e atribuição. **Não** são filtrados no `sync-ghl`, porque o Copiloto e o Auditor leem `ghl_opportunities` e é por eles que se mede a qualidade da IA.

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
- se a ação "Criar/Atualizar oportunidade" do workflow do GHL permite reescrever o nome para aplicar o prefixo `(TESTE IA)`; se não permitir, o app aplica o prefixo pela API (`PUT /opportunities/{id}`) na primeira vez que vê a oportunidade de um contato `ia-teste`;
- se `ghl_contact_tags` recebe a tag `ia-teste` a tempo de a exclusão do BI pegar o contato no mesmo dia (depende da frequência do sync de contatos).
