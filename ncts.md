Página /ncts

Vamos criar a página /ncts.

Narrativas = o objetivo macro
 Compromissos = os marcos/resultados que fazem a narrativa avançar
 Tarefas = as entregas operacionais que fazem os compromissos avançarem
A regra principal fica muito boa assim:
Tarefas concluídas aumentam o progresso do Compromisso
Compromissos concluídos aumentam o progresso da Narrativa
Cada Narrativa pertence a um setor
Cada setor tem um líder
Admins e líderes do setor podem criar e editar os itens do próprio escopo

Estrutura da página
Eu dividiria a experiência em 5 áreas principais:
1. Visão geral
Uma home da NCT com leitura rápida.
Blocos principais:
XP total do usuário
Nível atual
Ranking do setor
Ranking geral
Narrativas em que o usuário participa
Compromissos próximos do prazo
Tarefas atrasadas
Tarefas concluídas na semana
Progresso do setor
Aqui o usuário entra e já entende:
 “onde estou”, “quanto evoluí”, “o que está atrasado” e “onde minha atuação impacta”.

2. Módulo de Narrativas
Tela para listar todas as narrativas.
Cada card de narrativa pode ter:
Nome da narrativa
Logotipo (para fazer upload)
Setor
Líder do setor
Barra de progresso
Status
Quantidade de compromissos
Quantidade de participantes (use componente shadcn avatar group count)
Prazo
XP total distribuível
Ranking interno da narrativa
Ações do card:
Ver detalhes
Editar
Adicionar compromisso
Ver ranking
Ver timeline
Dentro da narrativa
A página de detalhe da narrativa pode ter 4 blocos:
Cabeçalho
Nome
Descrição
Setor
Líder
Status
Prazo
Barra de progresso geral
Aba 1: Compromissos
Lista de compromissos vinculados
Progresso individual de cada compromisso
Responsáveis principais
Data alvo
Aba 2: Equipe e ranking
Quem participa da narrativa
Ranking de contribuição
XP ganho nessa narrativa
Medalhas / badges
Aba 3: Timeline
Criação
Edições
Compromissos concluídos
Avanços relevantes
Aba 4: Métricas
% concluído
compromissos finalizados
tarefas concluídas vinculadas
prazo médio
gargalos

3. Módulo de Compromissos
O compromisso é o elo entre narrativa e tarefa.
Cada compromisso precisa ter:
Nome
Descrição
Narrativa vinculada
Barra de progresso
Status
Responsável principal
Data alvo
Peso dentro da narrativa
Tarefas vinculadas
XP distribuível
Recomendação importante
Cada compromisso deve ter um peso dentro da narrativa.
Exemplo:
Compromisso A = peso 40
Compromisso B = peso 35
Compromisso C = peso 25
Assim, quando um compromisso é concluído, ele alimenta a narrativa conforme sua relevância.

4. Módulo de Tarefas
Aqui entra o operacional.
Cada tarefa deve ter:
Título
Descrição
Compromisso vinculado
Narrativa herdada
Responsável
Prioridade
Data de entrega
Status
XP ao concluir
Tipo de tarefa
Checklist opcional
Evidência/anexo opcional
Status sugeridos
Não iniciada
Em andamento
Em revisão
Concluída
Atrasada
Bloqueada
Cartão de tarefa
título
responsável com avatar
prazo
prioridade
status
XP
tag do setor
botão concluir
botão comentar

Lógica de progresso
1. Tarefas nutrem compromissos
O progresso do compromisso pode vir da soma ponderada das tarefas.
Exemplo:
Tarefa 1 = peso 20
Tarefa 2 = peso 30
Tarefa 3 = peso 50
Se concluir Tarefa 1 e 2:
 progresso do compromisso = 50%
Isso é melhor do que contar simplesmente quantidade de tarefas, porque nem toda tarefa tem o mesmo valor.

2. Compromissos nutrem narrativas
Mesma lógica:
Cada compromisso tem peso
Ao concluir ou avançar, ele alimenta a barra da narrativa
Exemplo:
Compromisso A = 40%
Compromisso B = 30%
Compromisso C = 30%

Gamificação
Aqui está a parte que faz a página ficar realmente envolvente.
XP por ação
Sugestão de estrutura:
Criar tarefa: 2 XP
Atualizar status: 1 XP
Concluir tarefa: 10 XP
Concluir tarefa antes do prazo: +5 XP
Concluir tarefa crítica: +8 XP extra
Concluir compromisso: 30 XP para responsáveis centrais
Concluir narrativa: 100 XP distribuídos conforme participação
Comentário útil / atualização validada: 2 XP
Manter sequência semanal de entregas: bônus de streak
Penalizações leves
Eu evitaria punição pesada. Melhor usar perda de bônus, não perda de XP base.
Exemplo:
tarefa atrasada: perde bônus de prazo
tarefa reaberta: remove bônus de conclusão perfeita
tarefa bloqueada sem atualização por muitos dias: sem bônus de atividade

Sistema de níveis
Exemplo simples:
Nível 1: 0 XP
Nível 2: 100 XP
Nível 3: 250 XP
Nível 4: 450 XP
Nível 5: 700 XP
Ou progressão crescente:
 xp_necessario = 100 * nível^1.4
Isso deixa os níveis iniciais rápidos e os altos mais difíceis.

Ranking
Você falou em ranking por narrativa, o que é ótimo.
Sugiro 4 rankings:
Ranking geral
Mostra quem mais contribuiu na plataforma toda.
Ranking por setor
Mostra a disputa saudável entre membros do mesmo setor.
Ranking por narrativa
Mostra quem mais impactou aquela narrativa específica.
Ranking por período
semanal
mensal
trimestral
Isso evita que só usuários antigos dominem para sempre.

Badges e conquistas
Exemplos:
Executor: 10 tarefas concluídas
Pontual: 5 tarefas seguidas antes do prazo
Guardião da narrativa: participou da conclusão de uma narrativa
Motor do setor: maior XP do setor no mês
Líder em ação: líder com maior taxa de conclusão
Combo de entrega: 7 dias com atividades registradas

Permissões
Admin
Pode:
criar/editar/excluir qualquer narrativa
criar/editar/excluir qualquer compromisso
criar/editar/excluir qualquer tarefa
definir líderes
mover itens entre setores
ajustar pesos, XP e regras
ver todos os rankings e relatórios
Líder do setor
Pode:
criar e editar narrativas do próprio setor
criar e editar compromissos do próprio setor
criar e editar tarefas do próprio setor
atribuir responsáveis
acompanhar ranking e progresso do setor
validar conclusão quando houver revisão
Usuário comum
Pode:
visualizar narrativas em que participa
visualizar compromissos vinculados
atualizar tarefas atribuídas a ele
concluir tarefas
comentar
acompanhar seu XP, nível e ranking

Componentes principais da interface
Componentes de topo
Card de XP total
Card de nível atual
Barra de progresso para o próximo nível
Ranking mini-card
Card de streak
Componentes de gestão
Card de narrativa
Card de compromisso
Card de tarefa
Barra de progresso reutilizável
Timeline de atividade
Quadro Kanban de tarefas
Tabela de prazos
Modal de criação/edição
Drawer lateral de detalhes rápidos
Componentes de gamificação
Avatar com nível
Medalhas/badges
Ranking table
Histórico de XP
Feed de conquistas
Confete/microanimação ao concluir algo importante

Estrutura visual sugerida
Sidebar
Dashboard
Narrativas
Compromissos
Tarefas
Ranking
Setores
Relatórios
Configurações
Topbar
busca
filtros
período
notificações
perfil
XP e nível do usuário

Filtros essenciais
Em praticamente todas as telas:
setor
líder
narrativa
compromisso
responsável
status
prioridade
prazo
período
“somente minhas”

Regras de negócio importantes
1. Toda tarefa deve pertencer a um compromisso
Não deixar tarefa solta.
2. Todo compromisso deve pertencer a uma narrativa
Não deixar compromisso solto.
3. Toda narrativa deve ter setor e líder
Campos obrigatórios.
4. Conclusão automática ou validada
Você pode escolher entre dois modelos:
Modelo A: automático
Ao concluir todas as tarefas, o compromisso fecha automaticamente.
 Ao concluir todos os compromissos necessários, a narrativa fecha automaticamente.
Modelo B: validado
Mesmo com tudo concluído, o líder/admin precisa validar.
Eu recomendo:
tarefas: conclusão pelo responsável
compromissos: validação do líder
narrativas: validação do líder ou admin
Isso evita fechamento errado.

Indicadores que a página deve mostrar
Narrativas
total de narrativas
em andamento
concluídas
atrasadas
progresso médio por setor
Compromissos
total
concluídos
no prazo
atrasados
taxa de conclusão
Tarefas
abertas
concluídas
atrasadas
produtividade por responsável
média de tempo de conclusão
Gamificação
top 10 geral
top 10 por setor
top 10 por narrativa
XP por período
evolução de nível

Modelo de dados conceitual
Setor
id
nome
líder_id
Usuário
id
nome
avatar
setor_id
role
Narrativa
id
título
descrição
setor_id
líder_id
status
progresso
prazo_inicio
prazo_fim
xp_total
criado_por
Compromisso
id
narrativa_id
título
descrição
status
progresso
peso
prazo_fim
responsável_id
xp_total
Tarefa
id
compromisso_id
título
descrição
responsável_id
status
prioridade
peso
prazo_fim
xp_reward
concluída_em
XP Log
id
usuário_id
origem_tipo
origem_id
xp_ganho
motivo
data
Ranking Snapshot
id
contexto_tipo
contexto_id
usuário_id
xp_no_contexto
posição
período

Fluxo ideal de criação
Fluxo 1
Admin ou líder cria uma Narrativa
Fluxo 2
Dentro da narrativa, cria os Compromissos
Fluxo 3
Dentro de cada compromisso, cria as Tarefas
Fluxo 4
Atribui responsáveis e prazos
Fluxo 5
Usuários executam tarefas e acumulam XP
Fluxo 6
Compromissos avançam automaticamente conforme tarefas concluídas
Fluxo 7
Narrativa avança conforme compromissos concluídos

Sugestão de telas
Tela 1: Dashboard
Para acompanhamento rápido.
Tela 2: Narrativas
Lista e detalhe de narrativas.
Tela 3: Compromissos
Visão em cards ou tabela.
Tela 4: Tarefas
Kanban + tabela.
Tela 5: Ranking
Geral, setor e narrativa.
Tela 6: Setores
Gestão de líderes e desempenho.
Tela 7: Perfil do usuário
XP, nível, badges, histórico, narrativas em que atua.

O que deixaria a página realmente boa
Alguns detalhes que elevam muito a experiência:
barra de progresso sempre visível
cores por status
avatar dos responsáveis
tooltip explicando como o XP foi calculado
feed de atividade recente
animação leve ao ganhar XP
alertas de prazo
ranking com medalhas
filtros rápidos “atrasadas”, “minhas”, “essa semana”

Minha recomendação prática de estrutura
Se eu fosse definir a espinha dorsal, começaria assim:
Página principal
resumo geral
minhas tarefas
minhas narrativas
meu XP e nível
ranking rápido
Entidade principal
Narrativa → Compromissos → Tarefas
Regras
progresso por peso
XP por ação
ranking por narrativa, setor e geral
permissão por papel e setor
Validação
líder valida compromisso e narrativa
admin tem visão total

Exemplo de organização visual de uma narrativa
Narrativa: Melhorar eficiência comercial do setor X
 Setor: Comercial
 Líder: João
 Progresso: 62%
Compromissos
Padronizar abordagem comercial — 80%
Implantar rotina de follow-up — 55%
Treinar equipe — 40%
Tarefas ligadas
Criar script inicial
Revisar objeções
Definir rotina de CRM
Gravar treinamento
Aplicar checklist semanal
Ranking da narrativa
Maria — 240 XP
João — 210 XP
Pedro — 180 XP


Tudo isso impacta em uma alteração estrutural da nossa aplicação atual. Agora devemos sempre vincular um usuário ao seu setor. Então você deverá também colocar isto na implementação desta nova página. Na pagina /profile-settings devemos incluir um dropdown para escolher qual o setor: design, comercial, financeiro, marketing ou rh

Outra coisa importante: Cada setor tem uma cor e cada narrativa tem um logo. O logo deve virar uma insignia vinculada ao usuário que conclui as narrativas. Essa insignia pode ficar em uma página de conquistas que mostra todas que o usuário recebeu.