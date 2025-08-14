"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import type { Database } from "@/types/supabase";

// Tipo personalizado para notificações
type Notification = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "sale";
  data: any;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  target_type: "role" | "user" | "brand_partners";
  target_roles: string[] | null;
  target_user_ids: string[] | null;
  target_brand: string | null;
  status: "draft" | "sent" | "failed";
  sent_at: string | null;
  send_push: boolean;
  push_sent_count: number;
  push_failed_count: number;
  created_at: string;
  updated_at: string;
};

// Tipo personalizado para user_notifications
type UserNotification = {
  id: string;
  notification_id: string;
  user_id: string;
  is_read: boolean;
  read_at: string | null;
  push_sent: boolean | null;
  push_sent_at: string | null;
  push_error: string | null;
  created_at: string;
  updated_at: string;
  notification: Notification;
};

interface UseNotificationsReturn {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const supabase = createClient();

  // Buscar notificações do usuário
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Buscar notificações do usuário com dados da notificação
      const { data, error: fetchError } = await supabase
        .from("user_notifications")
        .select(
          `
          *,
          notification:notifications(*)
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      const userNotifications = (data || []) as UserNotification[];

      // Filter out notifications where the notification data is missing
      const validNotifications = userNotifications.filter(
        (userNotification) => userNotification.notification !== null
      );

      setNotifications(validNotifications);

      // Contar notificações não lidas
      const unread = validNotifications.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar notificações"
      );
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  // Marcar notificação como lida
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;

      try {
        const { error } = await supabase.rpc("mark_notification_as_read", {
          p_notification_id: notificationId,
          p_user_id: user.id,
        });

        if (error) {
          throw error;
        }

        // Atualizar estado local
        setNotifications((prev) =>
          prev.map((n) =>
            n.notification_id === notificationId
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n
          )
        );

        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Error marking notification as read:", err);
        throw err;
      }
    },
    [user, supabase]
  );

  // Marcar todas as notificações como lidas
  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc("mark_all_notifications_as_read", {
        p_user_id: user.id,
      });

      if (error) {
        throw error;
      }

      // Atualizar estado local
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
          read_at: n.read_at || now,
        }))
      );

      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
      throw err;
    }
  }, [user, supabase]);

  // Deletar notificação (apenas remove da visualização do usuário)
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("user_notifications")
          .delete()
          .eq("notification_id", notificationId)
          .eq("user_id", user.id)
          .select();

        if (error) {
          throw error;
        }

        // Atualizar estado local
        setNotifications((prev) => {
          const filtered = prev.filter(
            (n) => n.notification_id !== notificationId
          );

          const wasUnread = prev.find(
            (n) => n.notification_id === notificationId && !n.is_read
          );

          if (wasUnread) {
            setUnreadCount((count) => Math.max(0, count - 1));
          }

          return filtered;
        });
      } catch (err) {
        console.error("Error deleting notification:", err);
        throw err;
      }
    },
    [user, supabase]
  );

  // Refresh manual das notificações
  const refreshNotifications = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  // Buscar notificações quando o usuário muda
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Configurar real-time subscription para novas notificações
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("user_notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log("🔔 New notification received:", payload);

          // Buscar dados completos da notificação
          const { data: notificationData } = await supabase
            .from("user_notifications")
            .select(
              `
              *,
              notification:notifications(*)
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (notificationData && notificationData.notification) {
            const newNotification = notificationData as UserNotification;

            setNotifications((prev) => [newNotification, ...prev]);

            if (!newNotification.is_read) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("📝 Notification updated:", payload);

          setNotifications((prev) =>
            prev.map((n) =>
              n.id === payload.new.id ? { ...n, ...payload.new } : n
            )
          );

          // Atualizar contador se mudou o status de leitura
          if (payload.old.is_read !== payload.new.is_read) {
            setUnreadCount((prev) =>
              payload.new.is_read ? Math.max(0, prev - 1) : prev + 1
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => {
            const filtered = prev.filter((n) => n.id !== payload.old.id);

            // Atualizar contador se a notificação deletada não estava lida
            if (!payload.old.is_read) {
              setUnreadCount((count) => Math.max(0, count - 1));
            }

            return filtered;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  // Verificar notificação específica via URL (para marcar como lida quando clicada)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const notificationId = urlParams.get("notification");

    if (notificationId && user) {
      markAsRead(notificationId).catch(console.error);

      // Limpar o parâmetro da URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("notification");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [user, markAsRead]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };
}
