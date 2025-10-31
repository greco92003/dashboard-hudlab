// =====================================================
// WEBHOOK ESPECÍFICO: ORDER PAID
// =====================================================
// Endpoint específico para webhooks de pedidos pagos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { secureWebhookMiddleware } from "@/lib/nuvemshop/webhook-security";
import { NuvemshopWebhookProcessor } from "@/lib/nuvemshop/webhook-processor";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const processor = new NuvemshopWebhookProcessor();

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("💰 Order paid webhook received");

    // Validação de segurança
    const security = await secureWebhookMiddleware(request);

    if (!security.isValid) {
      console.error("❌ Security validation failed:", security.error);
      return NextResponse.json(
        { error: "Forbidden", message: security.error },
        { status: security.shouldBlock ? 403 : 400 }
      );
    }

    const { payload, headers } = security;
    const orderId = payload.id?.toString() || "unknown";

    console.log(`💳 Processing order paid: ${orderId}`);

    // Criar log específico para order/paid
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "order/paid",
        store_id: payload.store_id.toString(),
        resource_id: orderId,
        status: "processing",
        headers,
        payload,
        hmac_signature: headers["x-linkedstore-hmac-sha256"] || null,
        hmac_verified: true,
        processing_started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create webhook log:", logError);
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );
    }

    // Processar webhook
    const result = await processor.processWebhook(
      "order/paid",
      payload,
      webhookLog.id
    );

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Order paid webhook processed in ${totalTime}ms`);

      // Enviar notificação automática de venda para partners-media
      try {
        console.log("📱 Sending sale notification to partners...");

        // Buscar dados completos do pedido para a notificação
        const { data: orderData } = await supabase
          .from("nuvemshop_orders")
          .select("*")
          .eq("order_id", orderId)
          .single();

        if (orderData && orderData.products) {
          // Extrair marca dos produtos
          const products = Array.isArray(orderData.products)
            ? orderData.products
            : [];
          const brands = new Set<string>();

          // Map para armazenar product_id -> brand
          const productBrandMap = new Map<string, string>();

          // Buscar marcas dos produtos na tabela nuvemshop_products
          for (const product of products) {
            if (product.product_id) {
              const { data: productData } = await supabase
                .from("nuvemshop_products")
                .select("brand")
                .eq("product_id", product.product_id.toString())
                .single();

              if (productData && productData.brand) {
                brands.add(productData.brand);
                productBrandMap.set(
                  product.product_id.toString(),
                  productData.brand
                );
                console.log(
                  `🏷️ Found brand for product ${product.product_id}: ${productData.brand}`
                );
              } else {
                console.warn(
                  `⚠️ No brand found for product ${product.product_id}`
                );
              }
            }
          }

          // Enriquecer produtos com informação da marca
          const enrichedProducts = products.map((p: any) => ({
            ...p,
            brand: p.product_id
              ? productBrandMap.get(p.product_id.toString())
              : null,
          }));

          console.log(
            `📦 Found ${brands.size} unique brands in order ${orderId}`
          );

          // Enviar notificação para cada marca
          for (const brand of brands) {
            const subtotal =
              typeof orderData.subtotal === "string"
                ? parseFloat(orderData.subtotal)
                : orderData.subtotal || 0;

            const promotionalDiscount =
              typeof orderData.promotional_discount === "string"
                ? parseFloat(orderData.promotional_discount)
                : orderData.promotional_discount || 0;

            const discountCoupon =
              typeof orderData.discount_coupon === "string"
                ? parseFloat(orderData.discount_coupon)
                : orderData.discount_coupon || 0;

            const discountGateway =
              typeof orderData.discount_gateway === "string"
                ? parseFloat(orderData.discount_gateway)
                : orderData.discount_gateway || 0;

            const totalDiscounts =
              promotionalDiscount + discountCoupon + discountGateway;

            // Filtrar produtos desta marca específica
            const brandProducts = enrichedProducts.filter(
              (p: any) => p.brand === brand
            );

            console.log(
              `📱 Sending notification for brand ${brand} with ${brandProducts.length} products`
            );

            const saleNotificationResponse = await fetch(
              `${request.nextUrl.origin}/api/notifications/sale-notification`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: orderData.order_id,
                  orderNumber: orderData.order_number,
                  brand,
                  totalValue: subtotal,
                  discounts: totalDiscounts,
                  customerName: orderData.contact_name,
                  products: brandProducts,
                }),
              }
            );

            if (saleNotificationResponse.ok) {
              const notificationResult = await saleNotificationResponse.json();
              console.log(
                `✅ Sale notification sent for brand ${brand}: ${notificationResult.partnersCount} partners notified`
              );
            } else {
              const errorText = await saleNotificationResponse.text();
              console.warn(
                `⚠️ Failed to send sale notification for brand ${brand}: ${errorText}`
              );
            }
          }
        }
      } catch (notificationError) {
        console.warn("⚠️ Failed to send sale notification:", notificationError);
        // Não falhar o webhook por causa da notificação
      }

      return NextResponse.json({
        success: true,
        message: "Order paid webhook processed",
        order_id: orderId,
        processing_time_ms: totalTime,
      });
    } else {
      console.error(`❌ Order paid webhook failed: ${result.error_message}`);

      return NextResponse.json(
        {
          success: false,
          error: result.error_message,
          order_id: orderId,
          should_retry: result.should_retry,
        },
        { status: result.should_retry ? 500 : 422 }
      );
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("❌ Order paid webhook error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        processing_time_ms: totalTime,
      },
      { status: 500 }
    );
  }
}
