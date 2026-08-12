# Setup de producao

## Variaveis obrigatorias

Configure os valores reais apenas no gerenciador de secrets local e na Vercel. Nao grave credenciais neste arquivo.

```env
# ActiveCampaign
NEXT_PUBLIC_AC_BASE_URL=https://your-account.api-us1.com
AC_API_TOKEN=your_activecampaign_api_token
AC_CUSTOM_FIELD_ID=5
AC_WEBHOOK_SECRET=your_activecampaign_webhook_signing_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
DASHBOARD_PUBLISHABLE=sb_publishable_your_dashboard_key
DASHBOARD_SECRET=sb_secret_your_dashboard_key

# Aplicacao e cron
CRON_SECRET=your_random_cron_secret
NEXT_PUBLIC_APP_URL=https://your-dashboard.vercel.app

# Webhooks e OAuth (todos server-only)
MANYCHAT_WEBHOOK_SECRET=your_manychat_webhook_signing_secret
NUVEMSHOP_WEBHOOK_SECRET=your_nuvemshop_app_secret
GHL_WEBHOOK_SECRET=your_ghl_bearer_secret
TINY_OAUTH_STATE_SECRET=your_random_tiny_oauth_state_secret
```

As variáveis legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` não são aceitas pela aplicação. Use exclusivamente `DASHBOARD_PUBLISHABLE` e `DASHBOARD_SECRET`.

## Endpoints operacionais

- `POST /api/ghl/sync-deals`: sincronizacao manual completa do GHL.
- `GET /api/deals-cache?period=30`: consulta ao cache.
- `GET /api/deals-health`: health check.
- `GET /api/cron/sync-deals`: sincronizacao automatica protegida por `CRON_SECRET`.

## Checklist de deploy

1. Configure as variaveis para Production, Preview e Development conforme necessario.
2. Gere um novo deploy para incorporar `DASHBOARD_PUBLISHABLE` ao bundle publico.
3. Valide login, leitura de dados, webhooks, cron e uma operacao administrativa.
4. Confirme no Supabase que as novas chaves estao sendo usadas.
5. Confirme que as variaveis legacy nao existem na Vercel e monitore erros de autenticacao.

## Configuracao dos emissores de webhook

- ActiveCampaign: envie `X-ActiveCampaign-Signature` como assinatura HMAC-SHA256 do corpo bruto e mantenha `date_time` no payload.
- ManyChat: envie `X-ManyChat-Signature` como HMAC-SHA256 do corpo bruto e inclua `timestamp` e um ID de evento no payload.
- Nuvemshop: use o segredo do aplicativo em `NUVEMSHOP_WEBHOOK_SECRET`; a aplicacao valida `x-linkedstore-hmac-sha256` e `x-notification-id`.
- GHL: aponte os eventos de oportunidade para `POST /api/webhooks/ghl/deals`.
  Webhooks nativos usam `X-GHL-Signature`; em um Workflow custom webhook,
  mantenha `Authorization: Bearer <GHL_WEBHOOK_SECRET>` e envie `eventId` e
  `opportunityId` (ou `customData.opportunity_id`).
- Tiny: a URL de inicio e o callback exigem admin; `state` expira em 10 minutos e o fluxo usa PKCE S256.

Nunca coloque `DASHBOARD_SECRET`, tokens de integracao ou `CRON_SECRET` em variaveis `NEXT_PUBLIC_*`.
