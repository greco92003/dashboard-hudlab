# Implementação da página `/user-progress`

## Objetivo

Criar a página `/user-progress` como a página principal do usuário dentro do dashboard.

Ela deve funcionar como um painel geral de desempenho individual, trazendo:

- progresso das NCTs vinculadas ao usuário
- tarefas que ele precisa concluir
- progresso de compromissos
- progresso de narrativas
- informações extras conforme o setor do usuário
- elementos de gamificação já existentes na página de NCTs

A página deve ser personalizada de acordo com:

- usuário logado
- setor vinculado ao usuário
- cargo/função do usuário
- permissões do perfil
- vínculos diretos do usuário com tarefas, compromissos e narrativas

Exemplo:
Se Schaiany for vendedora do setor comercial, a página deve puxar tudo que estiver relacionado ao seu usuário, nome, setor e função.

---

## Regra principal da página

A página `/user-progress` deve ser um **mapa geral do desempenho do usuário**.

Ela precisa consolidar em um só lugar:

1. o que o usuário precisa fazer
2. o que ele já avançou
3. o que está pendente
4. o que está atrasado
5. seu desempenho individual
6. seus dados de ranking e gamificação, quando aplicável

---

## Escopo inicial

### Todos os usuários devem visualizar

- tarefas vinculadas ao seu usuário
- progresso dos compromissos vinculados
- progresso das narrativas vinculadas
- XP total
- nível atual
- barra de progresso para próximo nível
- indicadores gerais de performance
- histórico/resumo de atividade recente
- elementos de gamificação já existentes na página de NCTs

### Líderes de setor devem visualizar também

Além dos dados pessoais, líderes de setor devem receber:

- tarefas da equipe expirando
- tarefas da equipe atrasadas
- progresso agregado dos compromissos do setor
- progresso agregado das narrativas do setor
- visão resumida da saúde operacional do setor

### Informações extras por setor

#### Se o usuário for do setor comercial / vendedor

Exibir também:

- ranking de vendas
- ranking de treinamentos

#### Se o usuário for designer

Exibir também:

- quantidade de mockups feitos
- quantidade de alterações feitas
- quantidade de arquivos de serigrafia feitos

---

## Observação importante

Por enquanto, apenas estes dois grupos terão blocos extras além das NCTs:

- Comercial / Vendedor
- Designer

Todos os demais usuários devem visualizar apenas:

- progresso de NCTs
- tarefas
- compromissos
- narrativas
- gamificação geral

---

# Estrutura funcional da página

## 1. Header principal

### Deve conter

- saudação contextual
- nome do usuário
- setor do usuário
- cargo/função
- resumo rápido do nível atual

### Exemplo de conteúdo

- Olá, Schaiany
- Setor: Comercial
- Função: Vendedora
- Nível 12 • 2.340 XP

---

## 2. Card principal de progresso

Criar um card de destaque no topo com visão resumida do avanço do usuário.

### Deve exibir

- XP total
- nível atual
- barra de progresso para próximo nível
- percentual geral de conclusão
- total de tarefas concluídas no período
- total de compromissos concluídos no período
- total de narrativas concluídas no período

### Objetivo visual

Esse card deve ser o grande resumo da página, com visual forte e gameficado.

---

## 3. Bloco “Minhas tarefas”

Exibir as tarefas vinculadas diretamente ao usuário logado.

### Separar em grupos

- Em andamento
- Próximas do vencimento
- Atrasadas
- Concluídas recentemente

### Cada item de tarefa deve mostrar

- título
- compromisso vinculado
- narrativa vinculada
- prioridade
- data de entrega
- status
- responsável
- indicador visual de atraso ou urgência

### Regras

- tarefas atrasadas devem ter destaque visual
- tarefas próximas do vencimento também devem ter destaque
- permitir clique para abrir detalhes
- mostrar quantidade total em cada grupo

---

## 4. Bloco “Meus compromissos”

Listar os compromissos vinculados ao usuário.

### Cada compromisso deve exibir

- nome
- narrativa vinculada
- barra de progresso
- percentual concluído
- total de tarefas concluídas / total de tarefas
- status geral

### Regra de cálculo

O progresso do compromisso deve ser calculado com base nas tarefas vinculadas a ele.

---

## 5. Bloco “Minhas narrativas”

Listar as narrativas vinculadas ao usuário ou ao seu setor.

### Cada narrativa deve exibir

- nome da narrativa
- setor
- líder do setor
- barra de progresso
- percentual concluído
- quantidade de compromissos concluídos / total
- status geral

### Regra de cálculo

O progresso da narrativa deve ser calculado com base na conclusão dos compromissos vinculados.

---

## 6. Bloco de gamificação

A página `/user-progress` deve reutilizar a lógica de gamificação já existente na página de NCTs.

### Incluir

- XP total
- nível
- progresso para próximo nível
- ranking pessoal quando aplicável
- badges/conquistas se já existirem
- medalhas/indicadores visuais se já existirem
- feedback visual de evolução

### Regra

Não duplicar lógica se ela já existir.
Reaproveitar componentes, hooks, funções e regras já implementadas na página de NCTs.

---

## 7. Bloco “Atividade recente”

Criar uma área com o histórico resumido das últimas ações do usuário.

### Exemplos

- tarefa concluída
- compromisso avançado
- narrativa atualizada
- ganho de XP
- mudança de posição no ranking
- novo mockup registrado
- nova alteração registrada
- novo arquivo de serigrafia registrado

### Objetivo

Dar sensação de progresso contínuo e tornar a página mais viva.

---

# Blocos condicionais por perfil

## A. Visão extra para líderes de setor

Se o usuário for líder de setor ou admin, exibir um bloco adicional chamado algo como:

- Visão do Setor
- Saúde do Setor
- Acompanhamento da Equipe

### Esse bloco deve conter

#### Tarefas do setor
- quantidade expirando em breve
- quantidade atrasada
- quantidade concluída no período
- total em aberto

#### Compromissos do setor
- progresso médio dos compromissos
- compromissos em risco
- compromissos concluídos

#### Narrativas do setor
- progresso médio das narrativas
- narrativas em risco
- narrativas concluídas

### Regras visuais
- itens críticos com destaque
- cards resumidos e leitura rápida
- orientação executiva/gerencial

---

## B. Visão extra para comercial / vendedor

Se o usuário pertencer ao setor comercial ou tiver função de vendedor, exibir um bloco específico.

### Deve conter

#### Ranking de vendas
- posição atual no ranking
- total vendido
- comparativo com outros vendedores
- possível evolução no ranking

#### Ranking de treinamento
- posição atual no ranking de treinamentos
- nota média
- aproveitamento
- quantidade de treinamentos concluídos

### Objetivo
Dar ao vendedor uma leitura clara do desempenho operacional + comercial + desenvolvimento.

---

## C. Visão extra para designer

Se o usuário pertencer ao setor de design, exibir um bloco específico.

### Deve conter

- mockups feitos
- alterações feitas
- arquivos de serigrafia feitos

### Opcionalmente já estruturar para futura expansão
- produtividade no período
- comparativo com períodos anteriores
- score interno de performance, se já existir

### Objetivo
Dar ao designer leitura de produção individual vinculada à lógica gameficada.

---

# Estrutura visual recomendada

## Organização geral da página

### Seção 1
Header + Card principal de progresso

### Seção 2
Grid de indicadores rápidos

Sugestão de mini-cards:
- tarefas pendentes
- tarefas atrasadas
- compromissos ativos
- narrativas ativas
- XP atual
- nível atual

### Seção 3
Duas colunas principais no desktop

#### Coluna esquerda
- Minhas tarefas
- Atividade recente

#### Coluna direita
- Meus compromissos
- Minhas narrativas

### Seção 4
Blocos condicionais por perfil
- visão do setor
- ranking comercial
- ranking de treinamentos
- métricas de design

---

# Diretrizes de UI

Usar como referência visual os layouts anexados:

- cards arredondados
- visual limpo
- hierarquia clara
- blocos com destaque para progresso
- navegação simples
- aparência moderna de dashboard mobile-friendly

## Aplicar estes princípios

- layout elegante e leve
- cards com sombra suave
- destaque claro para progresso
- indicadores rápidos bem visíveis
- componentes com leitura fácil
- experiência responsiva
- boa visualização no mobile e desktop

## Elementos visuais importantes

- barras de progresso
- badges de status
- chips de prioridade
- ícones leves
- avatares quando fizer sentido
- botões de ação sutis
- indicadores de urgência para tarefas

---

# Regras de negócio

## 1. Personalização por usuário

A página deve ser montada com base no usuário autenticado.

Puxar:

- dados do perfil
- setor
- função/cargo
- permissões
- vínculos com tarefas
- vínculos com compromissos
- vínculos com narrativas

---

## 2. Regras de exibição por permissão

### Usuário comum
Vê apenas seus próprios dados e vínculos.

### Líder de setor
Vê seus dados + resumo do setor que lidera.

### Admin
Pode ver os mesmos blocos de líder e também ter acesso ampliado se a regra atual do sistema já permitir.

---

## 3. Regras de cálculo de progresso

### Tarefas
Base da execução individual.

### Compromissos
Progresso = percentual de tarefas concluídas dentro do compromisso.

### Narrativas
Progresso = percentual de compromissos concluídos dentro da narrativa.

---

## 4. Regras de urgência

### Tarefa atrasada
Data de entrega menor que a data atual e status diferente de concluída.

### Tarefa expirando
Data próxima do vencimento conforme regra já usada no sistema.
Se não existir regra, considerar janela inicial de 3 dias.

---

## 5. Regras de gamificação

Reutilizar toda a lógica já implementada na página de NCTs.

Isso inclui, se já existir:

- XP por conclusão
- progressão de nível
- ranking
- badges
- medalhas
- qualquer score visual

---

# Componentes sugeridos

## Componentes de página

- `UserProgressPage`
- `UserProgressHeader`
- `UserProgressSummaryCard`
- `QuickStatsGrid`
- `MyTasksCard`
- `MyCommitmentsCard`
- `MyNarrativesCard`
- `RecentActivityCard`

## Componentes condicionais

- `SectorLeaderOverviewCard`
- `SalesRankingCard`
- `TrainingRankingCard`
- `DesignerMetricsCard`

## Componentes menores reutilizáveis

- `ProgressBar`
- `StatusBadge`
- `PriorityChip`
- `MetricCard`
- `TaskListItem`
- `CommitmentListItem`
- `NarrativeListItem`
- `XPLevelCard`

---

# Dados esperados

Estruturar a implementação para consumir algo nessa linha:

## Usuário
- id
- nome
- avatar
- setor
- função
- cargo
- role
- permissões
- xp_total
- nivel_atual

## Tarefas
- id
- título
- status
- prioridade
- data_entrega
- responsável
- compromisso_id
- narrativa_id
- setor_id

## Compromissos
- id
- nome
- narrativa_id
- progresso
- status
- total_tarefas
- tarefas_concluidas

## Narrativas
- id
- nome
- setor_id
- líder_setor
- progresso
- status
- total_compromissos
- compromissos_concluidos

## Comercial
- ranking_vendas
- posição_vendas
- total_vendido
- ranking_treinamento
- posição_treinamento
- nota_média_treinamento
- aproveitamento_treinamento

## Design
- mockups_feitos
- alteracoes_feitas
- arquivos_serigrafia_feitos

## Setor / liderança
- tarefas_expirando_setor
- tarefas_atrasadas_setor
- progresso_compromissos_setor
- progresso_narrativas_setor

---

# Comportamento responsivo

## Desktop
- layout em grid com blocos lado a lado
- visão resumida primeiro
- listas e cards abaixo

## Mobile
- cards empilhados
- prioridade para:
  1. resumo
  2. tarefas urgentes
  3. progresso
  4. blocos específicos do perfil

---

# Requisitos técnicos

## Implementação

- criar a rota `/user-progress`
- integrar com autenticação atual
- buscar dados do usuário logado
- montar a tela dinamicamente conforme setor, função e permissões
- reutilizar a lógica e os componentes de gamificação já existentes na página de NCTs sempre que possível
- evitar duplicação de regras de negócio

## Organização

- separar componentes por responsabilidade
- manter código escalável para inclusão futura de novos setores
- criar estrutura condicional clara para módulos extras por perfil
- manter performance boa mesmo com vários cards

---

# Critérios de aceite

A implementação estará correta quando:

- a página `/user-progress` existir e estiver funcional
- o usuário ver apenas dados vinculados a ele, salvo permissões especiais
- líderes visualizarem também visão resumida do setor
- vendedores visualizarem ranking de vendas e ranking de treinamento
- designers visualizarem métricas de produção
- progresso de tarefas, compromissos e narrativas estiver correto
- gamificação da página de NCTs estiver refletida nessa página
- layout estiver moderno, limpo e responsivo
- a experiência seguir a referência visual anexada

---

# Prioridade de implementação

## Fase 1
- rota `/user-progress`
- header
- card principal de progresso
- cards rápidos
- minhas tarefas
- meus compromissos
- minhas narrativas
- gamificação reaproveitada

## Fase 2
- visão de líder de setor
- bloco comercial
- bloco design
- atividade recente

## Fase 3
- refinamentos visuais
- animações sutis
- otimizações
- estados vazios
- loading states
- tratamento de erro

---

# Estados que precisam existir

- loading
- sem tarefas
- sem compromissos
- sem narrativas
- sem dados extras para o perfil
- erro ao carregar dados

---

# Instrução final para execução

Implemente a página `/user-progress` com base nessa especificação.

### Regras finais
- manter consistência com o design system atual
- reaproveitar lógica já criada na página de NCTs
- deixar a estrutura pronta para crescimento futuro
- focar em clareza, leitura rápida e sensação de progresso
- seguir o estilo visual das referências anexadas