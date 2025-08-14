// =====================================================
// PROCESSADOR DE WEBHOOKS NUVEMSHOP
// =====================================================
// Processa diferentes tipos de eventos de webhook e sincroniza com o banco

import { createClient } from "@supabase/supabase-js";
import { fetchNuvemshopAPI } from "@/lib/nuvemshop/api";
import {
  NuvemshopWebhookEvent,
  OrderWebhookPayload,
  ProductWebhookPayload,
  WebhookProcessingResult,
  NuvemshopWebhookLog,
} from "@/types/webhooks";

// Cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configuração da API do Nuvemshop
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Classe principal para processar webhooks
export class NuvemshopWebhookProcessor {
  private accessToken: string;
  private userId: string;

  constructor() {
    this.accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN!;
    this.userId = process.env.NUVEMSHOP_USER_ID!;

    if (!this.accessToken || !this.userId) {
      throw new Error("Nuvemshop credentials not configured");
    }
  }

  // Fazer requisição autenticada para API do Nuvemshop usando a função melhorada
  private async fetchFromNuvemshop(
    endpoint: string,
    options?: RequestInit
  ): Promise<any> {
    console.log(`🌐 Making API request to: ${endpoint}`);

    // Usar a função melhorada com retry logic e timeout otimizado
    return fetchNuvemshopAPI(endpoint, options);
  }

  // Processar webhook baseado no evento
  async processWebhook(
    event: NuvemshopWebhookEvent,
    payload: any,
    logId: string
  ): Promise<WebhookProcessingResult> {
    const startTime = Date.now();
    let shouldRetry = false;

    try {
      console.log(`🔄 Processing webhook: ${event} for resource ${payload.id}`);

      let result: any = null;

      // Processar baseado no tipo de evento
      if (event.startsWith("order/")) {
        result = await this.processOrderEvent(
          event,
          payload as OrderWebhookPayload
        );
      } else if (event.startsWith("product/")) {
        result = await this.processProductEvent(
          event,
          payload as ProductWebhookPayload
        );
      } else {
        console.log(`ℹ️ Event ${event} not handled - ignoring`);
        result = { ignored: true, reason: "Event not handled" };
      }

      const processingTime = Date.now() - startTime;

      // Atualizar log com sucesso
      await this.updateWebhookLog(logId, {
        status: result?.ignored ? "ignored" : "processed",
        processing_completed_at: new Date().toISOString(),
        processing_duration_ms: processingTime,
        result_data: result,
      });

      console.log(`✅ Webhook processed successfully in ${processingTime}ms`);

      return {
        success: true,
        processed_data: result,
        processing_time_ms: processingTime,
        should_retry: false,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(`❌ Webhook processing failed:`, error);

      // Determinar se deve tentar novamente
      shouldRetry = this.shouldRetryError(error);

      // Atualizar log com erro
      await this.updateWebhookLog(logId, {
        status: "failed",
        processing_completed_at: new Date().toISOString(),
        processing_duration_ms: processingTime,
        error_message: errorMessage,
        error_details: {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: false,
        error_message: errorMessage,
        processing_time_ms: processingTime,
        should_retry: shouldRetry,
      };
    }
  }

  // Processar eventos de pedidos
  private async processOrderEvent(
    event: NuvemshopWebhookEvent,
    payload: OrderWebhookPayload
  ): Promise<any> {
    const orderId = payload.id.toString();

    console.log(`📦 Processing order event: ${event} for order ${orderId}`);

    // Buscar dados completos do pedido na API
    const orderData = await this.fetchFromNuvemshop(`/orders/${orderId}`);

    // Processar dados do pedido conforme estrutura existente
    const processedOrder = this.processOrderData(orderData);

    // Salvar/atualizar no banco
    const { data, error } = await supabase
      .from("nuvemshop_orders")
      .upsert(processedOrder, {
        onConflict: "order_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to save order: ${error.message}`);
    }

    console.log(`✅ Order ${orderId} processed and saved`);

    // Check if order contains coupon information and sync it
    if (orderData.coupon && orderData.coupon.trim() !== "") {
      try {
        await this.syncCouponFromOrder(orderData);
      } catch (error) {
        console.error(`⚠️ Failed to sync coupon from order ${orderId}:`, error);
        // Don't fail the order processing if coupon sync fails
      }
    }

    return {
      order_id: orderId,
      event,
      action: data && data.length > 0 ? "updated" : "created",
      processed_at: new Date().toISOString(),
    };
  }

  // Processar eventos de produtos
  private async processProductEvent(
    event: NuvemshopWebhookEvent,
    payload: ProductWebhookPayload
  ): Promise<any> {
    const productId = payload.id.toString();

    console.log(
      `🛍️ Processing product event: ${event} for product ${productId}`
    );

    if (event === "product/deleted") {
      // Excluir produto fisicamente do banco (conforme padrão do usuário)
      const { error } = await supabase
        .from("nuvemshop_products")
        .delete()
        .eq("product_id", productId);

      if (error) {
        console.error(`❌ Failed to delete product ${productId}:`, error);
        throw new Error(`Failed to delete product: ${error.message}`);
      }

      console.log(`🗑️ Product ${productId} physically deleted from database`);

      return {
        product_id: productId,
        event,
        action: "physically_deleted",
        processed_at: new Date().toISOString(),
      };
    }

    // Para created/updated, buscar dados completos
    console.log(
      `📡 Fetching product data from Nuvemshop API for product ${productId}`
    );

    let productData;
    try {
      // Add timeout protection for API calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      productData = await this.fetchFromNuvemshop(`/products/${productId}`);
      clearTimeout(timeoutId);
    } catch (error: any) {
      // Handle 404 errors - product might have been deleted
      if (error.message && error.message.includes("404")) {
        console.log(
          `⚠️ Product ${productId} not found (404), marking as deleted`
        );

        // Mark product as deleted in our database
        const { error: updateError } = await supabase
          .from("nuvemshop_products")
          .update({
            sync_status: "deleted",
            last_synced_at: new Date().toISOString(),
          })
          .eq("product_id", productId);

        if (updateError) {
          console.error(
            `Error marking product ${productId} as deleted:`,
            updateError
          );
        }

        return {
          product_id: productId,
          event,
          action: "marked_as_deleted_due_to_404",
          processed_at: new Date().toISOString(),
        };
      }

      // Handle timeout errors
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        console.error(`⏰ API timeout for product ${productId}`);
        throw new Error(
          `API timeout for product ${productId} - will retry later`
        );
      }

      // Re-throw other errors
      console.error(`❌ API error for product ${productId}:`, error);
      throw error;
    }

    console.log(`📦 Raw product data received:`, {
      id: productData.id,
      name: productData.name,
      featured_image: productData.featured_image,
      images_count: productData.images?.length || 0,
      published: productData.published,
    });

    // Processar dados do produto conforme estrutura existente
    const processedProduct = this.processProductData(productData);

    console.log(`🔄 Processed product data:`, {
      product_id: processedProduct.product_id,
      name_pt: processedProduct.name_pt,
      featured_image_src: processedProduct.featured_image_src,
      featured_image_id: processedProduct.featured_image_id,
      images_count: processedProduct.images?.length || 0,
      published: processedProduct.published,
    });

    // Usar advisory lock para evitar processamento simultâneo do mesmo produto
    const lockId = parseInt(productId) % 2147483647; // Converter para int32

    console.log(
      `🔒 Tentando obter lock para produto ${productId} (lock_id: ${lockId})`
    );

    const { data: lockResult, error: lockError } = await supabase.rpc(
      "pg_try_advisory_lock",
      {
        lock_id: lockId,
      }
    );

    if (lockError) {
      console.error(
        `❌ Erro ao obter lock para produto ${productId}:`,
        lockError
      );
      // Continue without lock in case of error
    } else if (!lockResult) {
      console.log(
        `⏳ Produto ${productId} já está sendo processado, aguardando...`
      );

      // For product/updated events, be more aggressive about processing
      if (event === "product/updated") {
        console.log(
          `⚡ Product update detected - processing without lock to avoid data loss`
        );
        // Continue without lock for updates to ensure data consistency
      } else {
        // For other events, wait a bit and try again
        await new Promise((resolve) => setTimeout(resolve, 500));

        const { data: retryLockResult, error: retryLockError } =
          await supabase.rpc("pg_try_advisory_lock", {
            lock_id: lockId,
          });

        if (retryLockError || !retryLockResult) {
          console.log(
            `⏳ Produto ${productId} ainda sendo processado após retry, processando sem lock...`
          );
          // Continue without lock to avoid losing the webhook
        }
      }
    }

    try {
      // Verificar se produto já existe para otimizar upsert
      const { data: existingProduct } = await supabase
        .from("nuvemshop_products")
        .select("id, api_updated_at, brand")
        .eq("product_id", productId)
        .single();

      // Se produto existe e não foi atualizado, apenas atualizar timestamp
      if (
        existingProduct &&
        existingProduct.api_updated_at === processedProduct.api_updated_at
      ) {
        console.log(
          `⚡ Product ${productId} unchanged, updating sync timestamp only`
        );

        const { error: updateError } = await supabase
          .from("nuvemshop_products")
          .update({
            last_synced_at: new Date().toISOString(),
            sync_status: "synced",
          })
          .eq("product_id", productId);

        if (updateError) {
          console.error(
            `❌ Database error updating sync timestamp for product ${productId}:`,
            updateError
          );
          throw new Error(
            `Failed to update product sync timestamp: ${updateError.message}`
          );
        }

        console.log(`✅ Product ${productId} sync timestamp updated`);

        // Liberar lock antes do return
        await supabase.rpc("pg_advisory_unlock", { lock_id: lockId });
        console.log(
          `🔓 Lock liberado para produto ${productId} (timestamp update)`
        );

        return {
          product_id: productId,
          event,
          action: "sync_timestamp_updated",
          processed_at: new Date().toISOString(),
        };
      }

      // Verificar se houve mudança de marca (pode causar triggers pesados)
      const brandChanged =
        existingProduct && existingProduct.brand !== processedProduct.brand;

      if (brandChanged) {
        console.log(
          `🏷️ Brand change detected for product ${productId}: ${existingProduct.brand} → ${processedProduct.brand}`
        );

        // Para mudanças de marca, usar update simples sem triggers de nova marca
        const { error: updateError } = await supabase
          .from("nuvemshop_products")
          .update({
            ...processedProduct,
            // Manter a marca original para evitar triggers de nova marca
            brand: existingProduct.brand,
            last_synced_at: new Date().toISOString(),
            sync_status: "synced",
          })
          .eq("product_id", productId);

        if (updateError) {
          console.error(
            `❌ Database error updating product with brand change ${productId}:`,
            updateError
          );
          throw new Error(
            `Failed to update product with brand change: ${updateError.message}`
          );
        }

        console.log(`✅ Product ${productId} updated (brand change handled)`);

        // Liberar lock antes do return
        await supabase.rpc("pg_advisory_unlock", { lock_id: lockId });
        console.log(
          `🔓 Lock liberado para produto ${productId} (brand change)`
        );

        return {
          product_id: productId,
          event,
          action: "updated_with_brand_change_handled",
          processed_at: new Date().toISOString(),
        };
      }

      // Salvar/atualizar no banco com dados completos
      console.log(`💾 Saving product ${productId} to database...`);

      const { data, error } = await supabase
        .from("nuvemshop_products")
        .upsert(processedProduct, {
          onConflict: "product_id",
          ignoreDuplicates: false,
        })
        .select("id");

      if (error) {
        console.error(`❌ Database error saving product ${productId}:`, error);
        console.error(`❌ Error details:`, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw new Error(`Failed to save product: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.error(
          `❌ No data returned from upsert for product ${productId}`
        );
        throw new Error(
          `Failed to save product: No data returned from database`
        );
      }

      console.log(`✅ Product ${productId} processed and saved successfully`, {
        database_id: data[0]?.id,
        action: data.length > 0 ? "upserted" : "unknown",
      });

      // Check if this is a new brand and trigger auto-coupon generation (async, non-blocking)
      if (
        event === "product/created" &&
        processedProduct.brand &&
        processedProduct.published
      ) {
        // Execute async without awaiting to avoid timeout
        this.checkAndProcessNewBrand(processedProduct.brand).catch((error) => {
          console.error(
            `Error in async auto-coupon generation for brand ${processedProduct.brand}:`,
            error
          );
        });
      }

      return {
        product_id: productId,
        event,
        action: data && data.length > 0 ? "updated" : "created",
        processed_at: new Date().toISOString(),
      };
    } finally {
      // Sempre liberar o advisory lock
      await supabase.rpc("pg_advisory_unlock", { lock_id: lockId });
      console.log(`🔓 Lock liberado para produto ${productId}`);
    }
  }

  // Processar dados do pedido (reutiliza lógica existente)
  private processOrderData(order: any): any {
    // Função auxiliar para parsing seguro de datas
    const safeParseDate = (dateString: string | null): string | null => {
      if (!dateString) return null;
      try {
        return new Date(dateString).toISOString();
      } catch {
        return null;
      }
    };

    // Extrair província do endereço
    const extractProvince = (address: any): string | null => {
      if (!address) return null;
      return address.province || address.state || null;
    };

    // Extrair método de pagamento
    const extractPaymentMethod = (paymentDetails: any): string | null => {
      if (!paymentDetails || !Array.isArray(paymentDetails)) return null;
      const firstPayment = paymentDetails[0];
      return firstPayment?.payment_method?.name || firstPayment?.type || null;
    };

    // Processar campo coupon de forma inteligente
    const processCoupon = (couponData: any): string | null => {
      if (!couponData) return null;

      // Se for uma string vazia ou null, retornar null
      if (typeof couponData === "string") {
        const trimmed = couponData.trim();
        if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
          return null;
        }
        return trimmed;
      }

      // Se for um array (como no exemplo do webhook)
      if (Array.isArray(couponData)) {
        // Se o array está vazio, não há cupom aplicado
        if (couponData.length === 0) {
          return null;
        }

        // Se há cupons no array, mas queremos verificar se algum foi realmente usado
        // Verificar se algum cupom foi efetivamente aplicado (usado > 0 ou discount > 0)
        const appliedCoupons = couponData.filter((coupon) => {
          // Se o cupom tem informações de uso ou desconto aplicado
          return (
            coupon.used > 0 ||
            (order.discount_coupon && parseFloat(order.discount_coupon) > 0)
          );
        });

        if (appliedCoupons.length > 0) {
          // Retornar o código do primeiro cupom aplicado
          return appliedCoupons[0].code || null;
        }

        return null;
      }

      // Se for um objeto, extrair o código
      if (typeof couponData === "object" && couponData.code) {
        return couponData.code;
      }

      return null;
    };

    return {
      order_id: order.id.toString(),
      order_number: order.number || order.name,
      completed_at: safeParseDate(order.completed_at),
      created_at_nuvemshop: safeParseDate(order.created_at),
      contact_name: order.contact_name || null,
      shipping_address: order.shipping_address || null,
      province: extractProvince(order.shipping_address),
      products: order.products || [],
      subtotal: parseFloat(order.subtotal || "0"),
      shipping_cost_customer: parseFloat(order.shipping_cost_customer || "0"),
      coupon: processCoupon(order.coupon),
      promotional_discount: parseFloat(order.promotional_discount || "0"),
      total_discount_amount: parseFloat(order.total_discount_amount || "0"),
      discount_coupon: parseFloat(order.discount_coupon || "0"),
      discount_gateway: parseFloat(order.discount_gateway || "0"),
      total: parseFloat(order.total || "0"),
      payment_details: order.payment_details || null,
      payment_method: extractPaymentMethod(order.payment_details),
      payment_status: order.payment_status || null,
      status: order.status || null,
      fulfillment_status: order.fulfillment_status || null,
      last_synced_at: new Date().toISOString(),
      api_updated_at: safeParseDate(order.updated_at),
      sync_status: "synced" as const,
    };
  }

  // Função auxiliar para extrair nome em português (igual à sincronização manual)
  private extractPortugueseName(nameObj: any): string | null {
    if (!nameObj) return null;

    // Try different possible fields for Portuguese name
    return (
      nameObj.pt ||
      nameObj.por ||
      nameObj.portuguese ||
      nameObj.default ||
      (typeof nameObj === "string" ? nameObj : null)
    );
  }

  // Função auxiliar para obter informações da imagem destacada (igual à sincronização manual)
  private getFeaturedImageInfo(images: any[]) {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return { featuredImageId: null, featuredImageSrc: null };
    }

    // Find the first image or the one marked as featured
    const featuredImage = images.find((img) => img.featured) || images[0];

    return {
      featuredImageId: featuredImage?.id?.toString() || null,
      featuredImageSrc: featuredImage?.src || null,
    };
  }

  // Processar dados do produto (usando a mesma lógica da sincronização manual)
  private processProductData(product: any): any {
    console.log(`🔍 Processing product data for ID ${product.id}:`, {
      raw_name: product.name,
      raw_featured_image: product.featured_image,
      raw_images: product.images,
      raw_published: product.published,
      raw_brand: product.brand,
    });

    // Get featured image info using the same logic as manual sync
    const { featuredImageId, featuredImageSrc } = this.getFeaturedImageInfo(
      product.images
    );

    const processedData = {
      product_id: product.id.toString(),
      name: product.name || null,
      name_pt: this.extractPortugueseName(product.name),
      brand: product.brand || null,
      description: product.description?.pt || product.description || null,
      handle: product.handle || null,
      canonical_url: product.canonical_url || null,
      variants: product.variants || [],
      images: product.images || [],
      featured_image_id: featuredImageId,
      featured_image_src: featuredImageSrc,
      published: product.published || false,
      free_shipping: product.free_shipping || false,
      seo_title: product.seo_title || null,
      seo_description: product.seo_description || null,
      tags: product.tags || [],
      last_synced_at: new Date().toISOString(),
      api_updated_at: product.updated_at
        ? new Date(product.updated_at).toISOString()
        : null,
      sync_status: "synced" as const,
    };

    console.log(`✨ Final processed data:`, {
      product_id: processedData.product_id,
      name_pt: processedData.name_pt,
      featured_image_id: processedData.featured_image_id,
      featured_image_src: processedData.featured_image_src,
      images_count: processedData.images?.length || 0,
      published: processedData.published,
      sync_status: processedData.sync_status,
    });

    return processedData;
  }

  // Atualizar log do webhook
  private async updateWebhookLog(
    logId: string,
    updates: Partial<NuvemshopWebhookLog>
  ): Promise<void> {
    const { error } = await supabase
      .from("nuvemshop_webhook_logs")
      .update(updates)
      .eq("id", logId);

    if (error) {
      console.error("Failed to update webhook log:", error);
    }
  }

  // Determinar se deve tentar novamente baseado no erro
  private shouldRetryError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || "";
    const errorCode = error.status || error.code;

    // Não tentar novamente para erros de cliente (4xx) exceto 408 (timeout)
    if (errorCode >= 400 && errorCode < 500 && errorCode !== 408) {
      return false;
    }

    // Tentar novamente para erros de servidor (5xx)
    if (errorCode >= 500) {
      return true;
    }

    // Tentar novamente para timeouts de API
    if (errorMessage.includes("API request timeout")) {
      return true;
    }

    // Tentar novamente para timeouts de statement do banco
    if (
      errorMessage.includes("statement timeout") ||
      errorMessage.includes("canceling statement due to statement timeout")
    ) {
      return true;
    }

    // Tentar novamente para erros de conexão com banco
    if (
      errorMessage.includes("connection") &&
      (errorMessage.includes("timeout") || errorMessage.includes("reset"))
    ) {
      return true;
    }

    // Tentar novamente para erros de rede
    const networkErrors = [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "timeout",
      "network",
      "socket hang up",
      "connect timeout",
    ];

    return networkErrors.some((netError) =>
      errorMessage.toLowerCase().includes(netError.toLowerCase())
    );
  }

  // Note: Coupon events don't exist in NuvemShop API
  // Coupon data is synced from order webhooks instead via syncCouponFromOrder()

  // Sync coupon data from NuvemShop to our database
  private async syncCouponToDatabase(
    couponData: any,
    event: NuvemshopWebhookEvent | string
  ): Promise<any> {
    try {
      const couponId = couponData.id.toString();

      // Check if this coupon already exists in our database
      const { data: existingCoupon, error: searchError } = await supabase
        .from("generated_coupons")
        .select("*")
        .eq("nuvemshop_coupon_id", couponId)
        .single();

      if (searchError && searchError.code !== "PGRST116") {
        console.error(`Error searching for existing coupon:`, searchError);
        throw new Error(`Failed to search for coupon: ${searchError.message}`);
      }

      // Extract brand from products if available
      let brand = null;
      if (couponData.products && couponData.products.length > 0) {
        // Get brand from first product
        const { data: productData } = await supabase
          .from("nuvemshop_products")
          .select("brand")
          .eq("product_id", couponData.products[0].toString())
          .single();

        if (productData) {
          brand = productData.brand;
        }
      }

      // Prepare coupon data for our database
      const couponDbData = {
        code: couponData.code,
        percentage:
          couponData.type === "percentage" ? parseInt(couponData.value) : null,
        brand: brand,
        valid_until: couponData.end_date
          ? new Date(couponData.end_date).toISOString()
          : null,
        max_uses: couponData.max_uses || null,
        nuvemshop_coupon_id: couponId,
        nuvemshop_status: "created",
        is_active: couponData.valid || false,
        is_auto_generated: false, // Assume manual creation from NuvemShop
        updated_at: new Date().toISOString(),
      };

      if (existingCoupon) {
        // Update existing coupon
        const { error: updateError } = await supabase
          .from("generated_coupons")
          .update(couponDbData)
          .eq("id", existingCoupon.id);

        if (updateError) {
          throw new Error(`Failed to update coupon: ${updateError.message}`);
        }

        console.log(
          `✅ Updated existing coupon ${couponData.code} in database`
        );

        return {
          coupon_id: couponId,
          event,
          action: "updated",
          coupon_code: couponData.code,
          processed_at: new Date().toISOString(),
        };
      } else {
        // Create new coupon
        const { error: createError } = await supabase
          .from("generated_coupons")
          .insert({
            ...couponDbData,
            created_by: null, // Created from NuvemShop webhook
            created_by_brand: brand,
          });

        if (createError) {
          throw new Error(`Failed to create coupon: ${createError.message}`);
        }

        console.log(`✅ Created new coupon ${couponData.code} in database`);

        return {
          coupon_id: couponId,
          event,
          action: "created",
          coupon_code: couponData.code,
          processed_at: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error(`❌ Failed to sync coupon to database:`, error);
      throw error;
    }
  }

  // Check if this is a new brand and process pending coupons
  private async checkAndProcessNewBrand(brand: string): Promise<void> {
    try {
      console.log(
        `🔍 Checking if brand "${brand}" is new and needs auto-coupon...`
      );

      // Check if we already have an auto-coupon for this brand
      const { data: existingCoupons, error: couponError } = await supabase
        .from("generated_coupons")
        .select("id")
        .eq("brand", brand)
        .eq("is_auto_generated", true)
        .limit(1);

      if (couponError) {
        console.error(
          `Error checking existing coupons for brand ${brand}:`,
          couponError
        );
        return;
      }

      if (existingCoupons && existingCoupons.length > 0) {
        console.log(`✅ Brand "${brand}" already has auto-coupon, skipping`);
        return;
      }

      console.log(
        `🎫 New brand "${brand}" detected, creating auto-coupon directly...`
      );

      // Create auto-coupon directly (avoid HTTP call to prevent timeout)
      await this.createAutoCouponForBrand(brand);

      // Now process any pending coupons for this brand
      await this.processPendingCouponsForBrand(brand);
    } catch (error) {
      console.error(`Error in checkAndProcessNewBrand for ${brand}:`, error);
    }
  }

  // Create auto-coupon directly for a brand (avoid HTTP calls)
  private async createAutoCouponForBrand(brand: string): Promise<void> {
    try {
      console.log(`🎫 Creating auto-coupon for brand: ${brand}`);

      // Generate coupon code (first word of brand + "15", all uppercase)
      const firstWord = brand.trim().split(/\s+/)[0];
      const couponCode = `${firstWord.toUpperCase()}15`;

      // Get products for this brand to apply coupon restrictions
      const { data: brandProducts, error: productsError } = await supabase
        .from("nuvemshop_products")
        .select("product_id")
        .eq("brand", brand)
        .eq("published", true)
        .eq("sync_status", "synced");

      if (productsError) {
        console.error(
          `Error fetching products for brand ${brand}:`,
          productsError
        );
      }

      const productIds =
        brandProducts
          ?.map((p) => {
            const id = parseInt(p.product_id, 10);
            return isNaN(id) ? null : id;
          })
          .filter((id) => id !== null) || [];

      console.log(`📦 Found ${productIds.length} products for brand ${brand}`);

      // Prepare dates
      const startDate = new Date().toISOString().split("T")[0];
      const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // Create coupon in Supabase first
      const { data: newCoupon, error: createError } = await supabase
        .from("generated_coupons")
        .insert({
          code: couponCode,
          percentage: 15,
          brand: brand,
          valid_until: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
          max_uses: null, // Unlimited uses
          created_by: null, // Auto-generated by webhook
          created_by_brand: brand,
          nuvemshop_status: "pending",
          is_auto_generated: true, // Mark as auto-generated
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating auto-coupon in database:", createError);
        return;
      }

      // Prepare coupon payload for Nuvemshop
      const couponPayload = {
        code: couponCode,
        type: "percentage",
        value: "15",
        valid: true,
        start_date: startDate,
        end_date: endDate,
        min_price: 0,
        first_consumer_purchase: false,
        combines_with_other_discounts: false,
        includes_shipping: false,
        // Include products if we have them, otherwise create a general coupon
        ...(productIds.length > 0 && { products: productIds }),
      };

      console.log(
        `📋 Creating auto-coupon in Nuvemshop:`,
        JSON.stringify(couponPayload, null, 2)
      );

      // Create coupon in Nuvemshop
      const nuvemshopCoupon = await this.fetchFromNuvemshop("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

      console.log(
        `✅ Nuvemshop auto-coupon created: ${couponCode} (ID: ${nuvemshopCoupon.id})`
      );

      // Update the coupon in Supabase with Nuvemshop ID
      const { error: updateError } = await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
          nuvemshop_error: null,
        })
        .eq("id", newCoupon.id);

      if (updateError) {
        console.error(`Error updating auto-coupon ${couponCode}:`, updateError);
      } else {
        console.log(
          `✅ Auto-coupon ${couponCode} created successfully for brand ${brand}`
        );
      }
    } catch (error) {
      console.error(
        `❌ Failed to create auto-coupon for brand ${brand}:`,
        error
      );
    }
  }

  // Process pending coupons for a specific brand
  private async processPendingCouponsForBrand(brand: string): Promise<void> {
    try {
      console.log(`🔄 Processing pending coupons for brand "${brand}"...`);

      // Call the process pending coupons API
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";
      const response = await fetch(
        `${baseUrl}/api/admin/process-pending-coupons`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to process pending coupons for brand ${brand}:`,
          errorText
        );
        return;
      }

      const result = await response.json();
      console.log(`✅ Pending coupons processed for brand "${brand}":`, result);
    } catch (error) {
      console.error(
        `Error in processPendingCouponsForBrand for ${brand}:`,
        error
      );
    }
  }

  // Sync coupon information from order data
  private async syncCouponFromOrder(orderData: any): Promise<void> {
    try {
      const couponCode = orderData.coupon?.trim();
      if (!couponCode) return;

      console.log(`🎫 Syncing coupon from order: ${couponCode}`);

      // Check if this coupon already exists in our database
      const { data: existingCoupon, error: searchError } = await supabase
        .from("generated_coupons")
        .select("*")
        .eq("code", couponCode)
        .single();

      if (searchError && searchError.code !== "PGRST116") {
        console.error(`Error searching for existing coupon:`, searchError);
        return;
      }

      if (existingCoupon) {
        // Update usage count if coupon exists
        const currentUses = existingCoupon.current_uses || 0;
        const { error: updateError } = await supabase
          .from("generated_coupons")
          .update({
            current_uses: currentUses + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingCoupon.id);

        if (updateError) {
          console.error(`Failed to update coupon usage:`, updateError);
        } else {
          console.log(
            `✅ Updated coupon ${couponCode} usage count to ${currentUses + 1}`
          );
        }
      } else {
        // Try to fetch coupon details from NuvemShop API to create it in our database
        try {
          // First, try to find the coupon by searching all coupons
          const allCoupons = await this.fetchFromNuvemshop("/coupons");
          const matchingCoupon = allCoupons.find(
            (c: any) => c.code === couponCode
          );

          if (matchingCoupon) {
            console.log(
              `🎫 Found coupon ${couponCode} in NuvemShop, syncing to database`
            );
            await this.syncCouponToDatabase(matchingCoupon, "order/sync");
          } else {
            console.log(`⚠️ Coupon ${couponCode} not found in NuvemShop API`);
          }
        } catch (error) {
          console.error(
            `Failed to fetch coupon ${couponCode} from NuvemShop:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(`Error in syncCouponFromOrder:`, error);
    }
  }
}
