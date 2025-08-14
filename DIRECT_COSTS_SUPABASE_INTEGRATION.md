# Integração dos Custos Diretos com Supabase

## 📋 Resumo

Foi implementada a integração completa da página de **Custos Diretos** com o Supabase, substituindo o armazenamento local (localStorage) por uma solução de banco de dados robusta e escalável.

## 🚀 Arquivos Criados/Modificados

### Novos Arquivos:
1. **`direct-costs-setup.sql`** - Script SQL para criar a tabela no Supabase
2. **`app/api/direct-costs/route.ts`** - API routes para gerenciar custos diretos
3. **`DIRECT_COSTS_SUPABASE_INTEGRATION.md`** - Este arquivo de documentação

### Arquivos Modificados:
1. **`app/direct-costs/page.tsx`** - Página atualizada para usar Supabase
2. **`types/supabase.ts`** - Adicionados tipos TypeScript para a tabela direct_costs

## 🗄️ Estrutura da Tabela no Banco de Dados

### Tabela: `direct_costs`

```sql
CREATE TABLE IF NOT EXISTS direct_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  value_per_pair DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Campos:**
- `id`: Chave primária UUID gerada automaticamente
- `name`: Nome do custo direto (ex: "Material", "Mão de obra")
- `value_per_pair`: Valor por par em formato decimal (ex: 15.50)
- `created_at`: Data de criação do registro
- `updated_at`: Data da última atualização (atualizada automaticamente)

## 🔧 Configuração do Banco de Dados

### 1. Executar o Script SQL

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Navegue para **SQL Editor** no menu lateral
3. Abra o arquivo `direct-costs-setup.sql`
4. Copie todo o conteúdo
5. Cole no SQL Editor do Supabase
6. Clique em **Run** para executar

### 2. Verificar a Criação da Tabela

1. Vá para **Table Editor** no Supabase Dashboard
2. Verifique se a tabela `direct_costs` foi criada
3. Confirme que os campos estão corretos

## 🔌 API Endpoints

### GET `/api/direct-costs`
- **Descrição**: Busca todos os custos diretos
- **Autenticação**: Requerida
- **Resposta**: Array de custos diretos ordenados por data de criação

### POST `/api/direct-costs`
- **Descrição**: Cria um novo custo direto
- **Autenticação**: Requerida
- **Body**:
  ```json
  {
    "name": "Nome do custo",
    "value_per_pair": 15.50
  }
  ```

### PUT `/api/direct-costs`
- **Descrição**: Atualiza um custo direto existente
- **Autenticação**: Requerida
- **Body**:
  ```json
  {
    "id": "uuid-do-custo",
    "name": "Nome atualizado",
    "value_per_pair": 20.00
  }
  ```

### DELETE `/api/direct-costs?id={uuid}`
- **Descrição**: Exclui um custo direto
- **Autenticação**: Requerida
- **Query Params**: `id` (UUID do custo a ser excluído)

## 🔒 Segurança

### Row Level Security (RLS)
- **Status**: Habilitado na tabela `direct_costs`
- **Política**: Permite todas as operações (pode ser restringida posteriormente)
- **Autenticação**: Todas as operações requerem usuário autenticado

## 🧪 Como Testar

### 1. Verificar a Integração
1. Faça login na aplicação
2. Acesse a página "Custos Diretos"
3. Adicione um novo custo direto
4. Verifique que o custo aparece na lista
5. Edite o custo e confirme a atualização
6. Exclua o custo e verifique a remoção

### 2. Verificar no Banco de Dados
1. Acesse o Supabase Dashboard
2. Vá para **Table Editor** > `direct_costs`
3. Verifique que os dados estão sendo salvos corretamente
4. Confirme que as datas `created_at` e `updated_at` estão funcionando

### 3. Testar Persistência
1. Adicione alguns custos diretos
2. Recarregue a página
3. Verifique que os dados permanecem
4. Feche e abra o navegador
5. Confirme que os dados ainda estão lá

## 📊 Benefícios da Migração

### Antes (localStorage):
- ❌ Dados perdidos ao limpar cache do navegador
- ❌ Não sincroniza entre dispositivos
- ❌ Sem backup automático
- ❌ Limitado ao navegador local

### Depois (Supabase):
- ✅ Dados persistentes e seguros
- ✅ Sincronização automática entre dispositivos
- ✅ Backup automático
- ✅ Acesso de qualquer lugar
- ✅ Controle de acesso por usuário
- ✅ Histórico de alterações
- ✅ Escalabilidade

## 🔄 Migração de Dados Existentes

Se houver dados no localStorage que precisam ser migrados:

1. Acesse a página de custos diretos
2. Abra o console do navegador (F12)
3. Execute: `localStorage.getItem('directCosts')`
4. Copie os dados retornados
5. Adicione manualmente cada custo através da interface

## 🚨 Troubleshooting

### Erro: "Unauthorized"
- **Causa**: Usuário não está autenticado
- **Solução**: Faça login novamente

### Erro: "Failed to fetch direct costs"
- **Causa**: Problema de conexão com o Supabase
- **Solução**: Verifique as variáveis de ambiente e conexão

### Tabela não encontrada
- **Causa**: Script SQL não foi executado
- **Solução**: Execute o script `direct-costs-setup.sql` no Supabase

## 📝 Próximos Passos

1. **Implementar filtros avançados** (por data, valor, etc.)
2. **Adicionar categorias** aos custos diretos
3. **Implementar relatórios** de custos por período
4. **Adicionar validações** mais robustas
5. **Implementar auditoria** de alterações
