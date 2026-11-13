"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { Bell, BellOff, TestTube, CheckCircle, XCircle } from "lucide-react";

export function PushNotificationTester() {
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [isTestingSale, setIsTestingSale] = useState(false);

  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();

  const handleSubscribe = async () => {
    try {
      await subscribe();
      toast.success("Push notifications habilitadas com sucesso!");
    } catch (error) {
      console.error("Erro ao habilitar push notifications:", error);
      toast.error("Erro ao habilitar push notifications");
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe();
      toast.success("Push notifications desabilitadas");
    } catch (error) {
      console.error("Erro ao desabilitar push notifications:", error);
      toast.error("Erro ao desabilitar push notifications");
    }
  };

  const handleTestNotification = async () => {
    setIsTestingPush(true);
    try {
      await sendTestNotification();
      toast.success("Notificação de teste enviada!");
    } catch (error) {
      console.error("Erro ao enviar notificação de teste:", error);
      toast.error("Erro ao enviar notificação de teste");
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleTestSaleNotification = async () => {
    setIsTestingSale(true);
    try {
      const response = await fetch("/api/notifications/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationId: "5832ae18-68ff-4b68-9585-2d3fd61af03a",
        }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.sent > 0) {
          toast.success(
            `Notificação de venda enviada! (${result.sent} enviadas)`
          );
        } else {
          toast.warning("Nenhuma subscription ativa encontrada");
        }
      } else {
        throw new Error(result.error || "Erro ao enviar notificação");
      }
    } catch (error) {
      console.error("Erro ao enviar notificação de venda:", error);
      toast.error("Erro ao enviar notificação de venda");
    } finally {
      setIsTestingSale(false);
    }
  };

  const getStatusBadge = () => {
    if (!isSupported) {
      return <Badge variant="destructive">Não Suportado</Badge>;
    }
    if (permission !== "granted") {
      return <Badge variant="secondary">Permissão Negada</Badge>;
    }
    if (isSubscribed) {
      return (
        <Badge variant="default" className="bg-green-500">
          Ativo
        </Badge>
      );
    }
    return <Badge variant="outline">Inativo</Badge>;
  };

  const getPermissionIcon = () => {
    if (permission === "granted" && isSubscribed) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (permission === "denied") {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <Bell className="h-4 w-4 tone-violet hud-tone-text" />;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getPermissionIcon()}
          Push Notifications Tester
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          {getStatusBadge()}
        </div>

        {/* Informações */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div>Suportado: {isSupported ? "✅" : "❌"}</div>
          <div>Permissão: {permission}</div>
          <div>Subscrito: {isSubscribed ? "✅" : "❌"}</div>
        </div>

        {/* Ações */}
        <div className="space-y-2">
          {!isSubscribed ? (
            <Button
              onClick={handleSubscribe}
              disabled={!isSupported || isLoading}
              className="w-full"
            >
              {isLoading ? (
                "Habilitando..."
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Habilitar Push Notifications
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleUnsubscribe}
              variant="outline"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                "Desabilitando..."
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Desabilitar Push Notifications
                </>
              )}
            </Button>
          )}

          {isSubscribed && (
            <>
              <Button
                onClick={handleTestNotification}
                disabled={isTestingPush}
                variant="secondary"
                className="w-full"
              >
                {isTestingPush ? (
                  "Enviando..."
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Teste Simples
                  </>
                )}
              </Button>

              <Button
                onClick={handleTestSaleNotification}
                disabled={isTestingSale}
                variant="default"
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isTestingSale ? "Enviando..." : <>💰 Teste Venda (R$ 38,22)</>}
              </Button>
            </>
          )}
        </div>

        {/* Instruções */}
        {!isSubscribed && isSupported && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 Clique em &quot;Habilitar&quot; e aceite as permissões do
              navegador para receber notificações push.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
