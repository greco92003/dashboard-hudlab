// =====================================================
// SCRIPT DE DEBUG PARA PUSH NOTIFICATIONS
// =====================================================
// Execute este script no console do navegador para diagnosticar problemas

async function debugPushNotifications() {
  console.log("🔍 Iniciando diagnóstico de Push Notifications...");

  // 1. Verificar suporte
  console.log("\n1️⃣ Verificando suporte...");
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasPushManager = "PushManager" in window;
  const hasNotification = "Notification" in window;

  console.log("Service Worker:", hasServiceWorker ? "✅" : "❌");
  console.log("Push Manager:", hasPushManager ? "✅" : "❌");
  console.log("Notifications:", hasNotification ? "✅" : "❌");

  if (!hasServiceWorker || !hasPushManager || !hasNotification) {
    console.error("❌ Push notifications não são suportadas neste navegador");
    return;
  }

  // 2. Verificar permissões
  console.log("\n2️⃣ Verificando permissões...");
  console.log("Permissão atual:", Notification.permission);

  if (Notification.permission === "denied") {
    console.error(
      "❌ Permissões negadas. Você precisa habilitar manualmente nas configurações do navegador."
    );
    return;
  }

  // 3. Verificar service workers registrados
  console.log("\n3️⃣ Verificando service workers...");
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log("Service Workers registrados:", registrations.length);

    for (let i = 0; i < registrations.length; i++) {
      const reg = registrations[i];
      console.log(`SW ${i + 1}:`, reg.scope);
      console.log(`  - Active:`, !!reg.active);
      console.log(`  - Installing:`, !!reg.installing);
      console.log(`  - Waiting:`, !!reg.waiting);
    }
  } catch (error) {
    console.error("❌ Erro ao verificar service workers:", error);
  }

  // 4. Registrar service worker customizado
  console.log("\n4️⃣ Registrando service worker customizado...");
  try {
    const registration = await navigator.serviceWorker.register(
      "/sw-custom.js"
    );
    console.log("✅ Service worker registrado:", registration.scope);

    await navigator.serviceWorker.ready;
    console.log("✅ Service worker pronto");
  } catch (error) {
    console.error("❌ Erro ao registrar service worker:", error);
    return;
  }

  // 5. Solicitar permissão se necessário
  console.log("\n5️⃣ Solicitando permissão...");
  try {
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      console.log("Nova permissão:", permission);

      if (permission !== "granted") {
        console.error("❌ Permissão negada pelo usuário");
        return;
      }
    }
  } catch (error) {
    console.error("❌ Erro ao solicitar permissão:", error);
    return;
  }

  // 6. Criar subscription
  console.log("\n6️⃣ Criando push subscription...");
  try {
    const registration = await navigator.serviceWorker.ready;

    // Verificar subscription existente
    const existingSubscription =
      await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log("📱 Subscription existente encontrada");
      console.log(
        "Endpoint:",
        existingSubscription.endpoint.substring(0, 50) + "..."
      );

      // Cancelar subscription existente
      await existingSubscription.unsubscribe();
      console.log("🗑️ Subscription existente cancelada");
    }

    // VAPID key (deve ser a mesma do .env.local)
    const vapidPublicKey =
      "BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI";

    // Converter VAPID key
    function urlBase64ToUint8Array(base64String) {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);

      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    // Criar nova subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    console.log("✅ Nova subscription criada!");
    console.log("Endpoint:", subscription.endpoint.substring(0, 50) + "...");

    const subscriptionData = subscription.toJSON();
    console.log("📋 Dados da subscription:", {
      endpoint: subscriptionData.endpoint.substring(0, 50) + "...",
      p256dh: subscriptionData.keys.p256dh.substring(0, 20) + "...",
      auth: subscriptionData.keys.auth.substring(0, 10) + "...",
    });

    // 7. Salvar no banco de dados
    console.log("\n7️⃣ Salvando subscription no banco...");
    try {
      const response = await fetch("/api/notifications/register-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
          userAgent: navigator.userAgent,
          deviceType: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent)
            ? "mobile"
            : "desktop",
          browserName: navigator.userAgent.includes("Chrome")
            ? "chrome"
            : "other",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Subscription salva no banco:", result);
      } else {
        const error = await response.text();
        console.error("❌ Erro ao salvar subscription:", error);
      }
    } catch (error) {
      console.error("❌ Erro na requisição para salvar subscription:", error);
    }

    // 8. Testar notificação
    console.log("\n8️⃣ Testando notificação local...");
    try {
      const notification = new Notification("Teste de Push Notification", {
        body: "Se você está vendo isso, as notificações estão funcionando!",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-96x96.png",
      });

      notification.onclick = () => {
        console.log("🖱️ Notificação clicada!");
        notification.close();
      };

      console.log("✅ Notificação local enviada");
    } catch (error) {
      console.error("❌ Erro ao enviar notificação local:", error);
    }

    console.log("\n🎉 Diagnóstico concluído! Agora teste o curl novamente.");
  } catch (error) {
    console.error("❌ Erro ao criar subscription:", error);
    console.error("Detalhes:", error.message);
  }
}

// Executar diagnóstico
debugPushNotifications();
