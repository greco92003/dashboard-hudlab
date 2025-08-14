// =====================================================
// SERVICE WORKER DEDICADO PARA PUSH NOTIFICATIONS
// =====================================================
// Service worker simples sem workbox para evitar conflitos

console.log('🚀 Push-only Service Worker carregado');

// Event listener para push notifications
self.addEventListener('push', function(event) {
  console.log('🔔 Push notification recebida:', event);

  if (!event.data) {
    console.log('❌ Push event mas sem dados');
    return;
  }

  try {
    const data = event.data.json();
    console.log('📨 Dados do push:', data);

    const options = {
      body: data.message || data.body || 'Nova notificação',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      image: data.image,
      data: {
        url: data.url || '/',
        notificationId: data.notificationId,
        type: data.type || 'info',
        timestamp: Date.now(),
        ...data.data
      },
      actions: [
        {
          action: 'view',
          title: 'Ver',
          icon: '/icons/icon-32x32.png'
        },
        {
          action: 'dismiss',
          title: 'Dispensar'
        }
      ],
      requireInteraction: data.requireInteraction || false,
      silent: data.silent || false,
      vibrate: data.vibrate || [200, 100, 200],
      tag: data.tag || 'hudlab-notification',
      renotify: data.renotify || false
    };

    // Customizar ícone baseado no tipo
    switch (data.type) {
      case 'sale':
        options.icon = '/icons/icon-192x192.png';
        options.badge = '/icons/icon-96x96.png';
        break;
      case 'success':
        options.icon = '/icons/icon-192x192.png';
        break;
      case 'warning':
        options.icon = '/icons/icon-192x192.png';
        break;
      case 'error':
        options.icon = '/icons/icon-192x192.png';
        break;
      default:
        options.icon = '/icons/icon-192x192.png';
    }

    const title = data.title || 'HudLab Dashboard';

    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => {
          console.log('✅ Notificação exibida com sucesso');
        })
        .catch(err => {
          console.error('❌ Falha ao exibir notificação:', err);
        })
    );

  } catch (error) {
    console.error('❌ Erro ao processar push notification:', error);
    
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('HudLab Dashboard', {
        body: 'Nova notificação disponível',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: { url: '/' }
      })
    );
  }
});

// Event listener para cliques em notificações
self.addEventListener('notificationclick', function(event) {
  console.log('🖱️ Notificação clicada:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  // Fechar a notificação
  notification.close();

  if (action === 'dismiss') {
    console.log('🚫 Notificação dispensada');
    return;
  }

  // Determinar URL de destino
  let targetUrl = data.url || '/';
  
  if (action === 'view' || !action) {
    // Se é uma notificação de venda, ir para o dashboard de parceiros
    if (data.type === 'sale' && data.brand) {
      targetUrl = '/partners/dashboard';
    }
    
    // Se tem notificationId, adicionar como query param para marcar como lida
    if (data.notificationId) {
      const url = new URL(targetUrl, self.location.origin);
      url.searchParams.set('notification', data.notificationId);
      targetUrl = url.toString();
    }
  }

  console.log('🔗 Abrindo URL:', targetUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Verificar se já existe uma janela aberta com a aplicação
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('🔄 Focando janela existente e navegando');
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        
        // Se não existe janela aberta, abrir uma nova
        console.log('🆕 Abrindo nova janela');
        return clients.openWindow(targetUrl);
      })
      .catch(err => {
        console.error('❌ Erro ao lidar com clique na notificação:', err);
      })
  );
});

// Event listener para fechar notificações
self.addEventListener('notificationclose', function(event) {
  console.log('❌ Notificação fechada:', event);
});

// Log quando o service worker é instalado
self.addEventListener('install', function(event) {
  console.log('🔧 Push-only SW instalado');
  self.skipWaiting();
});

// Log quando o service worker é ativado
self.addEventListener('activate', function(event) {
  console.log('✅ Push-only SW ativado');
  event.waitUntil(self.clients.claim());
});

console.log('✅ Push-only Service Worker configurado');
