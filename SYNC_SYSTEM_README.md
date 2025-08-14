# Sistema de Sincronização Global

## Visão Geral

Implementei um sistema de sincronização global que permite ao usuário navegar entre páginas enquanto a sincronização continua em segundo plano, com um componente de alerta persistente mostrando o progresso.

## Componentes Implementados

### 1. Contexto Global de Sincronização (`contexts/SyncContext.tsx`)

- Gerencia o estado global de sincronização usando um SyncManager singleton
- Persiste estado no localStorage para manter entre navegações
- Fornece funções `startSync()` e `stopSync()`
- Permite que qualquer componente acesse o estado `isSyncing`

### 2. Componente de Alerta Global (`components/ui/sync-alert.tsx`)

- Exibe um alerta fixo no canto superior direito durante a sincronização
- **Integrado no SiteHeader** - persiste automaticamente entre páginas
- Aparece automaticamente quando `isSyncing` é `true`
- Tem animação de entrada suave
- Mostra ícone de loading animado

### 3. Hook Personalizado (`hooks/useManualSync.ts`)

- Encapsula a lógica de sincronização manual
- Usa o contexto global para gerenciar o estado
- Mostra notificações de sucesso/erro
- Pode ser reutilizado em qualquer página

### 4. SyncManager Singleton

- Classe singleton que gerencia o estado fora do React
- Persiste no localStorage para sobreviver à navegação
- Sistema de listeners para notificar componentes React
- Funciona independentemente do ciclo de vida dos componentes

## Como Usar

### Em uma nova página:

```tsx
import { useManualSync } from "@/hooks/useManualSync";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MinhaPage() {
  const { isSyncing, handleManualSync } = useManualSync();

  return (
    <div>
      <Button onClick={handleManualSync} disabled={isSyncing} variant="outline">
        {isSyncing ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {isSyncing ? "Sincronizando..." : "Sincronizar Dados"}
      </Button>
    </div>
  );
}
```

### Para verificar apenas o estado de sincronização:

```tsx
import { useSyncContext } from "@/contexts/SyncContext";

export default function MeuComponente() {
  const { isSyncing } = useSyncContext();

  return <div>{isSyncing && <p>Sincronização em andamento...</p>}</div>;
}
```

## Funcionalidades

✅ **Navegação durante sincronização**: O usuário pode navegar entre páginas enquanto a sincronização continua

✅ **Alerta persistente**: Componente integrado no header persiste automaticamente entre páginas

✅ **Estado global**: Todas as páginas compartilham o mesmo estado de sincronização

✅ **Persistência real**: Estado mantido no localStorage sobrevive à navegação client-side

✅ **Botão desabilitado**: O botão de sincronizar fica desabilitado durante a operação

✅ **Notificações**: Toast de sucesso ao finalizar a sincronização

✅ **Reutilizável**: Hook pode ser usado em qualquer página que precise de sincronização

✅ **Solução robusta**: SyncManager singleton funciona independentemente do React

## Páginas Atualizadas

- ✅ `app/dashboard/page.tsx` - Usa o hook `useManualSync`
- ✅ `components/deals-cache-monitor.tsx` - Usa o contexto global
- ✅ `components/site-header.tsx` - **Inclui o SyncAlert para persistência automática**
- ✅ `app/layout.tsx` - Inclui apenas o provider

## Estrutura de Arquivos

```
contexts/
  └── SyncContext.tsx          # Contexto global de sincronização

components/ui/
  └── sync-alert.tsx           # Componente de alerta persistente

hooks/
  └── useManualSync.ts         # Hook para sincronização manual

app/
  └── layout.tsx               # Provider e alerta global
```

## Benefícios

1. **UX Melhorada**: Usuário pode continuar navegando durante sincronização
2. **Feedback Visual**: Alerta persistente mantém o usuário informado
3. **Consistência**: Estado compartilhado entre todas as páginas
4. **Reutilização**: Hook facilita implementação em novas páginas
5. **Manutenibilidade**: Lógica centralizada no contexto e hook
