// =====================================================
// PÁGINA DE ADMINISTRAÇÃO DE WEBHOOKS
// =====================================================
// Interface para gerenciar webhooks do Nuvemshop

"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Activity,
  Zap,
  Shield,
  BarChart3,
} from "lucide-react";
import { useWebhookManager } from "@/hooks/useWebhookManager";
import { NuvemshopWebhookEvent, ALL_WEBHOOK_EVENTS } from "@/types/webhooks";
import { toast } from "sonner";

export default function WebhooksAdminPage() {
  const {
    webhooks,
    logs,
    stats,
    loading,
    error,
    registerWebhook,
    deleteWebhook,
    syncWebhooks,
    setupEssentialWebhooks,
    checkWebhookHealth,
    listLogs,
    retryWebhook,
    retryFailedWebhooks,
    markWebhookIgnored,
    refreshData,
    clearError,
  } = useWebhookManager();

  const [newWebhookEvent, setNewWebhookEvent] =
    useState<NuvemshopWebhookEvent>("order/created");
  const [newWebhookDescription, setNewWebhookDescription] = useState("");
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  // Registrar novo webhook
  const handleRegisterWebhook = async () => {
    const success = await registerWebhook(
      newWebhookEvent,
      newWebhookDescription
    );
    if (success) {
      setIsRegisterDialogOpen(false);
      setNewWebhookDescription("");
    }
  };

  // Verificar saúde dos webhooks
  const handleHealthCheck = async () => {
    try {
      const health = await checkWebhookHealth();
      setHealthData(health);
      toast.success("Verificação de saúde concluída");
    } catch (error) {
      toast.error("Falha na verificação de saúde");
    }
  };

  // Obter status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Ativo
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Inativo
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Obter status badge para logs
  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case "processed":
        return (
          <Badge variant="default" className="bg-green-500">
            Processado
          </Badge>
        );
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      case "processing":
        return (
          <Badge variant="default" className="bg-blue-500">
            Processando
          </Badge>
        );
      case "ignored":
        return <Badge variant="secondary">Ignorado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Administração de Webhooks</h1>
          <p className="text-muted-foreground">
            Gerencie webhooks do Nuvemshop para sincronização em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshData} disabled={loading}>
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button onClick={handleHealthCheck} variant="outline">
            <Activity className="w-4 h-4 mr-2" />
            Verificar Saúde
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex justify-between items-center">
            {error}
            <Button variant="outline" size="sm" onClick={clearError}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Health Status */}
      {healthData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Status de Saúde dos Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {healthData.total}
                </div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {healthData.active}
                </div>
                <div className="text-sm text-muted-foreground">Ativos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {healthData.inactive}
                </div>
                <div className="text-sm text-muted-foreground">Inativos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {healthData.errors}
                </div>
                <div className="text-sm text-muted-foreground">Erros</div>
              </div>
            </div>
            {healthData.last_received && (
              <div className="mt-4 text-sm text-muted-foreground">
                Último webhook recebido:{" "}
                {new Date(healthData.last_received).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2" />
              Configuração Rápida
            </CardTitle>
            <CardDescription>
              Configure webhooks essenciais automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={setupEssentialWebhooks}
              disabled={loading}
              className="w-full"
            >
              Configurar Webhooks Essenciais
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <RefreshCw className="w-5 h-5 mr-2" />
              Sincronização
            </CardTitle>
            <CardDescription>
              Sincronizar webhooks com o Nuvemshop
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={syncWebhooks}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              Sincronizar Webhooks
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              Novo Webhook
            </CardTitle>
            <CardDescription>
              Registrar webhook para evento específico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog
              open={isRegisterDialogOpen}
              onOpenChange={setIsRegisterDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="w-full">Registrar Webhook</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Novo Webhook</DialogTitle>
                  <DialogDescription>
                    Selecione o evento e adicione uma descrição opcional
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="event">Evento</Label>
                    <Select
                      value={newWebhookEvent}
                      onValueChange={(value) =>
                        setNewWebhookEvent(value as NuvemshopWebhookEvent)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_WEBHOOK_EVENTS.map((event) => (
                          <SelectItem key={event} value={event}>
                            {event}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="description">Descrição (opcional)</Label>
                    <Textarea
                      id="description"
                      value={newWebhookDescription}
                      onChange={(e) => setNewWebhookDescription(e.target.value)}
                      placeholder="Descrição do webhook..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsRegisterDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleRegisterWebhook} disabled={loading}>
                    Registrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks Registrados</TabsTrigger>
          <TabsTrigger value="logs">Logs de Webhooks</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
        </TabsList>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks Registrados</CardTitle>
              <CardDescription>
                Lista de todos os webhooks configurados no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum webhook registrado. Configure webhooks essenciais para
                  começar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Último Recebido</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-medium">
                          {webhook.event}
                        </TableCell>
                        <TableCell>{getStatusBadge(webhook.status)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {webhook.url}
                        </TableCell>
                        <TableCell>
                          {webhook.last_received_at
                            ? new Date(
                                webhook.last_received_at
                              ).toLocaleString()
                            : "Nunca"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              deleteWebhook(
                                webhook.webhook_id || webhook.id,
                                !webhook.webhook_id
                              )
                            }
                            disabled={loading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Logs de Webhooks</CardTitle>
                  <CardDescription>
                    Histórico de webhooks recebidos e processados
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryFailedWebhooks("product/updated", 5)}
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Produtos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryFailedWebhooks(undefined, 10)}
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Todos
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum log de webhook encontrado.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Recurso ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tempo de Processamento</TableHead>
                      <TableHead>Recebido em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 20).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.event}
                        </TableCell>
                        <TableCell>{log.resource_id}</TableCell>
                        <TableCell>{getLogStatusBadge(log.status)}</TableCell>
                        <TableCell>
                          {log.processing_duration_ms
                            ? `${log.processing_duration_ms}ms`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(log.received_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {log.status === "failed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryWebhook(log.id)}
                            >
                              Tentar Novamente
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                Estatísticas de Webhooks
              </CardTitle>
              <CardDescription>
                Métricas de performance dos últimos 7 dias
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma estatística disponível.
                </div>
              ) : (
                <div className="space-y-4">
                  {stats.map((stat) => (
                    <div
                      key={`${stat.date}-${stat.event}`}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">{stat.event}</h4>
                        <span className="text-sm text-muted-foreground">
                          {stat.date}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-blue-600">
                            {stat.total_received}
                          </div>
                          <div className="text-muted-foreground">Recebidos</div>
                        </div>
                        <div>
                          <div className="font-medium text-green-600">
                            {stat.total_processed}
                          </div>
                          <div className="text-muted-foreground">
                            Processados
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-red-600">
                            {stat.total_failed}
                          </div>
                          <div className="text-muted-foreground">Falharam</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-600">
                            {stat.avg_processing_time_ms
                              ? `${Math.round(stat.avg_processing_time_ms)}ms`
                              : "-"}
                          </div>
                          <div className="text-muted-foreground">
                            Tempo Médio
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
