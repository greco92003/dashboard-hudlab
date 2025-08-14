"use client";

import React, { useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  DollarSign,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotificationCenterProps {
  className?: string;
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  } = useNotifications();

  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    subscribe: subscribeToPush,
    permission: pushPermission,
  } = usePushNotifications();

  // Ícones por tipo de notificação
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "sale":
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  // Cores por tipo de notificação
  const getNotificationColor = (type: string) => {
    switch (type) {
      case "sale":
        return "border-l-green-500 bg-green-50 dark:bg-green-950/20";
      case "success":
        return "border-l-green-500 bg-green-50 dark:bg-green-950/20";
      case "warning":
        return "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20";
      case "error":
        return "border-l-red-500 bg-red-50 dark:bg-red-950/20";
      default:
        return "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20";
    }
  };

  // Formatar valor de comissão para notificações de venda
  const formatCommissionValue = (data: any) => {
    if (data?.commissionValue) {
      return `R$ ${data.commissionValue.toFixed(2)}`;
    }
    return null;
  };

  // Marcar notificação como lida
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsRead(notificationId);
    } catch (error) {
      toast.error("Erro ao marcar notificação como lida");
    }
  };

  // Marcar todas como lidas
  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      toast.success("Todas as notificações foram marcadas como lidas");
    } catch (error) {
      toast.error("Erro ao marcar todas as notificações como lidas");
    }
  };

  // Deletar notificação
  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      toast.success("Notificação removida");
    } catch (error) {
      toast.error("Erro ao remover notificação");
    }
  };

  // Habilitar push notifications
  const handleEnablePush = async () => {
    try {
      await subscribeToPush();
      toast.success("Push notifications habilitadas!");
    } catch (error) {
      toast.error("Erro ao habilitar push notifications");
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("relative", className)}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0"
        sideOffset={8}
      >
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="h-8 px-2 text-xs"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Marcar todas
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Push Notifications Status */}
          {pushSupported && pushPermission !== "granted" && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Habilite as notificações push para receber alertas no mobile
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEnablePush}
                  className="ml-2 h-7 text-xs"
                >
                  Habilitar
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <ScrollArea className="h-96">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Carregando notificações...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma notificação
              </p>
            </div>
          ) : (
            <div className="p-2">
              {notifications.map((userNotification) => {
                const notification = userNotification.notification;

                // Skip notifications where the notification data is missing
                if (!notification) {
                  return null;
                }

                const isUnread = !userNotification.is_read;
                const commissionValue = formatCommissionValue(
                  notification.data
                );

                return (
                  <div
                    key={userNotification.id}
                    className={cn(
                      "mb-2 p-3 rounded-lg border-l-4 transition-colors",
                      getNotificationColor(notification.type),
                      isUnread && "ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={cn(
                              "text-sm font-medium leading-tight",
                              isUnread && "font-semibold"
                            )}
                          >
                            {notification.title}
                          </h4>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isUnread && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleMarkAsRead(notification.id)
                                }
                                className="h-6 w-6 p-0"
                                title="Marcar como lida"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDeleteNotification(notification.id)
                              }
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              title="Remover notificação"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {notification.message}
                        </p>

                        {/* Informações extras para notificações de venda */}
                        {notification.type === "sale" && commissionValue && (
                          <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/20 rounded text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-green-700 dark:text-green-300">
                                Sua comissão:
                              </span>
                              <span className="font-semibold text-green-800 dark:text-green-200">
                                {commissionValue}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(userNotification.created_at),
                              {
                                addSuffix: true,
                                locale: ptBR,
                              }
                            )}
                          </span>

                          {isUnread && (
                            <Badge
                              variant="secondary"
                              className="h-4 text-xs px-1"
                            >
                              Nova
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshNotifications}
                className="w-full text-xs"
              >
                Atualizar notificações
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
