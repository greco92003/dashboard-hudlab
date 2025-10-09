# 🧪 Guia de Testes - Analista IA

## 📋 Checklist de Testes

### ✅ Testes Básicos

#### 1. Interface do Usuário
- [ ] Botão flutuante aparece no canto inferior direito
- [ ] Botão tem gradiente roxo/azul
- [ ] Ao passar o mouse, botão expande mostrando "Analista IA"
- [ ] Ao clicar, sidebar abre da direita para esquerda
- [ ] Animação de abertura é suave (300ms)
- [ ] Overlay escuro aparece atrás da sidebar
- [ ] Clicar no overlay fecha a sidebar
- [ ] Botão X no header fecha a sidebar

#### 2. Chat Interface
- [ ] Mensagem de boas-vindas aparece automaticamente
- [ ] Mensagem de boas-vindas está formatada corretamente
- [ ] Sugestões de perguntas aparecem abaixo da mensagem
- [ ] Input de texto está focado e pronto para digitar
- [ ] Botão de enviar está desabilitado quando input vazio
- [ ] Botão de enviar fica azul/roxo quando habilitado

#### 3. Funcionalidade de Chat
- [ ] Consegue digitar mensagem no input
- [ ] Enter envia a mensagem
- [ ] Shift+Enter adiciona nova linha (se implementado)
- [ ] Mensagem do usuário aparece à direita (azul/roxo)
- [ ] Loading spinner aparece enquanto IA processa
- [ ] Resposta da IA aparece à esquerda (cinza)
- [ ] Markdown é renderizado corretamente (negrito, listas, etc.)
- [ ] Timestamp aparece em cada mensagem
- [ ] Auto-scroll para última mensagem funciona

### ✅ Testes de Dados

#### 4. Contexto de Negócios
- [ ] IA tem acesso aos dados dos últimos 30 dias
- [ ] IA responde com números corretos de deals
- [ ] IA calcula taxa de conversão corretamente
- [ ] IA identifica top vendedores
- [ ] IA identifica top designers
- [ ] IA lista produtos corretamente
- [ ] IA menciona metas ativas (se houver)

#### 5. Qualidade das Respostas
- [ ] Respostas são relevantes às perguntas
- [ ] IA usa dados reais do dashboard
- [ ] IA formata números em português (R$, %)
- [ ] IA usa emojis apropriadamente
- [ ] IA destaca insights importantes em negrito
- [ ] IA sugere ações práticas quando apropriado

### ✅ Testes de Segurança

#### 6. Autenticação e Permissões
- [ ] Apenas usuários logados podem acessar
- [ ] Botão não aparece em páginas sem sidebar
- [ ] API retorna 401 se não autenticado
- [ ] IA só acessa dados que o usuário tem permissão
- [ ] RLS do Supabase é respeitado

### ✅ Testes de Performance

#### 7. Velocidade e Responsividade
- [ ] Sidebar abre em menos de 300ms
- [ ] Contexto carrega em menos de 2 segundos
- [ ] Primeira resposta da IA em menos de 5 segundos
- [ ] Respostas subsequentes em menos de 3 segundos
- [ ] Interface não trava durante processamento
- [ ] Scroll é suave

### ✅ Testes de Erro

#### 8. Tratamento de Erros
- [ ] Erro de API key inválida é tratado
- [ ] Erro de limite de requisições é tratado
- [ ] Erro de rede é tratado graciosamente
- [ ] Mensagens de erro são claras e úteis
- [ ] Usuário pode tentar novamente após erro

## 🎯 Cenários de Teste

### Cenário 1: Primeiro Uso
1. Fazer login no dashboard
2. Ir para /dashboard
3. Clicar no botão flutuante
4. Ler mensagem de boas-vindas
5. Clicar em uma sugestão de pergunta
6. Verificar resposta da IA

**Resultado Esperado:** Experiência fluida e intuitiva

### Cenário 2: Análise de Performance
1. Abrir chat
2. Perguntar: "Como está a performance de vendas este mês?"
3. Verificar se IA retorna:
   - Total de negócios
   - Taxa de conversão
   - Receita total
   - Ticket médio
   - Comparação com período anterior (se disponível)

**Resultado Esperado:** Resposta completa com dados reais

### Cenário 3: Comparação de Vendedores
1. Abrir chat
2. Perguntar: "Qual vendedor teve melhor desempenho?"
3. Verificar se IA retorna:
   - Nome do vendedor
   - Número de negócios
   - Receita gerada
   - Comparação com outros vendedores

**Resultado Esperado:** Ranking claro e preciso

### Cenário 4: Análise de Produtos
1. Abrir chat
2. Perguntar: "Quais são os produtos mais vendidos?"
3. Verificar se IA retorna:
   - Lista de produtos
   - Marcas
   - Preços
   - Insights sobre tendências

**Resultado Esperado:** Lista organizada e insights úteis

### Cenário 5: Conversa Longa
1. Abrir chat
2. Fazer 10 perguntas seguidas
3. Verificar se:
   - Contexto é mantido
   - Respostas são coerentes
   - Performance não degrada
   - Scroll funciona corretamente

**Resultado Esperado:** Conversa fluida e contextual

### Cenário 6: Múltiplas Sessões
1. Abrir chat e fazer perguntas
2. Fechar sidebar
3. Reabrir sidebar
4. Verificar se:
   - Histórico é mantido (ou resetado, conforme design)
   - Contexto é recarregado
   - Performance é consistente

**Resultado Esperado:** Comportamento consistente

## 🐛 Bugs Conhecidos para Verificar

### Possíveis Problemas
- [ ] Sidebar não fecha ao clicar no overlay
- [ ] Mensagens não aparecem em ordem
- [ ] Scroll não vai para última mensagem
- [ ] Loading infinito
- [ ] Erro de CORS
- [ ] Erro de hidratação no React
- [ ] Botão flutuante sobrepõe outros elementos
- [ ] Sidebar não é responsiva em mobile

## 📱 Testes Mobile

### Responsividade
- [ ] Botão flutuante visível em mobile
- [ ] Sidebar ocupa largura total em mobile
- [ ] Input de texto acessível no teclado mobile
- [ ] Scroll funciona com toque
- [ ] Overlay fecha ao tocar fora
- [ ] Teclado não sobrepõe input

## 🔍 Testes de Acessibilidade

### A11y
- [ ] Botão tem aria-label apropriado
- [ ] Sidebar tem role apropriado
- [ ] Navegação por teclado funciona
- [ ] Tab order é lógico
- [ ] Escape fecha a sidebar
- [ ] Screen readers funcionam

## 📊 Métricas de Sucesso

### KPIs para Avaliar
- **Taxa de Uso**: % de usuários que clicam no botão
- **Engajamento**: Média de mensagens por sessão
- **Satisfação**: Respostas úteis vs. não úteis
- **Performance**: Tempo médio de resposta
- **Erros**: Taxa de erro por sessão

## 🎨 Testes Visuais

### Design
- [ ] Cores seguem o tema do dashboard
- [ ] Gradiente do botão é atraente
- [ ] Mensagens são legíveis
- [ ] Espaçamento é adequado
- [ ] Ícones são claros
- [ ] Animações são suaves
- [ ] Dark mode funciona corretamente

## 💡 Sugestões de Melhoria

Durante os testes, anote:
- Perguntas que a IA não respondeu bem
- Dados que deveriam estar disponíveis
- Funcionalidades que faltam
- Bugs encontrados
- Ideias de melhorias

## 📝 Template de Relatório de Teste

```markdown
## Teste: [Nome do Teste]
**Data:** [Data]
**Testador:** [Nome]
**Ambiente:** [Dev/Prod]

### Resultado
- [ ] Passou
- [ ] Falhou
- [ ] Parcial

### Observações
[Descreva o que funcionou e o que não funcionou]

### Screenshots
[Adicione screenshots se relevante]

### Próximos Passos
[O que precisa ser corrigido/melhorado]
```

## 🚀 Após os Testes

1. **Compilar Feedback**: Reunir todos os bugs e sugestões
2. **Priorizar**: Classificar por impacto e esforço
3. **Iterar**: Implementar melhorias prioritárias
4. **Re-testar**: Validar correções
5. **Deploy**: Liberar para produção quando estável

---

**Boa sorte nos testes! 🎉**

