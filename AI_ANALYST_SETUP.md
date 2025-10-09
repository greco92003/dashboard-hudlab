# 🚀 Setup Rápido - Analista IA

## ⚡ Passos para Ativar o Analista IA

### 1️⃣ Obter Chave da API OpenAI

1. Acesse: https://platform.openai.com/api-keys
2. Faça login ou crie uma conta
3. Clique em **"Create new secret key"**
4. Copie a chave (começa com `sk-proj-...`)

### 2️⃣ Configurar Variável de Ambiente

Abra o arquivo `.env.local` e adicione sua chave:

```env
OPENAI_API_KEY=sk-proj-sua-chave-aqui
```

**⚠️ IMPORTANTE:** 
- Substitua `your-openai-api-key-here` pela sua chave real
- Nunca compartilhe sua chave da API
- Não faça commit da chave no Git

### 3️⃣ Reiniciar o Servidor de Desenvolvimento

```bash
# Parar o servidor (Ctrl+C)
# Iniciar novamente
npm run dev
```

### 4️⃣ Testar o Analista IA

1. Abra o dashboard: http://localhost:3000
2. Faça login
3. Procure o botão flutuante **roxo/azul** no canto inferior direito
4. Clique no botão
5. A sidebar de chat abrirá da direita
6. Faça uma pergunta!

## 🧪 Perguntas de Teste

Experimente estas perguntas para testar:

```
📊 Como está a performance de vendas este mês?
```

```
🎯 Qual vendedor teve melhor desempenho?
```

```
💰 Qual é o ticket médio dos negócios?
```

```
📈 A taxa de conversão está boa?
```

## ✅ Checklist de Verificação

- [ ] Chave da API OpenAI obtida
- [ ] Variável `OPENAI_API_KEY` configurada no `.env.local`
- [ ] Servidor reiniciado
- [ ] Botão flutuante aparece no dashboard
- [ ] Sidebar abre ao clicar no botão
- [ ] Mensagem de boas-vindas aparece
- [ ] Consegue enviar mensagens
- [ ] IA responde às perguntas

## 🐛 Problemas Comuns

### Botão não aparece
- Verifique se está logado no dashboard
- Confirme que está em uma rota com sidebar (ex: /dashboard)
- Verifique o console do navegador (F12)

### Erro: "Chave da API OpenAI inválida"
- Confirme que copiou a chave completa
- Verifique se não há espaços extras
- Teste a chave em: https://platform.openai.com/playground

### Erro: "Não autorizado"
- Faça logout e login novamente
- Limpe o cache do navegador
- Verifique se o token do Supabase está válido

### IA não responde
- Verifique sua conexão com internet
- Confirme que tem créditos na conta OpenAI
- Veja os logs do servidor no terminal

## 💡 Dicas

1. **Primeira vez usando OpenAI?**
   - Você ganha $5 de crédito grátis
   - Suficiente para ~500 conversas com GPT-3.5

2. **Quer respostas melhores?**
   - Seja específico nas perguntas
   - Peça comparações e análises
   - Solicite recomendações

3. **Economizar tokens?**
   - Faça perguntas diretas
   - Evite conversas muito longas
   - Reinicie a conversa quando mudar de assunto

## 📊 Monitorar Uso

Acompanhe seu uso em:
https://platform.openai.com/usage

## 🎯 Próximos Passos

Depois de testar o MVP:

1. **Feedback**: Teste com a equipe e colete feedback
2. **Ajustes**: Personalize prompts e contexto
3. **Expansão**: Adicione mais dados e funcionalidades
4. **Produção**: Configure chave de produção separada

## 📞 Precisa de Ajuda?

Consulte o arquivo `AI_ANALYST_README.md` para documentação completa.

---

**Pronto para começar! 🚀**

