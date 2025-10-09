# ✅ Como Verificar se o Analista IA Está Desabilitado em Produção

## 🎯 Verificação Rápida

### 1️⃣ Verificar em Desenvolvimento (Deve Funcionar)

```bash
# Iniciar servidor de desenvolvimento
npm run dev
```

**Checklist:**
- [ ] Servidor inicia sem erros
- [ ] Acesse http://localhost:3000
- [ ] Faça login
- [ ] **Botão flutuante roxo/azul aparece** no canto inferior direito
- [ ] Clique no botão
- [ ] Sidebar de chat abre
- [ ] Digite uma mensagem de teste
- [ ] IA responde normalmente

**✅ Se tudo acima funcionar = OK em desenvolvimento**

---

### 2️⃣ Verificar em Produção (Deve Estar Desabilitado)

**Opção A: Verificação Visual**

1. Acesse: https://dashboard-hudlab.vercel.app
2. Faça login
3. Procure pelo botão flutuante do Analista IA
4. **✅ Esperado: Botão NÃO deve aparecer**

**Opção B: Verificação via API**

```bash
# Testar endpoint de chat (deve retornar 503)
curl -X POST https://dashboard-hudlab.vercel.app/api/ai-analyst/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "teste"}'

# Resposta esperada:
# {
#   "error": "Analista IA disponível apenas em desenvolvimento",
#   "message": "Esta funcionalidade está em fase de testes..."
# }
# Status: 503
```

```bash
# Testar endpoint de debug (deve retornar 503)
curl https://dashboard-hudlab.vercel.app/api/ai-analyst/debug

# Resposta esperada:
# {
#   "error": "Debug disponível apenas em desenvolvimento",
#   "message": "Este endpoint de debug não está disponível em produção."
# }
# Status: 503
```

**✅ Se APIs retornarem 503 = OK em produção**

---

## 🔍 Verificação Detalhada

### Verificar Variáveis de Ambiente

**Desenvolvimento (.env.local):**
```bash
# Verificar se NODE_ENV está correto
cat .env.local | grep NODE_ENV
# Deve mostrar: NODE_ENV=development

# Verificar se OPENAI_API_KEY existe
cat .env.local | grep OPENAI_API_KEY
# Deve mostrar: OPENAI_API_KEY=sk-proj-...
```

**Produção (Vercel):**
```bash
# Verificar variáveis no Vercel Dashboard
# 1. Acesse: https://vercel.com/greco92003/dashboard-hudlab
# 2. Vá em Settings > Environment Variables
# 3. Confirme que NODE_ENV=production (ou não está definido)
```

---

### Verificar Código

**1. Frontend:**
```bash
# Verificar componente AIAnalystWrapper
cat components/ai-analyst/AIAnalystWrapper.tsx | grep -A 5 "isDevelopment"

# Deve mostrar:
# const isDevelopment = process.env.NODE_ENV === "development";
# 
# if (!isDevelopment) {
#   return null;
# }
```

**2. Backend - Chat:**
```bash
# Verificar rota de chat
cat app/api/ai-analyst/chat/route.ts | grep -A 10 "POST"

# Deve mostrar verificação de NODE_ENV no início
```

**3. Backend - Debug:**
```bash
# Verificar rota de debug
cat app/api/ai-analyst/debug/route.ts | grep -A 10 "GET"

# Deve mostrar verificação de NODE_ENV no início
```

---

## 🧪 Testes Funcionais

### Teste 1: Desenvolvimento Local

```bash
# 1. Iniciar servidor
npm run dev

# 2. Em outro terminal, testar API
curl -X POST http://localhost:3000/api/ai-analyst/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=SEU_TOKEN" \
  -d '{"message": "Olá, como está a performance de vendas?"}'

# ✅ Deve retornar resposta da IA
```

### Teste 2: Build de Produção Local

```bash
# 1. Criar build de produção
npm run build

# 2. Iniciar servidor de produção
npm start

# 3. Acessar http://localhost:3000
# ✅ Botão do Analista IA NÃO deve aparecer

# 4. Testar API
curl -X POST http://localhost:3000/api/ai-analyst/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "teste"}'

# ✅ Deve retornar erro 503
```

### Teste 3: Produção no Vercel

```bash
# Testar produção real
curl -X POST https://dashboard-hudlab.vercel.app/api/ai-analyst/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "teste"}'

# ✅ Deve retornar erro 503
```

---

## 📊 Checklist Completo

### Desenvolvimento ✅
- [ ] `NODE_ENV=development` em `.env.local`
- [ ] `OPENAI_API_KEY` configurada em `.env.local`
- [ ] Servidor inicia sem erros
- [ ] Botão flutuante aparece
- [ ] Sidebar de chat abre
- [ ] API responde normalmente
- [ ] IA gera respostas

### Produção ✅
- [ ] `NODE_ENV=production` no Vercel (ou não definido)
- [ ] Botão flutuante NÃO aparece
- [ ] API `/api/ai-analyst/chat` retorna 503
- [ ] API `/api/ai-analyst/debug` retorna 503
- [ ] Resto do dashboard funciona normalmente
- [ ] Sem erros no console
- [ ] Build bem-sucedido

### Código ✅
- [ ] `AIAnalystWrapper.tsx` tem verificação de `isDevelopment`
- [ ] `chat/route.ts` POST tem verificação de `NODE_ENV`
- [ ] `chat/route.ts` GET tem verificação de `NODE_ENV`
- [ ] `debug/route.ts` GET tem verificação de `NODE_ENV`
- [ ] Sem erros de TypeScript
- [ ] Sem warnings de compilação

### Documentação ✅
- [ ] `AI_ANALYST_PRODUCTION_STATUS.md` criado
- [ ] `AI_ANALYST_PRODUCTION_DISABLE_SUMMARY.md` criado
- [ ] `VERIFICAR_AI_DESABILITADO.md` criado (este arquivo)
- [ ] Documentação original preservada

---

## 🚨 Problemas Comuns

### Problema 1: Botão Aparece em Produção

**Causa:** `NODE_ENV` não está definido corretamente

**Solução:**
```bash
# Verificar no Vercel
# Settings > Environment Variables
# Confirmar que NODE_ENV=production ou remover a variável
```

### Problema 2: API Funciona em Produção

**Causa:** Código não foi deployado corretamente

**Solução:**
```bash
# 1. Verificar último commit
git log -1

# 2. Verificar deploy no Vercel
# Confirmar que o último deploy incluiu as mudanças

# 3. Forçar novo deploy se necessário
git commit --allow-empty -m "Force redeploy"
git push
```

### Problema 3: Erro em Desenvolvimento

**Causa:** `NODE_ENV` não está definido em `.env.local`

**Solução:**
```bash
# Adicionar em .env.local
echo "NODE_ENV=development" >> .env.local

# Reiniciar servidor
npm run dev
```

### Problema 4: Build Falha

**Causa:** Erro de TypeScript ou sintaxe

**Solução:**
```bash
# Verificar erros
npm run build

# Corrigir erros reportados
# Testar novamente
npm run build
```

---

## 📞 Suporte

Se encontrar problemas:

1. **Verificar logs:**
   ```bash
   # Desenvolvimento
   npm run dev
   # Verificar console do navegador (F12)
   
   # Produção
   # Vercel Dashboard > Deployments > Logs
   ```

2. **Consultar documentação:**
   - `AI_ANALYST_README.md` - Visão geral
   - `AI_ANALYST_SETUP.md` - Setup
   - `AI_ANALYST_PRODUCTION_STATUS.md` - Status atual

3. **Verificar código:**
   - `components/ai-analyst/AIAnalystWrapper.tsx`
   - `app/api/ai-analyst/chat/route.ts`
   - `app/api/ai-analyst/debug/route.ts`

---

## ✅ Confirmação Final

Após seguir todos os passos acima, você deve ter:

**Em Desenvolvimento:**
- ✅ Analista IA totalmente funcional
- ✅ Botão flutuante visível
- ✅ Chat funcionando
- ✅ API respondendo

**Em Produção:**
- ✅ Analista IA completamente desabilitado
- ✅ Botão flutuante oculto
- ✅ APIs retornando 503
- ✅ Dashboard funcionando normalmente

**Se tudo acima estiver correto, a desabilitação foi bem-sucedida! 🎉**

---

**Última atualização:** 2025-10-09  
**Responsável:** Equipe de Desenvolvimento HUDLAB

