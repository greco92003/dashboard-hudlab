# CAMI Intelligence e Arena gamificada — design

Data: 2026-10-14. Base: núcleo da IA vendedora (spec `2026-09-29-ia-vendedora-nucleo-conversa-design.md`) e fila de não lidas (PRs #24–#26).

**Já no ar:**
- **PR #39:** resposta em ~30s, com a espera feita no servidor; conversa cortada na Amostra Digital (de 33–83 mil para 7–11 mil tokens).
- **PR #40:** a IA passou a se chamar **Cami** e assume pedidos de 12 pares (workflow "IA Vendedora | Entrada"). Vendedor = CAMI; passagem para a Schay com horário.

## Decisões do usuário

**Sobre a Cami e a página**
- Página nova **CAMI Intelligence**, construída por completo agora. Sem dados, cada número mostra "—" e o n = 0.
- Só o usuário corrige a Cami e mexe nos controles. O papel `owner` é a conta Hud Lab, que é a do usuário.
- A fila de não lidas sai da Arena e vai para a CAMI. Todo o time vê.
- Lançamento por faixa de pares: começou em 12 e cresce conforme os resultados. Sem sorteio Cami × time por enquanto (venda de 12 pares é rara demais para comparar conversão).

**Sobre a Arena**
- A Arena de Vendedores continua **ligada**, focada em treinamento e **gamificada**: "linda e atrativa", para convencer a equipe a usar e para treinar vendedores novos.
- Ranking só de treinamento. As notas antigas não contam: a Temporada 1 começa no lançamento.
- **Quem treina:** qualquer pessoa do time. A conta Hud Lab e as de teste ficam bloqueadas, para que todo treino pertença a uma pessoa.
- **Níveis com nomes genéricos.**
- **Lembrete diário de treino por push:** sim. O usuário cobra o time para ativar as notificações no celular.
- **"Como a Cami responderia" no feedback do treino:** entra agora.
- **Protótipo visual da Arena** antes de construir.

**Fora**
- Testes automáticos de follow-up pela IA.

## Contexto em números (14/10)

| Dado | Valor | Implicação |
|---|---|---|
| Treinos do time desde a semana de lançamento (27–30/07) | 0 (só a conta Hud Lab, testando) | A Arena precisa de motivo para voltar a ser usada: progresso, rotina, competição e conteúdo útil |
| Vendas de setembro | Schay fez 60 de 67 | A passagem para humano depende de uma pessoa: o destino tem que ser configurável |
| Amostras de 12 pares | 39% das amostras e ~3% da receita | Faixa inicial da Cami |
| Novembro de 2025 | 125 vendas, R$ 288 mil (~2× outubro) | Comparar antes × depois é aproximado |
| Notificações push ativas | Só o usuário | Alertas para a Schay dependem de ela ativar; a passagem já atribui o contato a ela no GHL, que avisa pelo app dele |

---

# Parte 1 — CAMI Intelligence (`/cami`)

Menu Follow-Up → "CAMI Intelligence", ícone de robô. Visível para todos os aprovados que não são `partners-media` (o middleware já os redireciona). Ações que mudam o comportamento da Cami: só `owner`, conferido na rota e no RLS.

**Cabeçalho:**
- situação ("🟢 Ligada · 12 pares · passa para a Schay");
- período: hoje / 7 dias / 30 dias / desde o lançamento;
- botão Atualizar;
- horário da última atualização.

## Aba Visão geral

Cada cartão mostra o valor, o n e a referência "antes da Cami" em cinza. Sem dado, mostra "—".

| Cartão | Definição |
|---|---|
| Clientes assumidos | Entradas com decisão "assumiu" no período. Embaixo, os que ficaram de fora, por motivo |
| Responderam à Cami | % dos assumidos com ao menos uma mensagem do cliente depois da entrada |
| Tempo de resposta | Mediana e pior caso de `replied_at − client_message_at` nas rodadas que enviaram mensagem |
| Passagens | Total e por motivo (pronto para pagar, desconto, reclamação, pediu pessoa, pedido grande, falha técnica, limite) |
| Chegaram ao pagamento | % dos assumidos com passagem `pronto_para_pagar` |
| Sumiram | % dos assumidos cuja última fala é da Cami há mais de 24h, sem passagem nem venda |
| Vendas | Oportunidades com Vendedor = CAMI ganhas no período: quantidade e R$ |
| Custo | Tokens × preço do modelo × dólar (estimativa): total do período e por venda |

**Funil da Cami:** Assumidos → Responderam → Negociação → Prioridade de Fechamento → Passou para o pagamento → Ganhou. Mostra a % de cada passo e o n.

**Referência "antes da Cami":** oportunidades de 12 pares que receberam amostra entre 14/09 e 13/10, atendidas pelo time. Calculada uma vez por script e gravada em `ai_seller_baseline`:
- % que avançou para Negociação;
- % ganha em 30 dias;
- tempo até a primeira resposta humana depois da amostra (amostra de até 60 conversas lidas no GHL).

Aviso fixo: "época diferente; comparação aproximada".

## Aba Conversas

Uma linha por oportunidade assumida pela Cami, lida de `ai_seller_conversations`.

- **Colunas:** cliente, pares, etapa, situação, última fala (de quem, há quanto tempo), valor, sinais.
- **Situações:**
  - Cami atendendo;
  - esperando o cliente há Xh;
  - passou para a Schay (motivo) · respondeu em X min / ainda não;
  - ganhou R$;
  - perdeu;
  - humano assumiu.
- **Filtros:** Para revisar (padrão) · Atendendo · Passadas · Encerradas · Todas.

**Sinais ("Para revisar"):**
- `sumiu`: o cliente não respondeu à Cami em 24h;
- `pediu_pessoa_ou_reclamou`: passagem com motivo `cliente_pediu_pessoa` ou `reclamacao`;
- `passagem_sem_resposta`: mais de 1h útil sem mensagem humana depois da passagem;
- `resposta_lenta`: alguma resposta passou de 2 min;
- `falha`: rodada com erro ou `falha_tecnica`, ou limite atingido.

**Ao abrir uma conversa:**
- linha do tempo das rodadas (decisão, tempo, tokens, ferramentas);
- promessas: preço e frete devolvidos por `atualizar_orcamento`;
- resumo da passagem;
- link para a conversa no GHL.

**Ações do owner:**
- **Revisado:** grava `reviewed_at` e tira a conversa da lista até surgir um sinal novo.
- **Corrigir a Cami:** abre uma regra nova com o caso anexado.
- **Usar como referência:** guarda uma foto da conversa em `ai_seller_references`.

## Aba Regras da casa

- Lista com texto, liga/desliga, origem (manual / correção / sugestão), quem e quando. Teto de **15 ativas**.
- Entram nas instruções da Cami na seção "Regras da casa (valem acima do manual)", lidas a cada rodada.
- **Conversas de referência:** 6–8 cenários (nome, a foto da conversa, o contexto do CRM e a nota "o que seria uma boa resposta"). Os primeiros saem das conversas reais e dos testadores:
  - preço;
  - frete;
  - ajuste de arte;
  - desconto;
  - pronto para pagar;
  - reclamação;
  - cliente que sumiu e voltou.
- **Testar:** roda a Cami em modo de teste em todas as referências, com as regras atuais e com a regra candidata, e mostra as respostas lado a lado.
  - Precisa de uma variação do modo de teste que recebe a conversa e o contexto prontos em vez de ler o GHL. A mesma peça serve para o "como a Cami responderia" da Arena.
  - Custo: ~10 mil tokens por referência e por variante.

## Aba Não lidas

O componente atual (`UnreadInbox`), com o selo "Cami atendendo". Sai da Arena.

## Aba Controle (owner edita; time vê o estado)

| Controle | Efeito |
|---|---|
| Estado: Ligada / Não pega novos / Desligada | "Não pega novos": a entrada recusa (`motivo = cami_pausada`). "Desligada": além disso, cada rodada passa o cliente para humano sem mandar mensagem (tira a tag, atribui, cria nota "Cami desligada") |
| Faixa de pares (mín./máx.) | Substitui `ASSIGN_MIN_PARES`/`ASSIGN_MAX_PARES` |
| Quem recebe as passagens | Usuário do GHL + nome + turnos. Substitui as variáveis `AI_SELLER_ESCALATION_*` e `ESCALATION_SHIFTS` |
| Alertas | Passagem sem resposta (1h útil → quem recebe; 2h → owner); resumo diário às 18h30 → owner |

Os valores atuais do código ficam como padrão se o banco falhar.

## Dados novos

| Tabela / coluna | Conteúdo |
|---|---|
| `ai_seller_settings` (uma linha) | `estado`, `min_pares`, `max_pares`, `escalation_user_id`, `escalation_name`, `escalation_shifts` (jsonb), `alertas` (jsonb), `updated_by`, `updated_at` |
| `ai_seller_assignments` | Cada chamada da entrada: `contact_id`, `opportunity_id`, `pares`, `decisao` (assumiu / motivo de fora), `created_at`. Os dias desde 14/10 são recuperados pelo campo Vendedor = CAMI |
| `ai_seller_runs` + colunas | `client_message_at`, `replied_at`, `received_at` |
| `ai_seller_handoffs` | `contact_id`, `opportunity_id`, `motivo`, `resumo`, `escalated_at`, `to_user_id`, `answered_at`, `answered_by`, `alerted_at`, `owner_alerted_at` |
| `ai_seller_conversations` | Uma linha por oportunidade da Cami, atualizada pelo cron: etapa, status do GHL, valor, situação, `last_client_at`, `last_cami_at`, `replies`, `tokens`, `max_response_ms`, `signals` (text[]), `reviewed_at`, `updated_at` |
| `ai_seller_rules` | `texto`, `ativa`, `origem`, `contact_id` de origem, `created_*`, `updated_*` |
| `ai_seller_references` | `nome`, `cenario`, `messages` (jsonb), `context` (jsonb), `boa_resposta`, `created_at` |
| `ai_seller_baseline` | Valores da referência "antes da Cami" e o período |

RLS no padrão do projeto:
- leitura `authenticated` mais o `approved_user_gate`;
- escrita só pelo servidor (service role) ou pelo owner, conferido na rota;
- `revoke anon`.

## Rotinas

- **`/api/cron/refresh-cami`** (a cada 15 min, mais o botão Atualizar):
  - recalcula `ai_seller_conversations` dos últimos 30 dias;
  - confere no GHL as passagens das últimas 48h (houve mensagem humana depois?);
  - dispara os alertas.
- **`/api/cron/cami-resumo-diario`** (18h30, dias úteis): push para o owner, por exemplo "Cami hoje: 6 clientes, 2 para a Schay, 1 para revisar".

---

# Parte 2 — Arena de Vendedores, gamificada (`/sellers_v2`)

## Quem treina

- Qualquer usuário aprovado que entra na página (`partners-media` já é redirecionado pelo middleware).
- **Bloqueadas:** a conta com papel `owner` (Hud Lab) e as contas de teste (lista `TRAINING_BLOCKED_EMAILS`). Para elas, a página aparece em modo leitura, com o aviso "Treine com a sua conta pessoal".
- O ranking mostra o nome e o avatar de `user_profiles`.

## Progressão

- **XP por treino concluído:**
  - base = nota (0–100);
  - +25 com nota ≥ 90;
  - +20 na primeira vez numa missão;
  - +10 por dia de sequência, até +50.
  - Contam no máximo 3 treinos por dia.
- **Níveis** (XP acumulado desde a Temporada 1): Aprendiz (0) → Consultor (500) → Especialista (1.500) → Closer (3.500) → Lenda (7.000). Treinando todo dia útil, é ~1 semana até Consultor e ~4–5 meses até Lenda.
- **Sequência 🔥:** dias úteis seguidos com ao menos um treino concluído. Fim de semana não quebra.
- **Meta da semana:** treinar nos 5 dias úteis.

## Temporadas e ranking

- Temporada = mês do calendário (horário de Brasília). A Temporada 1 vai do lançamento até o fim do mês.
- Ranking da temporada por XP, com média de nota e dias treinados ao lado.
- Pódio com os 3 primeiros. O campeão ganha um selo permanente ("🏆 Campeão de Outubro").
- O XP e o nível não zeram; só o ranking recomeça a cada temporada.

## Missões

Catálogo em código (`lib/sellers-v2/missions.ts`). Cada missão tem: id, título, dificuldade (⭐ a ⭐⭐⭐), briefing para o cliente simulado (perfil, objetivo, objeções, quantidade, prazo), objetivo do vendedor e posição na trilha.

Primeiras missões, com peso em fechamento e exceções, que é o que fica com as pessoas:

| Missão | Dificuldade |
|---|---|
| Primeiro contato: entender o evento | ⭐ |
| Dúvidas de produto (material, grade, prazo) | ⭐ |
| 12 pares achando caro | ⭐⭐ |
| Evento com prazo apertado | ⭐⭐ |
| Pedido de desconto | ⭐⭐ |
| Cliente que sumiu e voltou | ⭐⭐ |
| Comparando com a concorrência | ⭐⭐⭐ |
| Pedido grande (500+ pares) | ⭐⭐⭐ |
| Reclamação de pedido anterior | ⭐⭐⭐ |
| Fechamento: forma de pagamento e grade | ⭐⭐⭐ |

O treino livre de hoje continua como missão "Cliente surpresa".

- **Trilha do novo vendedor:** as missões em ordem; a próxima libera com nota ≥ 70.
- **Desafio da semana:** uma missão escolhida em rodízio a cada segunda-feira, com ranking próprio pela melhor nota.

## Conquistas

Calculadas a partir das sessões. Ficam gravadas em `seller_achievements` com a data, para a comemoração aparecer uma vez só.

Lista:
- primeiro treino;
- nota 70+, 90+ e 100;
- sequência de 3, 5 e 10 dias;
- todas as missões ⭐;
- todas as missões ⭐⭐⭐;
- trilha concluída;
- vencedor do desafio da semana;
- pódio da temporada;
- campeão da temporada.

## Feedback do treino

- Placar por critério em estrelas: precisão, entendimento, valor, condução, clareza.
- O que deu certo, o que custou pontos e um exemplo de resposta melhor (a avaliação atual).
- **Como a Cami responderia:**
  - a avaliação aponta o turno mais fraco do vendedor (campo novo `turnoMaisFraco`);
  - a Cami responde, em modo de teste, à mesma mensagem do cliente, com a conversa até ali e um contexto sintético;
  - aparece lado a lado: "Você respondeu" × "A Cami responderia".
- **Comemorações:** XP ganho, subida de nível e conquista nova, com confete (animação com `motion`).

## Lembrete

Push às 15h dos dias úteis para quem tem notificações ativas e ainda não treinou no dia. Cron `/api/cron/arena-lembrete`, com a infraestrutura de push que já existe.

## Visão do gestor (owner)

- Quem treinou na semana.
- Evolução de cada pessoa (XP e média).
- Pontos fracos do time por critério.
- Missões mais difíceis (menor média).

## Visual

- Escuro, com o verde da marca.
- Cartões com profundidade, barra de XP animada, pódio, selos com brilho.
- Funciona bem no celular.
- **Protótipo antes da construção**, aprovado pelo usuário.

## Dados novos

| Tabela / coluna | Conteúdo |
|---|---|
| `seller_training_sessions` + colunas | `mission_id`, `xp`, `season` (ex.: `2026-10`) |
| `seller_achievements` | `user_id`, `achievement_id`, `unlocked_at`, `context` (jsonb) |

## Sai da Arena

- Abas de ranking de vendas (estão no OTE) e Atendimentos Reais (vai para a CAMI).
- Bloco "Fechadas" e cron `evaluate-negotiations`, que avalia conversas reais e gasta IA a cada 30 min.

---

# Ordem de construção

| # | Entrega | Pronto quando |
|---|---|---|
| 1 | Base de dados da Cami: tabelas, registro das entradas, tempos nas rodadas, passagens, configurações lidas do banco (com fallback para o código), recuperação dos dias desde 14/10 | Cada entrada e cada passagem aparece no banco; mudar a faixa no banco muda a entrada sem deploy |
| 2 | Página CAMI: Visão geral, Conversas, Não lidas, Controle; cron `refresh-cami` | Tudo aparece com "—" ou zero sem dados e com os clientes reais desde 14/10 |
| 3 | Regras da casa, referências e teste lado a lado | Uma regra testada nas referências e ligada muda a resposta da Cami |
| 4 | Alertas por push e resumo diário | Passagem de teste sem resposta gera push |
| — | Protótipo visual da Arena | Aprovado pelo usuário |
| 5 | Arena, base: bloqueio de contas, XP, níveis, sequência, temporada, ranking, pódio, visual novo | Um treino concluído dá XP e aparece no ranking da temporada |
| 6 | Arena, conteúdo: missões, trilha, desafio, conquistas, "como a Cami responderia", lembrete, visão do gestor | Treino de missão com feedback e comparação com a Cami |
| 7 | Depois: sugestões semanais de regras pela IA, a partir das conversas perdidas | — |

Cada entrega é um PR com testes das partes puras e verificação no navegador.

# Pendências

- **Contas de teste a bloquear na Arena:** confirmar quais existem além da conta Hud Lab.
- **Campo Vendedor:** conferir na primeira passagem real se alguma automação troca "CAMI" ao atribuir para a Schay.
- **Avisar o Rodrigo** sobre os workflows alterados: Responder sem espera, Entrada nova, Mockup Creator.
- **Frete:** o robô estima por estado e a Cami cota por CEP. Mitigado pela instrução de explicar a diferença.
