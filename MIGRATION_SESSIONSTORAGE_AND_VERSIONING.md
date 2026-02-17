# Migração para SessionStorage e Sistema de Versionamento

## Resumo das Mudanças

Este documento descreve as mudanças implementadas para migrar de `localStorage` para `sessionStorage` e implementar um sistema de versionamento automático que força logout quando uma nova versão é detectada.

## 1. Sistema de Storage Wrapper

### Arquivo Criado: `lib/storage.ts`

Criamos um wrapper centralizado para gerenciar o armazenamento de dados:

- **Função**: Abstrai o uso de `sessionStorage` e `localStorage`
- **Padrão**: Usa `sessionStorage` por padrão
- **Métodos principais**:
  - `storage.getItem(key)` - Obtém um item
  - `storage.setItem(key, value)` - Define um item
  - `storage.removeItem(key)` - Remove um item
  - `storage.clear()` - Limpa todo o storage
  - `storage.getJSON<T>(key)` - Obtém e parseia JSON
  - `storage.setJSON<T>(key, value)` - Serializa e salva JSON
  - `storage.keys()` - Retorna todas as chaves
  - `storage.clearAll()` - Limpa session e local storage

## 2. Sistema de Versionamento

### Arquivos Criados:

#### `lib/version.ts`
- Gerencia a versão do build
- Detecta quando há uma nova versão
- Força logout e limpeza de dados quando necessário
- Usa `NEXT_PUBLIC_BUILD_ID` ou `VERCEL_GIT_COMMIT_SHA` como versão

#### `app/api/version/route.ts`
- Endpoint que retorna a versão atual do servidor
- Formato: `GET /api/version`
- Resposta: `{ version: string, timestamp: string, environment: string }`

#### `components/VersionChecker.tsx`
- Componente que verifica a versão periodicamente (a cada 5 minutos)
- Compara versão do cliente com a do servidor
- Se detectar diferença:
  1. Limpa sessionStorage e localStorage
  2. Limpa todos os cookies
  3. Limpa cache do service worker
  4. Redireciona para `/login?reason=version_update`

#### `middleware.ts` (atualizado)
- Adiciona header `X-App-Version` em todas as respostas
- Permite que o cliente valide a versão em cada request

### Integração no Layout

O `VersionChecker` foi adicionado ao `app/layout.tsx` para funcionar em toda a aplicação.

## 3. Migração de localStorage para sessionStorage

### Arquivos Migrados:

#### Hooks:
- ✅ `hooks/useCachedData.ts`
- ✅ `hooks/useFranchiseFilter.ts`
- ✅ `hooks/useGlobalDateRange.ts`
- ✅ `hooks/useHydration.ts`
- ✅ `hooks/useHydrationFix.ts`
- ✅ `hooks/usePersistentAuth.ts`

#### Contexts:
- ✅ `contexts/OptimizedAuthContext.tsx`
- ✅ `contexts/StableAuthContext.tsx`
- ✅ `contexts/SyncContext.tsx`

#### Lib:
- ✅ `lib/cache-config.ts`
- ✅ `lib/cache-recovery.ts`
- ✅ `lib/local-cache.ts`
- ✅ `lib/supabase.ts`

#### Components:
- ✅ `components/deals-cache-monitor.tsx`
- ✅ `components/PWAInstallPrompt.tsx`

#### Pages:
- ✅ `app/auth/auth-code-error/page.tsx`
- ✅ `app/designers/page.tsx`
- ✅ `app/partners/dashboard/page.tsx`
- ✅ `app/partners/home/page.tsx`
- ✅ `app/partners/orders/page.tsx`
- ✅ `app/partners/products/page.tsx`
- ✅ `app/profile-settings/page.tsx`
- ✅ `app/programacao/page.tsx`
- ✅ `app/global-error.tsx`

#### Utils:
- ✅ `utils/debugHelpers.ts`

### Script de Migração

Criamos `scripts/migrate-storage.js` para automatizar a migração:
- Substitui `localStorage.getItem()` por `storage.getItem()`
- Substitui `localStorage.setItem()` por `storage.setItem()`
- Substitui `localStorage.removeItem()` por `storage.removeItem()`
- Substitui `localStorage.clear()` por `storage.clear()`
- Adiciona import do storage wrapper onde necessário

## 4. Comportamento Esperado

### Quando um novo deploy é feito:

1. A versão do build muda (baseada no commit SHA ou timestamp)
2. O `VersionChecker` detecta a diferença
3. Todos os dados do cliente são limpos automaticamente
4. Usuário é deslogado
5. Usuário é redirecionado para `/login?reason=version_update`
6. Não há erros de API ou estado inconsistente

### Vantagens do sessionStorage:

- Dados são limpos automaticamente quando a aba/janela é fechada
- Cada aba tem seu próprio estado isolado
- Reduz problemas de cache entre versões
- Mais seguro para dados sensíveis

## 5. Variáveis de Ambiente

Para o sistema de versionamento funcionar corretamente na Vercel, certifique-se de que as seguintes variáveis estão disponíveis:

- `NEXT_PUBLIC_BUILD_ID` (opcional, gerado automaticamente)
- `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (fornecido pela Vercel)
- `VERCEL_GIT_COMMIT_SHA` (fornecido pela Vercel)

## 6. Testes Recomendados

1. **Teste de Migração de Storage**:
   - Verificar se dados são salvos corretamente no sessionStorage
   - Verificar se dados são limpos ao fechar a aba
   - Verificar se cada aba tem estado independente

2. **Teste de Versionamento**:
   - Fazer um deploy
   - Manter uma aba aberta com versão antiga
   - Aguardar 5 minutos ou forçar verificação
   - Verificar se logout automático funciona
   - Verificar se redirecionamento funciona
   - Verificar se não há erros no console

3. **Teste de Compatibilidade**:
   - Testar login/logout
   - Testar navegação entre páginas
   - Testar filtros e preferências
   - Testar sincronização de dados

## 7. Rollback (se necessário)

Se houver problemas, você pode reverter temporariamente:

1. Alterar `lib/storage.ts` para usar `localStorage` por padrão
2. Comentar o `<VersionChecker />` no `app/layout.tsx`
3. Fazer um novo deploy

## 8. Próximos Passos

- ✅ Migração completa para sessionStorage
- ✅ Sistema de versionamento implementado
- ⏳ Testes em produção
- ⏳ Monitoramento de erros
- ⏳ Ajustes baseados em feedback

