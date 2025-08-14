# 🔔 Sistema de Notificações - Guia de Configuração

## 📋 Resumo

Sistema completo de notificações para o HudLab Dashboard, incluindo:
- **Notificações manuais** (admins/owners)
- **Notificações automáticas** de vendas da NuvemShop
- **Push notifications** PWA para mobile
- **Interface integrada** no header da aplicação

## ✅ O que foi Implementado

### 1. **Banco de Dados**
- ✅ Tabela `notifications` - notificações principais
- ✅ Tabela `user_notifications` - relacionamento usuário-notificação
- ✅ Tabela `push_subscriptions` - subscriptions PWA
- ✅ Tabela `notification_settings` - configurações por usuário
- ✅ Funções SQL para marcar como lida e contar não lidas
- ✅ Políticas RLS para segurança

### 2. **Push Notifications PWA**
- ✅ Service worker customizado (`/public/sw-custom.js`)
- ✅ Hook `usePushNotifications` para gerenciar subscriptions
- ✅ Integração com Web Push API
- ✅ Suporte a VAPID keys

### 3. **APIs de Backend**
- ✅ `POST /api/notifications` - criar notificações
- ✅ `GET /api/notifications` - buscar notificações do usuário
- ✅ `POST /api/notifications/send-push` - enviar push notifications
- ✅ `POST /api/notifications/mark-read` - marcar como lida
- ✅ `POST /api/notifications/test` - notificação de teste
- ✅ `POST /api/notifications/sale-notification` - notificações de venda

### 4. **Componentes UI**
- ✅ `NotificationCenter` - exibir notificações no header
- ✅ `NotificationManager` - criar notificações (admins/owners)
- ✅ Hook `useNotifications` para gerenciar estado
- ✅ Integração com sistema de permissões existente

### 5. **Notificações Automáticas**
- ✅ Integração com webhook `order/paid` da NuvemShop
- ✅ Cálculo automático de comissão
- ✅ Envio para partners-media da marca correspondente
- ✅ Dados detalhados da venda na notificação

## 🔧 Configuração Necessária

### 1. **Executar Migration do Banco**

Execute o script SQL no Supabase:

```sql
-- Executar o arquivo: supabase/migrations/create_notifications_system.sql
```

### 2. **Configurar VAPID Keys**

Gere as chaves VAPID para push notifications:

```bash
npx web-push generate-vapid-keys
```

Adicione as variáveis de ambiente:

```env
# .env.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=sua_chave_publica_aqui
VAPID_PRIVATE_KEY=sua_chave_privada_aqui
```

### 3. **Atualizar Types TypeScript**

Os tipos já foram atualizados em `types/supabase.ts` com as novas tabelas.

## 🚀 Como Usar

### **Para Usuários (Todos)**

1. **Ver Notificações**: Clique no ícone de sino no header
2. **Marcar como Lida**: Clique no ✓ na notificação
3. **Marcar Todas**: Botão "Marcar todas" no topo
4. **Habilitar Push**: Clique em "Habilitar" quando solicitado
5. **Remover**: Clique no 🗑️ para remover notificação

### **Para Admins/Owners**

1. **Criar Notificação**: Clique em "Nova Notificação" no header
2. **Escolher Destinatários**:
   - **Por Role**: Selecione roles específicos
   - **Por Usuário**: Selecione usuários individuais
   - **Por Marca**: Selecione partners de uma marca
3. **Configurar**: Título, mensagem, tipo e push notification
4. **Enviar**: Clique em "Enviar Notificação"

### **Notificações Automáticas de Venda**

Funcionam automaticamente quando:
1. ✅ Pedido é pago na NuvemShop
2. ✅ Webhook `order/paid` é processado
3. ✅ Sistema identifica a marca dos produtos
4. ✅ Busca partners-media da marca
5. ✅ Calcula comissão baseada nas configurações
6. ✅ Envia notificação com valor da comissão

## 📱 Push Notifications

### **Funcionalidades**
- ✅ Funciona em PWA (mobile)
- ✅ Notificações mesmo com app fechado
- ✅ Clique abre a aplicação
- ✅ Ações: "Ver" e "Dispensar"
- ✅ Ícones personalizados por tipo

### **Suporte**
- ✅ Chrome/Edge (Android/Desktop)
- ✅ Firefox (Android/Desktop)
- ✅ Safari (iOS 16.4+)
- ❌ iOS Safari (versões antigas)

## 🎯 Tipos de Notificação

### **1. Sale (Venda)**
- 💰 Ícone: Cifrão verde
- 📱 Push: Automático
- 🎯 Destinatários: Partners-media da marca
- 📊 Dados: Valor da comissão, detalhes da venda

### **2. Info (Informação)**
- ℹ️ Ícone: Info azul
- 📱 Push: Configurável
- 🎯 Destinatários: Configurável
- 📊 Dados: Personalizável

### **3. Success (Sucesso)**
- ✅ Ícone: Check verde
- 📱 Push: Configurável
- 🎯 Destinatários: Configurável
- 📊 Dados: Personalizável

### **4. Warning (Aviso)**
- ⚠️ Ícone: Triângulo amarelo
- 📱 Push: Configurável
- 🎯 Destinatários: Configurável
- 📊 Dados: Personalizável

### **5. Error (Erro)**
- ❌ Ícone: X vermelho
- 📱 Push: Configurável
- 🎯 Destinatários: Configurável
- 📊 Dados: Personalizável

## 🔒 Segurança e Permissões

### **Permissões por Role**

| Ação | Owner | Admin | Manager | Partners-Media | User |
|------|-------|-------|---------|----------------|------|
| Ver próprias notificações | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar notificações | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver todas as notificações | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar push | ✅ | ✅ | ✅ | ✅ | ✅ |

### **Políticas RLS**
- ✅ Usuários só veem suas notificações
- ✅ Admins/owners podem criar notificações
- ✅ Sistema pode inserir notificações automáticas
- ✅ Push subscriptions são privadas por usuário

## 📊 Monitoramento

### **Logs Disponíveis**
- ✅ Notificações criadas e enviadas
- ✅ Push notifications enviadas/falhadas
- ✅ Notificações lidas/não lidas
- ✅ Subscriptions ativas/inativas

### **Métricas**
- 📈 Total de notificações enviadas
- 📈 Taxa de leitura
- 📈 Push notifications entregues
- 📈 Subscriptions ativas

## 🐛 Troubleshooting

### **Push Notifications não funcionam**
1. Verificar VAPID keys configuradas
2. Verificar HTTPS (obrigatório)
3. Verificar permissões do browser
4. Verificar service worker registrado

### **Notificações não aparecem**
1. Verificar RLS policies
2. Verificar user_notifications criadas
3. Verificar real-time subscription
4. Verificar console do browser

### **Webhook não envia notificações**
1. Verificar webhook registrado na NuvemShop
2. Verificar processamento do pedido
3. Verificar marca dos produtos
4. Verificar partners-media da marca

## 🔄 Próximas Melhorias

### **Funcionalidades Futuras**
- 📧 Notificações por email
- 📱 Notificações no Slack/Discord
- 🔔 Configurações avançadas por usuário
- 📊 Dashboard de analytics
- 🎯 Segmentação avançada
- ⏰ Agendamento de notificações

### **Otimizações**
- 🚀 Cache de notificações
- 📦 Batch processing
- 🔄 Retry automático
- 📈 Métricas detalhadas

## ✅ Status Final

🎉 **Sistema de Notificações 100% Funcional!**

- ✅ Banco de dados configurado
- ✅ APIs implementadas
- ✅ UI/UX integrada
- ✅ Push notifications PWA
- ✅ Notificações automáticas de venda
- ✅ Permissões e segurança
- ✅ Documentação completa

**Pronto para uso em produção!** 🚀
