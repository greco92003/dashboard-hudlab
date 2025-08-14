# Guia de Configuração do Usuário Administrador

## 📋 Resumo

Este guia explica como configurar o primeiro usuário administrador no Supabase para o Dashboard HudLab.

**Credenciais do Admin:**
- **Email:** hudlabprivatelabel@gmail.com
- **Senha:** Maskhud@2020
- **Role:** admin

## 🚀 Como Executar

### 1. Acesse o Supabase Dashboard
1. Vá para [Supabase Dashboard](https://supabase.com/dashboard/project/xxcwlmuplcretthwsrqa)
2. Navegue para **SQL Editor** no menu lateral

### 2. Execute o Script SQL
1. Abra o arquivo `supabase-admin-setup.sql`
2. Copie todo o conteúdo
3. Cole no SQL Editor do Supabase
4. Clique em **Run** para executar

### 3. Verificação
Após executar o SQL, você verá:
- ✅ Tabela `user_profiles` criada
- ✅ Políticas de segurança (RLS) configuradas
- ✅ Usuário admin criado
- ✅ Sistema de roles implementado

## 🔧 O que foi Criado

### 1. Tabela `user_profiles`
```sql
- id (UUID) - Referência para auth.users
- email (TEXT) - Email do usuário
- role (TEXT) - Role do usuário (admin, user, manager)
- first_name (TEXT) - Primeiro nome
- last_name (TEXT) - Último nome
- created_at (TIMESTAMP) - Data de criação
- updated_at (TIMESTAMP) - Data de atualização
```

### 2. Sistema de Roles
- **admin**: Acesso total ao sistema
- **user**: Usuário padrão
- **manager**: Role intermediária (para futuro uso)

### 3. Políticas de Segurança (RLS)
- Usuários só podem ver/editar seus próprios perfis
- Admins podem ver todos os perfis
- Apenas admins podem criar novos perfis

### 4. Funções Auxiliares
- `is_admin()`: Verifica se o usuário atual é admin
- `has_role(role)`: Verifica se o usuário tem uma role específica
- `handle_new_user()`: Cria perfil automaticamente para novos usuários

## 🔐 Testando o Login

1. Acesse a página de login do seu app
2. Use as credenciais:
   - Email: `hudlabprivatelabel@gmail.com`
   - Senha: `Maskhud@2020`
3. Você deve conseguir fazer login com sucesso

## 📝 Próximas Etapas

### 1. Atualizar Types do TypeScript
Adicione os tipos para user_profiles no arquivo `types/supabase.ts`:

```typescript
user_profiles: {
  Row: {
    id: string
    email: string
    role: 'admin' | 'user' | 'manager'
    first_name: string | null
    last_name: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id: string
    email: string
    role?: 'admin' | 'user' | 'manager'
    first_name?: string | null
    last_name?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    email?: string
    role?: 'admin' | 'user' | 'manager'
    first_name?: string | null
    last_name?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "user_profiles_id_fkey"
      columns: ["id"]
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
  ]
}
```

### 2. Implementar Verificação de Role no Frontend
Crie um hook para verificar roles:

```typescript
// hooks/useRole.ts
export function useRole() {
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState(null)
  
  // Buscar perfil do usuário e verificar role
  // Implementar lógica aqui
  
  return {
    isAdmin: userProfile?.role === 'admin',
    isManager: userProfile?.role === 'manager',
    role: userProfile?.role
  }
}
```

### 3. Proteger Rotas Administrativas
Adicione verificação de role no middleware:

```typescript
// Verificar se é rota admin e se usuário tem permissão
const adminRoutes = ['/admin', '/users-management']
const isAdminRoute = adminRoutes.some(route => 
  req.nextUrl.pathname.startsWith(route)
)

if (isAdminRoute) {
  // Verificar se usuário é admin
  // Redirecionar se não for
}
```

## 🛡️ Segurança

### Pontos Importantes:
1. **Senhas Criptografadas**: Todas as senhas são hash com bcrypt
2. **RLS Habilitado**: Row Level Security protege os dados
3. **Políticas Restritivas**: Usuários só acessam seus próprios dados
4. **Triggers Automáticos**: Perfis são criados automaticamente

### Recomendações:
1. Altere a senha padrão após o primeiro login
2. Implemente 2FA para contas admin
3. Monitore logs de acesso
4. Revise políticas de segurança regularmente

## 🔍 Troubleshooting

### Problema: Usuário não consegue fazer login
**Solução:** Verifique se o usuário foi criado corretamente:
```sql
SELECT * FROM auth.users WHERE email = 'hudlabprivatelabel@gmail.com';
SELECT * FROM user_profiles WHERE email = 'hudlabprivatelabel@gmail.com';
```

### Problema: Role não está sendo aplicada
**Solução:** Verifique se o perfil foi criado:
```sql
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'hudlabprivatelabel@gmail.com';
```

### Problema: Políticas RLS bloqueando acesso
**Solução:** Temporariamente desabilite RLS para debug:
```sql
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
-- Fazer testes
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
```

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do Supabase
2. Teste as queries SQL individualmente
3. Confirme que as variáveis de ambiente estão corretas
4. Verifique se o projeto Supabase está ativo

---

**✅ Após seguir este guia, você terá:**
- Sistema de autenticação funcionando
- Usuário administrador criado
- Sistema de roles implementado
- Base sólida para expansão do sistema
