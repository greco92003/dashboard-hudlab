// =====================================================
// TESTE SIMPLES DE PUSH NOTIFICATIONS
// =====================================================

async function simplePushTest() {
  console.log('🧪 Iniciando teste simples de push notifications...');
  
  try {
    // 1. Verificar se está logado
    console.log('\n1️⃣ Verificando autenticação...');
    
    // Verificar se há token de sessão
    const cookies = document.cookie;
    const hasAuthCookie = cookies.includes('supabase-auth-token') || cookies.includes('sb-');
    console.log('Auth cookie presente:', hasAuthCookie ? '✅' : '❌');
    
    // 2. Verificar permissões
    console.log('\n2️⃣ Verificando permissões...');
    console.log('Permissão atual:', Notification.permission);
    
    if (Notification.permission !== 'granted') {
      console.log('Solicitando permissão...');
      const permission = await Notification.requestPermission();
      console.log('Nova permissão:', permission);
      
      if (permission !== 'granted') {
        console.error('❌ Permissão negada');
        return;
      }
    }
    
    // 3. Registrar service worker
    console.log('\n3️⃣ Registrando service worker...');
    const registration = await navigator.serviceWorker.register('/sw-custom.js');
    console.log('✅ Service worker registrado');
    
    await navigator.serviceWorker.ready;
    console.log('✅ Service worker pronto');
    
    // 4. Criar subscription
    console.log('\n4️⃣ Criando subscription...');
    
    // Cancelar subscription existente
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
      console.log('🗑️ Subscription existente cancelada');
    }
    
    // VAPID key
    const vapidPublicKey = 'BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI';
    
    // Converter VAPID key
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }
    
    // Criar subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
    
    console.log('✅ Subscription criada!');
    
    const subscriptionData = subscription.toJSON();
    console.log('📋 Dados da subscription:', {
      endpoint: subscriptionData.endpoint.substring(0, 50) + '...',
      p256dh: subscriptionData.keys.p256dh.substring(0, 20) + '...',
      auth: subscriptionData.keys.auth.substring(0, 10) + '...'
    });
    
    // 5. Salvar usando fetch direto (método 1)
    console.log('\n5️⃣ Tentando salvar via API endpoint...');
    try {
      const response = await fetch('/api/notifications/register-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
          userAgent: navigator.userAgent,
          deviceType: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
          browserName: navigator.userAgent.includes('Chrome') ? 'chrome' : 'other'
        })
      });
      
      const responseText = await response.text();
      console.log('Response status:', response.status);
      console.log('Response text:', responseText);
      
      if (response.ok) {
        console.log('✅ Subscription salva via API endpoint!');
      } else {
        console.error('❌ Erro ao salvar via API endpoint:', responseText);
      }
    } catch (error) {
      console.error('❌ Erro na requisição para API endpoint:', error);
    }
    
    // 6. Salvar usando Supabase client direto (método 2)
    console.log('\n6️⃣ Tentando salvar via Supabase client...');
    try {
      // Importar Supabase client
      const { createClient } = await import('/node_modules/@supabase/supabase-js/dist/module/index.js');
      
      const supabaseUrl = 'https://ubqervuhvwnztxmsodlg.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVicWVydnVodnduenR4bXNvZGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxNjQ3NzIsImV4cCI6MjA2NTc0MDc3Mn0.eaWmqG2IoBIE6X9piPVZCpYMI3x3saG--cGXIpsv00Q';
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Verificar usuário atual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('Usuário atual:', user ? user.email : 'Não logado');
      
      if (userError) {
        console.error('❌ Erro ao obter usuário:', userError);
        return;
      }
      
      if (!user) {
        console.error('❌ Usuário não está logado');
        return;
      }
      
      // Tentar inserir subscription
      const { data, error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscriptionData.endpoint,
          p256dh_key: subscriptionData.keys.p256dh,
          auth_key: subscriptionData.keys.auth,
          user_agent: navigator.userAgent,
          device_type: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
          browser_name: navigator.userAgent.includes('Chrome') ? 'chrome' : 'other',
          is_active: true,
          last_used_at: new Date().toISOString(),
        }, {
          onConflict: 'endpoint'
        })
        .select();
      
      if (error) {
        console.error('❌ Erro ao salvar via Supabase:', error);
      } else {
        console.log('✅ Subscription salva via Supabase!', data);
      }
      
    } catch (error) {
      console.error('❌ Erro ao usar Supabase client:', error);
    }
    
    // 7. Testar notificação local
    console.log('\n7️⃣ Testando notificação local...');
    const notification = new Notification('Teste Push Notification', {
      body: 'Se você vê isso, as notificações estão funcionando!',
      icon: '/icons/icon-192x192.png'
    });
    
    notification.onclick = () => {
      console.log('🖱️ Notificação clicada!');
      notification.close();
    };
    
    console.log('\n🎉 Teste concluído! Verifique se a subscription foi salva no banco.');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

// Executar teste
simplePushTest();
