// Teste manual de push pelo endpoint autenticado da aplicacao.
// Nenhuma credencial Supabase deve ser embutida em arquivos de public/.

async function simplePushTest() {
  console.log('Iniciando teste simples de push notifications...');

  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications nao sao suportadas neste navegador.');
    }

    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      throw new Error('Permissao para notificacoes nao foi concedida.');
    }

    const registration = await navigator.serviceWorker.register('/sw-custom.js');
    await navigator.serviceWorker.ready;

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }

    const vapidPublicKey =
      'BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI';
    const urlBase64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
    };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const subscriptionData = subscription.toJSON();

    const response = await fetch('/api/notifications/register-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys?.p256dh,
        auth: subscriptionData.keys?.auth,
        userAgent: navigator.userAgent,
        deviceType: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent)
          ? 'mobile'
          : 'desktop',
        browserName: navigator.userAgent.includes('Chrome') ? 'chrome' : 'other',
      }),
    });

    if (!response.ok) {
      throw new Error(`Falha ao registrar push: ${response.status}`);
    }

    console.log('Subscription salva pelo endpoint da aplicacao.');
    new Notification('Teste Push Notification', {
      body: 'Se voce ve isso, as notificacoes estao funcionando.',
      icon: '/icons/icon-192x192.png',
    });
  } catch (error) {
    console.error('Erro durante o teste de push:', error);
  }
}

simplePushTest();
