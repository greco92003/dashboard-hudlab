"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";

// Chave pública VAPID (deve ser a mesma do backend)
// Para gerar: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI";

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  sendTestNotification: () => Promise<boolean>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");

  const { user } = useAuth();
  const supabase = createClient();

  // Verificar suporte a push notifications
  useEffect(() => {
    const checkSupport = () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      setIsSupported(supported);

      if (supported && "Notification" in window) {
        setPermission(Notification.permission);
      }

      setIsLoading(false);
    };

    checkSupport();
  }, []);

  // Verificar se já está subscrito
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isSupported || !user) return;

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          // Verificar se a subscription ainda é válida no servidor
          const { data } = await supabase
            .from("push_subscriptions")
            .select("id")
            .eq("user_id", user.id)
            .eq("endpoint", subscription.endpoint)
            .eq("is_active", true)
            .single();

          setIsSubscribed(!!data);
        } else {
          setIsSubscribed(false);
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
        setIsSubscribed(false);
      }
    };

    checkSubscription();
  }, [isSupported, user, supabase]);

  // Solicitar permissão para notificações
  const requestPermission =
    useCallback(async (): Promise<NotificationPermission> => {
      if (!isSupported) {
        throw new Error("Push notifications not supported");
      }

      try {
        const permission = await Notification.requestPermission();
        setPermission(permission);
        return permission;
      } catch (error) {
        console.error("Error requesting notification permission:", error);
        throw error;
      }
    }, [isSupported]);

  // Converter chave VAPID para Uint8Array
  const urlBase64ToUint8Array = useCallback((base64String: string) => {
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
  }, []);

  // Detectar tipo de dispositivo e browser
  const getDeviceInfo = useCallback(() => {
    const userAgent = navigator.userAgent;
    let deviceType = "desktop";
    let browserName = "unknown";

    // Detectar tipo de dispositivo
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent
      )
    ) {
      deviceType = /iPad/i.test(userAgent) ? "tablet" : "mobile";
    }

    // Detectar browser
    if (userAgent.includes("Chrome")) browserName = "chrome";
    else if (userAgent.includes("Firefox")) browserName = "firefox";
    else if (userAgent.includes("Safari")) browserName = "safari";
    else if (userAgent.includes("Edge")) browserName = "edge";

    return { deviceType, browserName, userAgent };
  }, []);

  // Subscrever para push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) {
      throw new Error(
        "Push notifications not supported or user not authenticated"
      );
    }

    try {
      setIsLoading(true);

      // Solicitar permissão se necessário
      if (permission !== "granted") {
        const newPermission = await requestPermission();
        if (newPermission !== "granted") {
          throw new Error("Permission denied");
        }
      }

      // Registrar service worker customizado
      const registration = await navigator.serviceWorker.register(
        "/sw-custom.js"
      );
      await navigator.serviceWorker.ready;

      // Criar subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subscriptionData = subscription.toJSON() as PushSubscription;
      const deviceInfo = getDeviceInfo();

      // Salvar subscription no banco de dados
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subscriptionData.endpoint,
          p256dh_key: subscriptionData.keys.p256dh,
          auth_key: subscriptionData.keys.auth,
          user_agent: deviceInfo.userAgent,
          device_type: deviceInfo.deviceType,
          browser_name: deviceInfo.browserName,
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        }
      );

      if (error) {
        throw error;
      }

      setIsSubscribed(true);
      console.log("✅ Push notification subscription successful");
      return true;
    } catch (error) {
      console.error("❌ Error subscribing to push notifications:", error);
      setIsSubscribed(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [
    isSupported,
    user,
    permission,
    requestPermission,
    urlBase64ToUint8Array,
    getDeviceInfo,
    supabase,
  ]);

  // Cancelar subscription
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) {
      throw new Error(
        "Push notifications not supported or user not authenticated"
      );
    }

    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Cancelar subscription no browser
        await subscription.unsubscribe();

        // Desativar subscription no banco de dados
        const { error } = await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint);

        if (error) {
          console.warn(
            "Warning: Failed to update subscription in database:",
            error
          );
        }
      }

      setIsSubscribed(false);
      console.log("✅ Push notification unsubscription successful");
      return true;
    } catch (error) {
      console.error("❌ Error unsubscribing from push notifications:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, supabase]);

  // Enviar notificação de teste
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      console.log("🧪 Sending test notification...");

      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          title: "Teste de Notificação",
          message: "Esta é uma notificação de teste do HudLab Dashboard!",
          type: "info",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("❌ Test notification failed:", result);
        throw new Error(
          result.error || `HTTP error! status: ${response.status}`
        );
      }

      console.log("✅ Test notification sent successfully:", result);
      return true;
    } catch (error) {
      console.error("❌ Error sending test notification:", error);
      throw error;
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    requestPermission,
    sendTestNotification,
  };
}
