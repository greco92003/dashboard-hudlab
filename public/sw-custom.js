// =====================================================
// CUSTOM SERVICE WORKER FOR PUSH NOTIFICATIONS
// =====================================================
// Este service worker customizado adiciona funcionalidades de push notifications
// ao service worker gerado automaticamente pelo next-pwa

// Importar o service worker principal do next-pwa
importScripts('/sw.js');

// =====================================================
// PUSH NOTIFICATION HANDLERS
// =====================================================

// Event listener para push notifications
self.addEventListener('push', function(event) {
  console.log('🔔 Push notification received:', event);

  if (!event.data) {
    console.log('❌ Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('📨 Push data:', data);

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
          console.log('✅ Notification shown successfully');
          
          // Enviar confirmação de entrega para o servidor
          return fetch('/api/notifications/delivery-confirmation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              notificationId: data.notificationId,
              delivered: true,
              timestamp: Date.now()
            })
          }).catch(err => {
            console.warn('⚠️ Failed to send delivery confirmation:', err);
          });
        })
        .catch(err => {
          console.error('❌ Failed to show notification:', err);
        })
    );

  } catch (error) {
    console.error('❌ Error processing push notification:', error);
    
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
  console.log('🖱️ Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  // Fechar a notificação
  notification.close();

  if (action === 'dismiss') {
    console.log('🚫 Notification dismissed');
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

  console.log('🔗 Opening URL:', targetUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Verificar se já existe uma janela aberta com a aplicação
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('🔄 Focusing existing window and navigating');
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        
        // Se não existe janela aberta, abrir uma nova
        console.log('🆕 Opening new window');
        return clients.openWindow(targetUrl);
      })
      .then(client => {
        if (client) {
          console.log('✅ Window opened/focused successfully');
          
          // Marcar notificação como lida no servidor
          if (data.notificationId) {
            return fetch('/api/notifications/mark-read', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                notificationId: data.notificationId,
                timestamp: Date.now()
              })
            }).catch(err => {
              console.warn('⚠️ Failed to mark notification as read:', err);
            });
          }
        }
      })
      .catch(err => {
        console.error('❌ Error handling notification click:', err);
      })
  );
});

// Event listener para fechar notificações
self.addEventListener('notificationclose', function(event) {
  console.log('❌ Notification closed:', event);
  
  const notification = event.notification;
  const data = notification.data || {};
  
  // Opcional: registrar que a notificação foi fechada
  if (data.notificationId) {
    fetch('/api/notifications/closed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notificationId: data.notificationId,
        timestamp: Date.now()
      })
    }).catch(err => {
      console.warn('⚠️ Failed to register notification close:', err);
    });
  }
});

// =====================================================
// BACKGROUND SYNC FOR NOTIFICATIONS
// =====================================================

// Event listener para background sync
self.addEventListener('sync', function(event) {
  console.log('🔄 Background sync triggered:', event.tag);
  
  if (event.tag === 'notification-sync') {
    event.waitUntil(syncNotifications());
  }
});

// Função para sincronizar notificações em background
async function syncNotifications() {
  try {
    console.log('📡 Syncing notifications in background...');
    
    const response = await fetch('/api/notifications/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Notifications synced:', data);
      
      // Se há novas notificações, mostrar uma notificação resumo
      if (data.newNotifications && data.newNotifications.length > 0) {
        const count = data.newNotifications.length;
        const title = count === 1 ? 'Nova notificação' : `${count} novas notificações`;
        const body = count === 1 
          ? data.newNotifications[0].message 
          : `Você tem ${count} novas notificações`;
        
        await self.registration.showNotification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          data: { url: '/' },
          tag: 'notification-sync-summary'
        });
      }
    }
  } catch (error) {
    console.error('❌ Error syncing notifications:', error);
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

// Função para verificar se o usuário está online
function isOnline() {
  return navigator.onLine;
}

// Função para obter todas as notificações ativas
async function getActiveNotifications() {
  try {
    const notifications = await self.registration.getNotifications();
    return notifications;
  } catch (error) {
    console.error('❌ Error getting active notifications:', error);
    return [];
  }
}

// Função para limpar notificações antigas
async function cleanupOldNotifications() {
  try {
    const notifications = await getActiveNotifications();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    
    for (const notification of notifications) {
      const notificationTime = notification.data?.timestamp || 0;
      if (now - notificationTime > maxAge) {
        notification.close();
        console.log('🧹 Closed old notification:', notification.title);
      }
    }
  } catch (error) {
    console.error('❌ Error cleaning up notifications:', error);
  }
}

// Limpar notificações antigas a cada hora
setInterval(cleanupOldNotifications, 60 * 60 * 1000);

// =====================================================
// DEBUGGING AND LOGGING
// =====================================================

// Log quando o service worker é instalado
self.addEventListener('install', function(event) {
  console.log('🔧 Custom SW installed');
  self.skipWaiting();
});

// Log quando o service worker é ativado
self.addEventListener('activate', function(event) {
  console.log('✅ Custom SW activated');
  event.waitUntil(self.clients.claim());
});

// Log para debugging
console.log('🚀 Custom Service Worker for Push Notifications loaded');
