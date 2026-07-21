# Setup de producao

## Variaveis obrigatorias

Configure os valores reais apenas no gerenciador de secrets local e na Vercel. Nao grave credenciais neste arquivo.

```env
# ActiveCampaign
NEXT_PUBLIC_AC_BASE_URL=https://your-account.api-us1.com
AC_API_TOKEN=your_activecampaign_api_token
AC_CUSTOM_FIELD_ID=5

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
DASHBOARD_PUBLISHABLE=sb_publishable_your_dashboard_key
DASHBOARD_SECRET=sb_secret_your_dashboard_key

# Aplicacao e cron
CRON_SECRET=your_random_cron_secret
NEXT_PUBLIC_APP_URL=https://your-dashboard.vercel.app
```

As variaveis legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` existem apenas como fallback temporario no codigo. Depois do deploy, smoke test e confirmacao de que nao ha uso legacy, desative as chaves legacy no Supabase e remova esses fallbacks.

## Endpoints operacionais

- `POST /api/deals-sync`: sincronizacao manual.
- `GET /api/deals-sync`: status da ultima sincronizacao.
- `GET /api/deals-cache?period=30`: consulta ao cache.
- `GET /api/deals-health`: health check.
- `GET /api/cron/sync-deals`: sincronizacao automatica protegida por `CRON_SECRET`.

## Checklist de deploy

1. Configure as variaveis para Production, Preview e Development conforme necessario.
2. Gere um novo deploy para incorporar `DASHBOARD_PUBLISHABLE` ao bundle publico.
3. Valide login, leitura de dados, webhooks, cron e uma operacao administrativa.
4. Confirme no Supabase que as novas chaves estao sendo usadas.
5. Desative as chaves legacy e monitore erros de autenticacao.

Nunca coloque `DASHBOARD_SECRET`, tokens de integracao ou `CRON_SECRET` em variaveis `NEXT_PUBLIC_*`.
