// =====================================================
// TIPOS PARA SISTEMA DE WEBHOOKS NUVEMSHOP
// =====================================================

// Eventos disponíveis para webhooks do Nuvemshop
export type NuvemshopWebhookEvent =
  // Order events
  | "order/created"
  | "order/updated"
  | "order/paid"
  | "order/packed"
  | "order/fulfilled"
  | "order/cancelled"
  | "order/custom_fields_updated"
  | "order/edited"
  | "order/pending"
  | "order/voided"
  // Product events
  | "product/created"
  | "product/updated"
  | "product/deleted"
  | "product_variant/custom_fields_updated"
  // Coupon events
  | "coupon/created"
  | "coupon/updated"
  | "coupon/deleted"
  // Category events
  | "category/created"
  | "category/updated"
  | "category/deleted"
  // App events
  | "app/uninstalled"
  | "app/suspended"
  | "app/resumed"
  // Domain events
  | "domain/updated"
  // Custom field events
  | "order_custom_field/created"
  | "order_custom_field/updated"
  | "order_custom_field/deleted"
  | "product_variant_custom_field/created"
  | "product_variant_custom_field/updated"
  | "product_variant_custom_field/deleted"
  // Subscription events
  | "subscription/updated"
  // Fulfillment events
  | "fulfillment/updated"
  // LGPD compliance events
  | "store/redact"
  | "customers/redact"
  | "customers/data_request";

// Status do webhook
export type WebhookStatus = "active" | "inactive" | "error";

// Status do processamento do webhook
export type WebhookLogStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "ignored";

// Interface para webhook registrado
export interface NuvemshopWebhook {
  id: string;
  webhook_id?: string | null; // ID retornado pelo Nuvemshop
  event: NuvemshopWebhookEvent;
  url: string;
  status: WebhookStatus;
  is_registered: boolean;
  description?: string | null;
  created_by?: string | null;
  last_error?: string | null;
  error_count: number;
  last_error_at?: string | null;
  created_at: string;
  updated_at: string;
  registered_at?: string | null;
  last_received_at?: string | null;
}

// Interface para log de webhook
export interface NuvemshopWebhookLog {
  id: string;
  event: NuvemshopWebhookEvent;
  webhook_id?: string | null;
  store_id: string;
  resource_id: string;
  status: WebhookLogStatus;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  processing_duration_ms?: number | null;
  headers?: Record<string, any> | null;
  payload: Record<string, any>;
  hmac_signature?: string | null;
  hmac_verified: boolean;
  result_data?: Record<string, any> | null;
  error_message?: string | null;
  error_details?: Record<string, any> | null;
  retry_count: number;
  received_at: string;
  created_at: string;
}

// Interface para estatísticas de webhook
export interface NuvemshopWebhookStats {
  id: string;
  date: string;
  event: NuvemshopWebhookEvent;
  total_received: number;
  total_processed: number;
  total_failed: number;
  total_ignored: number;
  avg_processing_time_ms?: number | null;
  min_processing_time_ms?: number | null;
  max_processing_time_ms?: number | null;
  created_at: string;
  updated_at: string;
}

// Payload base do webhook do Nuvemshop
export interface NuvemshopWebhookPayload {
  store_id: number;
  event: NuvemshopWebhookEvent;
  id?: number; // ID do recurso (order, product, etc.)
  [key: string]: any; // Campos adicionais específicos do evento
}

// Payload específico para eventos de order
export interface OrderWebhookPayload extends NuvemshopWebhookPayload {
  event:
    | "order/created"
    | "order/updated"
    | "order/paid"
    | "order/packed"
    | "order/fulfilled"
    | "order/cancelled"
    | "order/custom_fields_updated"
    | "order/edited"
    | "order/pending"
    | "order/voided";
  id: number; // Order ID
}

// Payload específico para eventos de product
export interface ProductWebhookPayload extends NuvemshopWebhookPayload {
  event: "product/created" | "product/updated" | "product/deleted";
  id: number; // Product ID
}

// Payload específico para eventos de category
export interface CategoryWebhookPayload extends NuvemshopWebhookPayload {
  event: "category/created" | "category/updated" | "category/deleted";
  id: number; // Category ID
}

// Payload específico para eventos de app
export interface AppWebhookPayload extends NuvemshopWebhookPayload {
  event: "app/uninstalled" | "app/suspended" | "app/resumed";
  id: number; // App ID
}

// Payload específico para eventos LGPD
export interface LGPDWebhookPayload extends NuvemshopWebhookPayload {
  event: "store/redact" | "customers/redact" | "customers/data_request";
  customer?: {
    id: number;
    email: string;
    phone?: string;
    identification?: string;
  };
  orders_to_redact?: number[];
  orders_requested?: number[];
  checkouts_requested?: number[];
  drafts_orders_requested?: number[];
  data_request?: {
    id: number;
  };
}

// Interface para resposta da API do Nuvemshop ao registrar webhook
export interface NuvemshopWebhookResponse {
  id: number;
  url: string;
  event: string;
  created_at: string;
  updated_at: string;
}

// Interface para criar um novo webhook
export interface CreateWebhookRequest {
  event: NuvemshopWebhookEvent;
  url: string;
  description?: string;
}

// Interface para atualizar um webhook
export interface UpdateWebhookRequest {
  event?: NuvemshopWebhookEvent;
  url?: string;
  status?: WebhookStatus;
  description?: string;
}

// Interface para filtros de busca de webhooks
export interface WebhookFilters {
  event?: NuvemshopWebhookEvent;
  status?: WebhookStatus;
  is_registered?: boolean;
  created_by?: string;
  date_from?: string;
  date_to?: string;
}

// Interface para filtros de logs de webhook
export interface WebhookLogFilters {
  event?: NuvemshopWebhookEvent;
  status?: WebhookLogStatus;
  store_id?: string;
  resource_id?: string;
  webhook_id?: string;
  date_from?: string;
  date_to?: string;
  hmac_verified?: boolean;
}

// Interface para estatísticas agregadas
export interface WebhookStatsAggregated {
  total_webhooks: number;
  active_webhooks: number;
  total_logs_today: number;
  success_rate_today: number;
  avg_processing_time_today: number;
  events_by_type: Record<NuvemshopWebhookEvent, number>;
  recent_errors: Array<{
    event: NuvemshopWebhookEvent;
    error_message: string;
    occurred_at: string;
  }>;
}

// Interface para configuração de webhook
export interface WebhookConfig {
  base_url: string; // URL base da aplicação
  secret_key: string; // Chave secreta para HMAC
  timeout_ms: number; // Timeout para processamento
  retry_attempts: number; // Tentativas de retry
  events_enabled: NuvemshopWebhookEvent[]; // Eventos habilitados
}

// Interface para resultado de processamento
export interface WebhookProcessingResult {
  success: boolean;
  processed_data?: any;
  error_message?: string;
  processing_time_ms: number;
  should_retry: boolean;
}

// Constantes para eventos
export const ORDER_EVENTS: NuvemshopWebhookEvent[] = [
  "order/created",
  "order/updated",
  "order/paid",
  "order/packed",
  "order/fulfilled",
  "order/cancelled",
  "order/custom_fields_updated",
  "order/edited",
  "order/pending",
  "order/voided",
];

export const PRODUCT_EVENTS: NuvemshopWebhookEvent[] = [
  "product/created",
  "product/updated",
  "product/deleted",
  "product_variant/custom_fields_updated",
];

export const COUPON_EVENTS: NuvemshopWebhookEvent[] = [
  "coupon/created",
  "coupon/updated",
  "coupon/deleted",
];

export const CATEGORY_EVENTS: NuvemshopWebhookEvent[] = [
  "category/created",
  "category/updated",
  "category/deleted",
];

export const APP_EVENTS: NuvemshopWebhookEvent[] = [
  "app/uninstalled",
  "app/suspended",
  "app/resumed",
];

export const LGPD_EVENTS: NuvemshopWebhookEvent[] = [
  "store/redact",
  "customers/redact",
  "customers/data_request",
];

// Todos os eventos disponíveis
export const ALL_WEBHOOK_EVENTS: NuvemshopWebhookEvent[] = [
  ...ORDER_EVENTS,
  ...PRODUCT_EVENTS,
  ...COUPON_EVENTS,
  ...CATEGORY_EVENTS,
  ...APP_EVENTS,
  ...LGPD_EVENTS,
  "domain/updated",
  "order_custom_field/created",
  "order_custom_field/updated",
  "order_custom_field/deleted",
  "product_variant_custom_field/created",
  "product_variant_custom_field/updated",
  "product_variant_custom_field/deleted",
  "subscription/updated",
  "fulfillment/updated",
];
