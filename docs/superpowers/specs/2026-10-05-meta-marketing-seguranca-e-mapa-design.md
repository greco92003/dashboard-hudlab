# Meta Marketing: fase 2 (segurança) e mapa dos estados com cache

Data: 05/10/2026. Duas entregas independentes, em dois PRs, nesta ordem.

## Contexto

A fase 1 (PR #27/#28) passou as funções de relatório do Meta Marketing a rodar
com permissão do dono (`security definer`), porque com RLS o banco não usava os
índices de data. A trava de "usuário aprovado" ficou para esta fase. Hoje um
usuário logado e **não aprovado** consegue:

- executar as funções `get_resumo_periodo`, `get_serie_diaria`,
  `get_funil_etapas`, `get_desempenho_fonte`, `get_funnel_por_anuncio`,
  `_kpis_periodo`, `get_nomes_pipelines` e `reconciliacao_meta_ghl`;
- ler as views sem `security_invoker` (`v_desempenho_uf_mes`,
  `v_atribuicao_saude`, `v_leads_sem_venda`, `v_utm_sem_match`,
  `v_vendas_sem_pares`, `v_vendas`) e as MVs `mv_contato_atribuicao` e
  `mv_contatos_importados`, que ignoram o RLS das tabelas;
- ter INSERT/UPDATE/DELETE concedidos nessas views e MVs.

`sync_ghl_contact_tags()` é função de trigger (`trg_ghl_contact_tags` em
`ghl_contacts`) com EXECUTE para `PUBLIC`. Não pode ser chamada direto, mas o
grant não tem motivo de existir.

A aba Regiões lê `v_desempenho_uf_mes` e `v_sazonalidade_regiao` do navegador,
sem cache, e cada uma leva cerca de 11 s. A tabela estado × mês ignora o
seletor de período da página.

## Decisão de arquitetura

O navegador deixa de ler views e funções de relatório do Meta Marketing. Tudo
passa por `GET /api/meta-marketing/report`, que já exige usuário aprovado
(`requireApprovedUser`, que também barra o papel `producao`), usa
`service_role` e guarda o resultado em `meta_marketing_report_cache` (cache no
banco, servido antigo enquanto recalcula em segundo plano, invalidado quando
um sync termina com dados novos, trava contra recálculo simultâneo).

Alternativas descartadas:
- checar `private.is_approved_user()` dentro de cada view: recria seis views
  complexas, cada uma precisa de exceção para `service_role` e a próxima view
  nasce aberta por esquecimento;
- `security_invoker = true` nas views: volta o problema de desempenho da fase 1.

## PR 1: segurança

### Banco
1. `revoke execute ... from authenticated, anon, public` nas oito funções de
   relatório. `service_role` mantém o acesso (rota e edge functions
   `meta-ghl-insights` e `meta-ghl-creative-insights`).
2. `revoke select` de `authenticated` e `anon` em `v_atribuicao_saude`,
   `v_leads_sem_venda`, `v_utm_sem_match`, `v_vendas_sem_pares`, `v_vendas`,
   `mv_contato_atribuicao` e `mv_contatos_importados`. A aba Regiões ainda lê
   `v_desempenho_uf_mes` e `v_sazonalidade_regiao` do navegador até o PR 2,
   que remove as duas views.
3. `revoke insert, update, delete, truncate` de `authenticated` e `anon` em
   todas as views e MVs do módulo.
4. `revoke execute on function sync_ghl_contact_tags() from public, authenticated`.

### Rota `/api/meta-marketing/report`
Relatórios novos, com o mesmo cache. Os que não dependem de período usam a
chave com `inicio`/`fim` fixos e o mesmo TTL.

| report | origem | período |
|---|---|---|
| `pipelines` | `get_nomes_pipelines()` | não |
| `health` | `v_atribuicao_saude` | não |
| `utm-unmatched` | `v_utm_sem_match` (limite 100) | não |
| `leads-without-sale` | `v_leads_sem_venda` | não |
| `sales-without-pairs` | `v_vendas_sem_pares` filtrado por `dia_venda` | sim |

As views passam a ser lidas por funções `security definer` com
`search_path` fixo e EXECUTE só para `service_role`, para que a rota continue
usando só `rpc`. Entrada validada como hoje: `report` em lista fechada, datas
`YYYY-MM-DD` válidas, `inicio <= fim`, janela de até 366 dias.

### Telas
Saúde, Anúncios e Visão Geral trocam `supabase.from(...)`/`rpc` do navegador
por `fetchMarketingReport` (`app/meta-marketing/report-client.ts`).

### Verificação
- No banco, simular `authenticated` com um `sub` não aprovado e outro aprovado
  (`set local role` + `request.jwt.claims`): todas as funções e views do módulo
  devem negar acesso aos dois (o acesso agora é só pela rota).
- Rota: 401 sem sessão, 403 para não aprovado e para `producao`, 200 para
  aprovado.
- Tela: todas as abas carregam para usuário aprovado, sem erro no console.
- `tsc`, lint e testes existentes sem erro.

## PR 2: mapa e cache da aba Regiões

### Funções novas (molde da fase 1: dia da venda indexado e `mv_contato_atribuicao`)
- `get_desempenho_uf(p_inicio date, p_fim date)`: uma linha por UF no período,
  com `uf, region_group, spend, leads_meta, leads_ghl, mockups, vendas,
  faturamento`. Mesma semântica de `v_desempenho_uf_mes`.
- `get_desempenho_uf_mes(p_inicio date, p_fim date)`: UF × mês, para a tabela.
- `get_sazonalidade_regiao()`: região × estação.

Todas `security definer`, `search_path` fixo, EXECUTE só para `service_role`.
Meta de tempo: abaixo de 1 s cada. Depois da troca na tela, as views
`v_desempenho_uf_mes` e `v_sazonalidade_regiao` são removidas (sem `cascade`,
conferindo dependentes e chamadas na API antes).

Reconciliação: a soma de `get_desempenho_uf` no período bate com a soma das
linhas de `get_desempenho_uf_mes` nos meses inteiros do mesmo período, e o
faturamento por estado não ultrapassa o faturamento total dos cards.

### Rota
Relatórios `regions` (período), `regions-monthly` (de 01/07/2026, início da
coleta do Meta, até hoje) e `seasonality`.

### Pré-aquecimento
`GET /api/cron/prewarm-meta-marketing`, protegido por `requireCronSecret`,
agendado na Vercel às 9h45 de Brasília (`45 12 * * *` em UTC), depois dos
syncs das 9h–9h35. Calcula os relatórios das janelas padrão ("últimos 30 dias"
e "mês atual") reaproveitando a função de refresh da rota.

### Componente `components/charts/brazil-map.tsx`
Genérico, sem regra de negócio do Meta Marketing.

```ts
interface BrazilMapDatum { uf: string; value: number | null }
interface BrazilMapProps {
  data: BrazilMapDatum[];
  formatValue: (v: number) => string;
  /** "sequential": maior valor = cor mais forte. "sequential-inverted": menor valor = cor mais forte. */
  colorScale?: "sequential" | "sequential-inverted";
  color?: string;               // padrão: var(--chart-1)
  selectedUf?: string | null;
  onSelectUf?: (uf: string | null) => void;
  renderTooltip?: (uf: string, datum?: BrazilMapDatum) => React.ReactNode;
  className?: string;
}
```

Identidade da biblioteca `components/charts/`:
- tooltip com `TooltipBox` e as cores `--chart-tooltip-*`;
- entrada animada com `motion` (estados aparecem com fade em sequência);
- hover esmaece os demais estados, como `series-hover-dim`;
- escala em cinco faixas por quantil, misturando a cor com
  `--chart-background`, válida nos temas claro e escuro;
- estado sem dado em hachura com `--chart-scale-pattern-color`;
- legenda das cinco faixas com o mesmo estilo de legenda dos charts.

Acessibilidade: cada estado é focável (`tabIndex=0`), com `aria-label`
"Nome do estado: valor", Enter/Espaço seleciona, Esc limpa a seleção. O DF,
pequeno demais para clicar, ganha um marcador circular no ponto de rótulo.

### Geometria
`scripts/gerar-mapa-brasil.mjs` lê o SVG da Simplemaps (licença de uso
comercial gratuito, atribuição mantida em comentário) e gera
`components/charts/brazil-map-geometry.ts` com `viewBox`, e por UF: sigla,
nome, `d` simplificado (coordenadas com uma casa decimal e pontos colineares
ou repetidos removidos) e ponto de rótulo. Meta: abaixo de 60 KB. O SVG
original fica em `scripts/assets/br.svg`.

### Aba Regiões
1. Card do mapa no topo, seguindo o período da página. Seletor de métrica:
   ROAS (maior é melhor), Investimento, Custo/Mockup (menor é melhor, escala
   invertida) e Faturamento. Tooltip com investimento, mockups, vendas,
   faturamento e ROAS. Ao lado, os cinco melhores estados na métrica (empilha
   embaixo no celular).
2. Clicar num estado (no mapa ou no ranking) destaca a linha dele na tabela
   estado × mês e rola até ela.
3. Tabela estado × mês e cards de sazonalidade continuam, lendo da rota.

### Testes
- Geometria: 27 UFs, todas com `d` não vazio e ponto de rótulo dentro do
  `viewBox`.
- Faixas de cor: quantis corretos, valores nulos fora da escala, escala
  invertida.
- Rota: `report` desconhecido e período inválido devolvem 400.
- Banco: reconciliação descrita acima em "últimos 30 dias" e setembro.
- Tela conferida no navegador nos temas claro e escuro e em 375 px.
