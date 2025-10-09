# 🤖 Analista IA - Dashboard HUDLAB

## 📋 Visão Geral

O **Analista IA** é um assistente inteligente integrado ao Dashboard HUDLAB que utiliza o ChatGPT para analisar dados de negócios, vendas e performance da equipe.

## ✨ Funcionalidades

- 💬 **Chat Interativo**: Interface de conversação natural com a IA
- 📊 **Análise de Dados**: Acesso automático aos dados de negócios do Supabase
- 🎯 **Insights Personalizados**: Respostas baseadas no contexto do usuário
- 📈 **Métricas em Tempo Real**: Análise dos últimos 30 dias de dados
- 🔒 **Seguro**: Respeita permissões e RLS do Supabase

## 🏗️ Arquitetura

### Frontend
```
components/ai-analyst/
├── AIAnalystWrapper.tsx      # Componente principal
├── AIFloatingButton.tsx      # Botão flutuante
└── AIChatSidebar.tsx         # Sidebar de chat
```

### Backend
```
app/api/ai-analyst/
└── chat/route.ts             # Endpoint de chat

lib/ai/
├── openai-client.ts          # Cliente OpenAI
└── context-builder.ts        # Construtor de contexto
```

## 🚀 Como Usar

### 1. Configurar Chave da API OpenAI

1. Acesse [OpenAI Platform](https://platform.openai.com/api-keys)
2. Crie uma nova API Key
3. Adicione no arquivo `.env.local`:

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```

### 2. Testar o Analista IA

1. Faça login no dashboard
2. Clique no botão flutuante **"Analista IA"** (canto inferior direito)
3. A sidebar de chat abrirá da direita para esquerda
4. Faça perguntas sobre seus dados!

### 3. Exemplos de Perguntas

- "Como está a performance de vendas este mês?"
- "Qual vendedor teve melhor desempenho?"
- "Qual é o ticket médio dos negócios?"
- "A taxa de conversão está boa?"
- "Quais são os produtos mais vendidos?"
- "Como estamos em relação às metas?"

## 📊 Dados Disponíveis para a IA

O Analista IA tem acesso aos seguintes dados (últimos 30 dias):

### Negócios (Deals)
- Total de negócios
- Negócios ganhos/perdidos/em aberto
- Receita total
- Ticket médio
- Taxa de conversão

### Performance de Equipe
- Top 5 vendedores (por receita)
- Top 5 designers (por receita)
- Número de negócios por pessoa

### Produtos
- Produtos ativos
- Top 10 produtos recentes
- Marcas e preços

### Metas
- Metas ativas
- Períodos e valores

## 🔐 Segurança

- ✅ **Autenticação obrigatória**: Apenas usuários logados podem usar
- ✅ **RLS do Supabase**: Respeita permissões de acesso aos dados
- ✅ **Dados contextuais**: IA recebe apenas dados que o usuário tem permissão
- ✅ **Sem armazenamento**: Conversas não são salvas (MVP)

## 💰 Custos

### Modelo Atual: GPT-3.5 Turbo
- **Custo**: ~$0.0005 por 1K tokens de input
- **Estimativa**: ~$0.01 por conversa (20 mensagens)
- **Mensal**: ~$10-30 para uso moderado

### Upgrade Futuro: GPT-4 Turbo
- **Custo**: ~$0.01 por 1K tokens de input
- **Melhor para**: Análises complexas e insights avançados

## 🛠️ Desenvolvimento

### Adicionar Novos Dados ao Contexto

Edite `lib/ai/context-builder.ts`:

```typescript
// Adicionar nova query
const { data: newData } = await supabase
  .from("your_table")
  .select("*")
  .limit(10);

// Adicionar ao contexto
context.newData = newData;
```

### Personalizar Prompts

Edite `lib/ai/openai-client.ts`:

```typescript
const systemMessage: ChatMessage = {
  role: "system",
  content: `Seu prompt personalizado aqui...`,
};
```

### Mudar Modelo da IA

Em `lib/ai/openai-client.ts`:

```typescript
const completion = await openai.chat.completions.create({
  model: "gpt-4-turbo-preview", // ou "gpt-3.5-turbo"
  // ...
});
```

## 🔄 Próximas Melhorias

### Versão 2.0 (Planejado)
- [ ] Histórico de conversas salvo no Supabase
- [ ] Function Calling para queries dinâmicas
- [ ] Gráficos gerados pela IA
- [ ] Exportação de relatórios
- [ ] Sugestões proativas
- [ ] Integração com notificações
- [ ] Análise de tendências históricas
- [ ] Comparação entre períodos

## 📝 Notas Técnicas

### Dependências Instaladas
```bash
npm install openai react-markdown
```

### Variáveis de Ambiente Necessárias
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Rotas da API
- `POST /api/ai-analyst/chat` - Enviar mensagem
- `GET /api/ai-analyst/chat` - Obter contexto inicial

## 🐛 Troubleshooting

### Erro: "Chave da API OpenAI inválida"
- Verifique se `OPENAI_API_KEY` está configurada corretamente
- Confirme que a chave está ativa no OpenAI Platform

### Erro: "Não autorizado"
- Faça login no dashboard
- Verifique se o token de autenticação está válido

### Erro: "Limite de requisições atingido"
- Aguarde alguns minutos
- Verifique limites da sua conta OpenAI

### Sidebar não abre
- Verifique o console do navegador
- Confirme que o componente está importado no layout

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do console
2. Revise este README
3. Entre em contato com a equipe de desenvolvimento

---

**Desenvolvido com ❤️ para HUDLAB**

