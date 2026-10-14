# LIA Intelligence e Arena só de treinamento — design

Data: 2026-10-14. Base: piloto da Lia (spec `2026-09-29-ia-vendedora-nucleo-conversa-design.md`) e fila de não lidas (PRs #24–#26).

## Decisões do usuário

- A Arena de Vendedores vira só treinamento, com o ranking do treinamento na mesma página. As notas recomeçam do zero.
- A fila de não lidas (quente/morno/frio/pós) sai da Arena e vai para uma página nova, **LIA Intelligence**.
- Só o usuário (papel `owner` no dashboard) corrige a Lia.
- Fora por enquanto: testes automáticos de abordagens de follow-up.
- A Lia tem que responder no ritmo de uma conversa de verdade. Os ~4 min do piloto não servem.
- Princípio: simples e leve. Cada coisa na tela leva a uma ação do usuário, ou sai.

## Fase 1 — antes da Lia atender clientes de verdade

### 1. A Lia responde em ~30–50s

Hoje o workflow "IA Vendedora | Responder" do GHL espera 90s antes de chamar a Lia, para juntar a rajada de mensagens do cliente. O GHL não cumpre o tempo: no piloto chegou a ~4 min.

Novo desenho: a espera passa para o nosso lado.

- O GHL chama o webhook **na hora**, sem etapa de espera. Sem a espera, o contato sai do workflow logo, e cada mensagem gera a sua chamada.
- O webhook responde 202 e, em segundo plano, aguarda **25s**.
- Depois da espera, a chamada relê a conversa. Se o cliente escreveu depois que ela chegou, ela desiste (`pulou:aguardando_cliente`), porque a chamada da mensagem mais nova responde. Se não, segue como hoje: trava por contato, decisão, agente.
- `maxDuration` da rota `/api/ai-seller/respond` sobe de 120 para 180s (25s de espera + 85s de prazo do agente + passagem para humano).
- Ordem de entrada no ar: primeiro o código; depois tirar a espera do workflow no GHL. Durante a troca as duas esperas se somam, o que é só mais lento, não errado.

Não vale espera zero: responder em 5s parece robô e atropela o cliente no meio do que ele está escrevendo.

### 2. A Lia lê menos (mais rápida e mais barata)

Hoje ela recebe a conversa inteira, inclusive as mensagens do robô com fotos de exemplo: de 56 a 83 mil tokens de entrada por resposta.

- O que vai para a Lia: as mensagens do cliente anteriores à Amostra Digital, só o texto, mais a conversa inteira a partir da entrega da Amostra Digital, inclusive a imagem da amostra. O mesmo corte da fila de não lidas (`cutTranscript`) vale aqui.
- Sai: mensagens e imagens do robô antes da amostra. Preço, pares e valor já chegam pelo contexto do CRM.
- Sem entrega de amostra na conversa, nada é cortado (caso raro: a Lia entra depois da amostra).
- Meta: menos de 20 mil tokens por resposta. A conferência é feita com dryRun nas conversas dos testadores.

### 3. Arena = Treinamento

- A página `/sellers_v2` fica com o chat de treinamento e o **ranking do treinamento**. As abas "Rankings" (vendas e recorde) e "Atendimentos Reais" saem; o ranking de vendas continua no Dashboard OTE.
- **Zerar:** o ranking só conta sessões a partir de 14/10/2026. As sessões antigas continuam no banco, sem apagar nada.
- O bloco "Fechadas" (notas do Auditor em negociações reais) sai, e o cron `evaluate-negotiations` (a cada 30 min, gasta IA) é desligado. As rotas e tabelas antigas ficam paradas e podem ser removidas depois.

### 4. Página LIA Intelligence

Item novo no menu, em Follow-Up: **LIA Intelligence** (`/lia`). Na Fase 1 tem:

- **Fila de não lidas:** o componente atual, como está, visível para todo o time. Na Fase 2 cada card ganha a marca "Lia" ou "humano".
- **Regras da casa:** só para o owner (ver 5).
- **Pausar Lia:** só para o owner (ver 6).

### 5. Regras da casa

Uma lista curta de instruções que o usuário escreve no dashboard e que entram nas instruções da Lia, acima do manual. Exemplo: "Só passe para a Schay depois que o cliente escolher a forma de pagamento."

- Tabela `ai_seller_rules`: `id`, `texto`, `ativa`, `created_at`, `updated_at`, `atualizada_por`.
- RLS: leitura para aprovados; escrita só para `owner`. A rota confere o papel também.
- Teto de **15 regras ativas**. Regra que se provou vai para o manual (código) e sai da lista.
- **Testar antes de ligar:** escolher uma conversa (um testador ou qualquer contato) e rodar a Lia em dryRun com a regra nova. Nada é enviado nem gravado. A tela mostra a resposta, e o usuário liga a regra se ela ficou certa.
- A Lia lê as regras ativas a cada rodada (uma consulta pequena), sem cache.

### 6. Pausar Lia

- Tabela `ai_seller_settings` (uma linha): `pausada`, `pausada_em`, `pausada_por`. Escrita só pelo owner.
- Com a Lia pausada, uma mensagem nova de um contato da Lia não fica sem dono: a rodada passa para humano **sem mandar nada ao cliente**. Ela tira a tag `ia-atendimento`, atribui à Schay e cria uma nota "Lia pausada". Decisão: `pulou:pausada`.
- Despausar vale para as próximas mensagens; quem já foi passado continua com humano.

## Fase 2 — junto com a Lia atendendo clientes de verdade

Planejada agora, construída depois do primeiro lote real (sem conversa real, a tela nasce vazia).

**Dados novos em `ai_seller_runs`:** `client_message_at` (última mensagem do cliente que a rodada respondeu) e `replied_at` (envio da primeira mensagem). Tempo de resposta = `replied_at − client_message_at`.

**Pulso** (semana, sempre com o número de conversas ao lado):
- conversas que a Lia atendeu;
- % que chegou à passagem para a Schay por pagamento (`pronto_para_pagar`), o número principal;
- % em que o cliente sumiu (sem resposta 24h depois da última fala da Lia);
- tempo de resposta: mediana e pior caso;
- custo em R$ no mês.

**Para revisar** (lista curta, cada item com o motivo):
- o cliente sumiu depois de uma resposta da Lia;
- o cliente pediu pessoa ou reclamou;
- passagem para humano sem resposta do time há mais de 1h (o buraco mais perigoso);
- resposta que levou mais de 2 min;
- números prometidos (preço e frete das chamadas a `atualizar_orcamento`), para conferir.

**Corrigir uma fala:** a partir de um item da lista, "a Lia deveria ter dito…" vira uma regra candidata, que passa pelo mesmo "testar antes de ligar".

**Antes da Lia:** no início da Fase 2, calcular pelo histórico do GHL o tempo de resposta e a conversão dos vendedores humanos, para comparar.

## Fora (decidido)

- Testes automáticos de follow-up dentro da janela.
- Gráficos, funil por etapa e histórico de tokens.

## Já resolvido

- **Transparência:** a Lia já se apresenta como assistente de IA e confirma se perguntarem (instrução em `prompt.ts`).
- **Resumo na passagem:** a passagem já cria uma nota no contato com motivo e resumo. Na Fase 2, conferir se o resumo é bom o bastante para a Schay não reler a conversa.

## Pendências da Lia que continuam abertas

- Critério de passar para a Schay = forma de pagamento escolhida. Vira a primeira regra da casa, testada antes de ligar.
- Frete por estado (robô) × por CEP (Lia).
- A Lia mover o card para Negociação coloca o contato na régua follow_negociacao do Rodrigo.
- Fechar cards antigos do testador no "LIA TESTE".

## Pergunta em aberto

- Resumo diário (mensagem para o usuário com os números do dia e o link da tela): na Fase 2 ou nunca?
