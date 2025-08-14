# Meta Marketing API - Dashboard Integration

## Visão Geral

Este documento descreve a integração da Meta Marketing API (Facebook/Instagram) com o dashboard HUDLAB para visualização de dados de anúncios e campanhas.

## Configuração Atual

### Variáveis de Ambiente

```env
# Token de acesso para Meta Marketing API (Facebook/Instagram)
# System User Token - nunca expira
META_ACCESS_TOKEN=EAAKmO9N7QBABPMcNbIRP1jeMCIOF5QWlXM5H1nlWMZC0XAf8fLb1ODvAkLzKsjsPfYTSdL2OVVPmZCihW9VEMGhnH7PzVp0eGZAanEnx1ewJd4KUJ5OEfEqLZCgPZBIJ7BEu9OqLuu5sQaQNl6pEZBeSZBbk1fHbmpTrWH17ZAv5LyxXZCyScTC3kxxEukz9jd9gpEsaMP4x46ctnMjJZAojov80vgFEQS6iZAyCZB6rWFy4

# Configurações adicionais da Meta API
META_APP_ID=745725834772496
META_APP_SECRET=8bdad0ee13d5add6e6daebb90a9d010b
META_BUSINESS_ID=604090758261668
```

## Estrutura da Meta Marketing API

### Endpoints Principais

- **Graph API Base URL**: `https://graph.facebook.com/v23.0/`
- **Business Account**: `/act_{ad_account_id}/`
- **Campaigns**: `/campaigns`
- **Ad Sets**: `/adsets`
- **Ads**: `/ads`
- **Insights**: `/insights`

### Hierarquia de Objetos

```
Business Account
├── Campaigns (Campanhas)
│   ├── Ad Sets (Conjuntos de Anúncios)
│   │   ├── Ads (Anúncios)
│   │   └── Insights (Métricas)
│   └── Insights (Métricas da Campanha)
└── Insights (Métricas da Conta)
```

## Implementação Atual

### Fase 1 - Estrutura Básica ✅

- [x] Criação do README de documentação
- [x] Estrutura de pastas para Meta Marketing
- [x] Página inicial com informações básicas
- [x] API route para buscar dados básicos da conta
- [x] Adicionado ao sidebar de navegação
- [x] Build bem-sucedido

### Fase 2 - Dados Básicos ✅

- [x] Buscar informações da conta de anúncios
- [x] API route para insights básicos
- [x] Exibir métricas básicas (impressões, cliques, gastos)
- [x] Interface simples para visualização
- [x] Cards com métricas principais (CPM, CPC, CTR)
- [x] Testar conexão real com Meta API
- [x] Validação completa: Conta HUDLAB ativa, R$ 105.015,85 gastos, 5 campanhas
- [x] Seletor de períodos global (30, 60, 90 dias + personalizado)
- [x] Integração com useGlobalDateRange hook
- [x] Persistência de período entre páginas
- [x] API suporte para datas personalizadas

### Fase 3 - Métricas Avançadas (Planejado)

- [ ] Insights detalhados por campanha
- [ ] Métricas por período (hoje, 7 dias, 30 dias)
- [ ] Comparação de performance
- [ ] Gráficos de tendências

### Fase 4 - Análises Avançadas (Futuro)

- [ ] Segmentação por audiência
- [ ] ROI e ROAS
- [ ] Análise de conversões
- [ ] Relatórios personalizados

## Endpoints da API

### 1. Informações da Conta

```
GET /v23.0/act_{ad_account_id}
Fields: name, account_status, currency, timezone_name, amount_spent
```

### 2. Campanhas

```
GET /v23.0/act_{ad_account_id}/campaigns
Fields: id, name, status, objective, created_time, updated_time
```

### 3. Insights Básicos

```
GET /v23.0/act_{ad_account_id}/insights
Fields: impressions, clicks, spend, cpm, cpc, ctr
Time Range: last_7_days, last_30_days, today
```

### 4. Insights de Anúncios

```
GET /v23.0/{ad_id}/insights
Fields: spend, cost_per_result, cost_per_action_type, actions
Time Range: últimos 30 dias
Level: ad
```

**Nota importante sobre cost_per_result:**

- `cost_per_result`: Custo por resultado baseado no objetivo da campanha (conversões, leads, vendas, etc.)
- `cost_per_link_click`: Custo especificamente por cliques em links (não é o mesmo que cost_per_result)
- A API prioriza o campo `cost_per_result` direto quando disponível, caso contrário usa `cost_per_action_type` baseado no objetivo da campanha

**Mapeamento de Objetivos para Tipos de Ação:**

| Objetivo da Campanha    | Tipo de Ação (`action_type`) | Descrição                      |
| ----------------------- | ---------------------------- | ------------------------------ |
| `OUTCOME_SALES`         | `subscribe`                  | Inscrições/Assinaturas         |
| `OUTCOME_TRAFFIC`       | `instagram_profile_visit`    | Visitas ao perfil do Instagram |
| `OUTCOME_LEADS`         | `lead`                       | Geração de leads               |
| `OUTCOME_ENGAGEMENT`    | `post_engagement`            | Engajamento com posts          |
| `OUTCOME_APP_PROMOTION` | `app_install`                | Instalações de app             |
| `OUTCOME_AWARENESS`     | `reach`                      | Alcance/Consciência de marca   |

## Estrutura de Arquivos

```
app/
├── meta-marketing/
│   ├── layout.tsx          # Layout da seção
│   ├── page.tsx           # Página principal
│   ├── campaigns/
│   │   └── page.tsx       # Lista de campanhas
│   └── insights/
│       └── page.tsx       # Métricas e insights
├── api/
│   └── meta-marketing/
│       ├── account/
│       │   └── route.ts   # Dados da conta
│       ├── campaigns/
│       │   └── route.ts   # Lista de campanhas
│       └── insights/
│           └── route.ts   # Métricas e insights
```

## Dados Reais da Conta HUDLAB

### Informações da Conta (Testado em 2025-01-08)

- **Nome**: HUDLAB
- **ID**: act_328893110151760
- **Status**: Ativa (account_status: 1)
- **Moeda**: BRL
- **Fuso Horário**: America/Sao_Paulo
- **Total Gasto**: R$ 105.015,85

### Métricas dos Últimos 7 Dias

- **Impressões**: 480.416
- **Cliques**: 7.360
- **Gasto**: R$ 3.987,55
- **CPM**: R$ 8,30
- **CPC**: R$ 0,54
- **CTR**: 1,53%

### Campanhas Ativas

- **Total de Campanhas**: 5+
- **Campanhas Ativas**: 3
- **Campanhas Pausadas**: 2
- **Objetivo Principal**: OUTCOME_SALES

## Próximos Passos

1. ~~**Implementar API route básica** para testar conexão com Meta API~~ ✅
2. ~~**Criar interface simples** para exibir dados da conta~~ ✅
3. **Adicionar listagem de campanhas** com status e métricas básicas
4. **Implementar gráficos simples** para visualização de dados
5. **Expandir gradualmente** com mais métricas e funcionalidades

## Referências

- [Meta Marketing API Documentation](https://developers.facebook.com/docs/marketing-api/)
- [Graph API Reference](https://developers.facebook.com/docs/graph-api/)
- [Insights API](https://developers.facebook.com/docs/marketing-api/insights/)
- [Ad Account Reference](https://developers.facebook.com/docs/marketing-api/reference/ad-account/)

## Notas de Desenvolvimento

- **Token de Acesso**: Usando System User Token que não expira
- **Rate Limits**: Meta API tem limites de taxa, implementar cache quando necessário
- **Permissões**: Verificar se o token tem todas as permissões necessárias
- **Erro Handling**: Implementar tratamento robusto de erros da API
- **Cache**: Considerar cache para dados que não mudam frequentemente

---

**Última atualização**: 2025-01-08
**Desenvolvedor**: Augment Agent
**Status**: v1.1 - Seletor de períodos global implementado e funcionando

## Changelog

### 2025-01-08 - v1.1

- ✅ Implementado seletor de períodos global
- ✅ Integração com useGlobalDateRange hook
- ✅ Suporte para períodos: 30, 60, 90 dias + personalizado
- ✅ API atualizada para suportar datas personalizadas
- ✅ Persistência de período entre páginas
- ✅ Interface dinâmica mostra período selecionado
- ✅ Build bem-sucedido sem erros

### 2025-01-08 - v1.0

- ✅ Criada estrutura completa da página Meta Marketing
- ✅ Implementadas API routes para account e insights
- ✅ Interface responsiva com cards de métricas
- ✅ Integração com sidebar de navegação
- ✅ README completo com documentação
- ✅ Build bem-sucedido sem erros
- ✅ Testada conexão real com Meta API
- ✅ Validados dados reais: Conta HUDLAB ativa
- ✅ Métricas funcionando: 480k impressões, 7.3k cliques
