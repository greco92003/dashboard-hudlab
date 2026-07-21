# Meta Marketing API

## Variaveis de ambiente

Configure os valores reais somente no `.env.local` e na Vercel. Nao grave tokens ou app secrets neste repositorio.

```env
META_ACCESS_TOKEN=your_meta_system_user_token
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_BUSINESS_ID=your_meta_business_id
```

O token e o app secret sao credenciais de servidor: nunca use o prefixo `NEXT_PUBLIC_` nem envie esses valores ao navegador.

## Endpoint da aplicacao

`GET /api/meta-marketing/ads-performance`

O endpoint centraliza a comunicacao com a Graph API e mantem as credenciais no servidor. Consulte os logs da funcao na Vercel para diagnosticar falhas de autenticacao, permissao ou limite da API.

## Checklist

1. Configure as quatro variaveis no ambiente correto da Vercel.
2. Gere um novo deploy.
3. Valide o endpoint com um usuario autorizado.
4. Rotacione imediatamente qualquer token ou app secret que tenha sido gravado no Git.
