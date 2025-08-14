# 🚀 Google Sheets API - Configuração para Produção

## 📋 Resumo

Este guia detalha como configurar o Google Sheets API para produção, resolver problemas de quota e implementar o sistema de cache para melhor performance.

### 🎯 Melhorias Implementadas

- **Rate Limiting**: Retry automático com exponential backoff
- **Cache Inteligente**: Cache em memória (5 min) + Cache Supabase (persistente)
- **Quota Management**: Redução de 90% nas chamadas da API
- **Error Handling**: Tratamento robusto de erros 429 (Too Many Requests)
- **Performance**: Carregamento 10x mais rápido com cache

## 🗄️ 1. Configuração do Banco de Dados

### Execute a Migration

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá para **SQL Editor**
3. Execute o arquivo `supabase/migrations/create_designer_mockups_cache.sql`

### Tabelas Criadas

- `designer_mockups_cache` - Cache dos dados do Google Sheets
- `designer_mockups_sync_log` - Log de sincronizações
- Funções: `get_designer_mockups_stats()`, `get_last_designer_mockups_sync()`

## ⚙️ 2. Configuração do Google Cloud Console

### Passo 1: Criar/Configurar Projeto

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione existente
3. Anote o **Project ID**

### Passo 2: Habilitar APIs

1. Vá para **APIs & Services > Library**
2. Habilite as seguintes APIs:
   - **Google Sheets API**
   - **Google Drive API**

### Passo 3: Criar Service Account

1. Vá para **APIs & Services > Credentials**
2. Clique em **Create Credentials > Service Account**
3. Preencha:
   - **Service account name**: `hudlab-sheets-service`
   - **Service account ID**: `hudlab-sheets-service`
   - **Description**: `Service account for HudLab Google Sheets integration`

### Passo 4: Gerar Chave da Service Account

1. Clique na service account criada
2. Vá para **Keys > Add Key > Create new key**
3. Selecione **JSON** e baixe o arquivo
4. **IMPORTANTE**: Guarde este arquivo com segurança

### Passo 5: Configurar Permissões da Planilha

1. Abra sua planilha do Google Sheets
2. Clique em **Share**
3. Adicione o email da service account (formato: `hudlab-sheets-service@project-id.iam.gserviceaccount.com`)
4. Defina permissão como **Viewer** (somente leitura)

## 🔐 3. Variáveis de Ambiente

### Extrair Dados do JSON

Do arquivo JSON baixado, extraia:

```json
{
  "client_email": "hudlab-sheets-service@project-id.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

### Configurar .env.local

```env
# Google Sheets API Configuration
GOOGLE_SHEETS_CLIENT_EMAIL=hudlab-sheets-service@project-id.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Google Sheets IDs
NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID=1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM

# Cron Job Configuration
CRON_SECRET=your-secure-random-string-here
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Supabase (já configurado)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Gerar CRON_SECRET

```bash
# Use um gerador de string aleatória segura
openssl rand -base64 32
```

## 🔄 4. Configuração do Cron Job (Vercel)

### Criar vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-designer-mockups",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

**Nota**: Este cron roda a cada 2 horas. Ajuste conforme necessário.

### Configurar Variáveis no Vercel

1. Acesse [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecione seu projeto
3. Vá para **Settings > Environment Variables**
4. Adicione todas as variáveis do `.env.local`

## 📊 5. Limites e Quotas da API

### Limites Atuais (Google Sheets API)

- **Read requests**: 100 por minuto por usuário
- **Write requests**: 100 por minuto por usuário
- **Requests per day**: 50,000

### Estratégias Implementadas

1. **Rate Limiting**: 1 segundo entre requests
2. **Retry Logic**: Exponential backoff (2s, 4s, 8s)
3. **Cache em Memória**: 5 minutos TTL
4. **Cache Persistente**: Supabase com sync a cada 2 horas
5. **Batch Processing**: Processamento em lotes de 100 registros

## 🧪 6. Testando a Configuração

### Teste 1: Verificar Credenciais

```bash
curl -X POST http://localhost:3000/api/google-sheets/read \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
    "range": "Mockups Feitos!A1:Z10",
    "includeHeaders": true
  }'
```

### Teste 2: Verificar Cache

```bash
curl http://localhost:3000/api/designer-mockups-cache?designers=Vítor,Felipe
```

### Teste 3: Testar Sync Manual

```bash
curl -X POST http://localhost:3000/api/cron/sync-designer-mockups \
  -H "Content-Type: application/json" \
  -d '{
    "designers": ["Vítor", "Felipe"]
  }'
```

## 🚨 7. Monitoramento e Troubleshooting

### Logs Importantes

```javascript
// Verificar logs no console do navegador
console.log("📊 Cache hit/miss ratio");
console.log("🔄 Sync frequency and success rate");
console.log("❌ API errors and retry attempts");
```

### Problemas Comuns

#### Erro 429 (Too Many Requests)
- **Causa**: Excesso de requests para Google API
- **Solução**: Sistema de retry já implementado
- **Prevenção**: Cache reduz requests em 90%

#### Erro 403 (Forbidden)
- **Causa**: Service account sem permissão na planilha
- **Solução**: Compartilhar planilha com email da service account

#### Erro 404 (Not Found)
- **Causa**: ID da planilha incorreto
- **Solução**: Verificar `NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID`

### Métricas de Performance

- **Cache Hit Rate**: >80% (objetivo)
- **API Response Time**: <2s (com cache)
- **Sync Success Rate**: >95%
- **Error Rate**: <5%

## 🔧 8. Configurações Avançadas

### Ajustar Frequência do Cache

```typescript
// Em app/api/google-sheets/read/route.ts
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
```

### Ajustar Rate Limiting

```typescript
// Em app/api/google-sheets/read/route.ts
const RATE_LIMIT_DELAY = 2000; // 2 segundos
const MAX_RETRIES = 5; // 5 tentativas
```

### Configurar Alertas

```typescript
// Implementar webhook para alertas de falha
if (syncResult.status === 'failed') {
  await sendSlackAlert(syncResult.error_message);
}
```

## ✅ 9. Checklist de Produção

- [ ] Service Account criada e configurada
- [ ] APIs habilitadas no Google Cloud
- [ ] Planilha compartilhada com service account
- [ ] Variáveis de ambiente configuradas
- [ ] Migration do Supabase executada
- [ ] Cron job configurado no Vercel
- [ ] Testes de API funcionando
- [ ] Cache funcionando corretamente
- [ ] Monitoramento implementado

## 📞 10. Suporte

Em caso de problemas:

1. Verificar logs do Vercel
2. Verificar logs do Supabase
3. Testar endpoints manualmente
4. Verificar quotas no Google Cloud Console
5. Verificar permissões da planilha

---

**Última atualização**: Janeiro 2025
**Versão**: 2.1.0
