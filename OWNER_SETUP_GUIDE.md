# Guia de Configuração do Role Owner

## 📋 Resumo

Este guia explica como configurar o role "owner" no sistema e definir o usuário hudlabprivatelabel@gmail.com como owner.

**Credenciais do Owner:**
- **Email:** hudlabprivatelabel@gmail.com
- **Senha:** Maskhud@2020
- **Role:** owner

## 🚀 Como Executar

### 1. Acesse o Supabase Dashboard
1. Vá para [Supabase Dashboard](https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg)
2. Navegue para **SQL Editor** no menu lateral

### 2. Execute o Script SQL
1. Abra o arquivo `OWNER_SETUP.sql`
2. Copie todo o conteúdo
3. Cole no SQL Editor do Supabase
4. Clique em **Run** para executar

### 3. Verificação
Após executar o SQL, você verá:
- ✅ Usuário hudlabprivatelabel@gmail.com atualizado para role "owner"
- ✅ Funções SQL criadas para verificação de permissões
- ✅ Políticas de segurança atualizadas
- ✅ Sistema de hierarquia de roles implementado

## 🔧 O que foi Criado

### 1. Hierarquia de Roles
- **owner**: Acesso total ao sistema (nível mais alto)
- **admin**: Acesso administrativo (pode ser gerenciado por owners)
- **manager**: Role intermediária
- **user**: Usuário padrão

### 2. Funções SQL Criadas
- `is_owner()`: Verifica se o usuário atual é owner
- `is_owner_or_admin()`: Verifica se o usuário é owner ou admin
- `has_role(role)`: Verifica se o usuário tem um role específico

### 3. Políticas de Segurança (RLS)
- Owners podem ver todos os perfis
- Owners podem atualizar qualquer perfil
- Owners podem deletar qualquer perfil (exceto outros owners)
- Proteção contra alteração de outros owners

## 🔐 Permissões do Owner

### Permissões Exclusivas do Owner:
1. **Desaprovar usuários**: Apenas owners podem desaprovar usuários aprovados
2. **Deletar usuários**: Apenas owners podem deletar usuários (exceto outros owners)
3. **Rebaixar admins**: Apenas owners podem alterar role de admin para user
4. **Promover para admin**: Apenas owners podem promover users para admin
5. **Criar outros owners**: Funcionalidade reservada para owners (implementada no frontend)

### Permissões Compartilhadas (Owner + Admin):
1. **Aprovar usuários**: Owners e admins podem aprovar novos usuários
2. **Ver todos os usuários**: Acesso à lista completa de usuários
3. **Gerenciar roles básicos**: Alterar entre user e manager

## 🛡️ Segurança e Proteções

### Proteções Implementadas:
1. **Owners não podem ser deletados**: Política SQL impede deleção de outros owners
2. **Owners não podem ser rebaixados**: Apenas outros owners podem alterar role de owner
3. **Verificação de permissões**: Frontend verifica permissões antes de mostrar ações
4. **Políticas RLS**: Banco de dados força as regras de segurança

### Hierarquia de Permissões:
```
Owner (Nível 4)
├── Pode gerenciar: Admin, Manager, User
├── Não pode gerenciar: Outros Owners
└── Permissões exclusivas: Desaprovar, Deletar, Rebaixar admins

Admin (Nível 3)
├── Pode gerenciar: Manager, User
├── Não pode gerenciar: Owner, Outros Admins
└── Permissões: Aprovar usuários

Manager (Nível 2)
├── Pode gerenciar: User (limitado)
└── Permissões: Básicas

User (Nível 1)
└── Permissões: Apenas próprio perfil
```

## 🧪 Como Testar

### 1. Teste de Login Owner
1. Acesse a página de login
2. Use as credenciais do owner
3. Verifique se tem acesso total ao sistema

### 2. Teste de Permissões
1. Acesse "Gerenciamento de Usuários"
2. Verifique se pode:
   - ✅ Aprovar/Desaprovar usuários
   - ✅ Deletar usuários (exceto outros owners)
   - ✅ Promover users para admin
   - ✅ Rebaixar admins para user

### 3. Teste de Proteções
1. Crie um usuário admin
2. Faça login como admin
3. Verifique que NÃO pode:
   - ❌ Desaprovar usuários
   - ❌ Deletar usuários
   - ❌ Rebaixar outros admins

## 📝 Próximas Etapas

### 1. Configuração Inicial Completa
- [x] Tipos TypeScript atualizados
- [x] Hook de permissões criado
- [x] Componente UserManagement atualizado
- [x] Funções SQL implementadas
- [x] Políticas de segurança configuradas

### 2. Funcionalidades Implementadas
- [x] Verificação de role owner no frontend
- [x] Permissões específicas para cada ação
- [x] Proteção contra ações não autorizadas
- [x] Interface adaptativa baseada em permissões

## 🔍 Troubleshooting

### Problema: Usuário não virou owner
**Solução:** Verifique se o script foi executado:
```sql
SELECT email, role FROM user_profiles WHERE email = 'hudlabprivatelabel@gmail.com';
```

### Problema: Permissões não funcionam
**Solução:** Verifique se as funções foram criadas:
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('is_owner', 'is_owner_or_admin', 'has_role');
```

### Problema: Botões não aparecem
**Solução:** Verifique o console do navegador para erros e recarregue a página.

## 📞 Suporte

Se encontrar problemas:
1. Verifique se o script SQL foi executado completamente
2. Confirme se o usuário está logado corretamente
3. Verifique o console do navegador para erros
4. Teste com um refresh da página
