// =====================================================
// WEBHOOK ESPECÍFICO: COUPON DELETED
// =====================================================
// Endpoint específico para webhooks de cupons deletados

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { secureWebhookMiddleware } from "@/lib/nuvemshop/webhook-security";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log("🔔 Coupon deleted webhook received");

    // 1. Validação de segurança
    const security = await secureWebhookMiddleware(request);
    
    if (!security.isValid) {
      console.error("❌ Security validation failed:", security.error);
      
      if (security.shouldBlock) {
        return NextResponse.json(
          { error: "Forbidden", message: security.error },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { error: "Bad Request", message: security.error },
        { status: 400 }
      );
    }

    const { payload, headers } = security;
    const couponId = payload.id?.toString() || "unknown";
    const storeId = payload.store_id?.toString() || "unknown";

    console.log(`🗑️ Processing coupon deleted: ${couponId} from store ${storeId}`);

    // 2. Criar log do webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "coupon/deleted",
        store_id: storeId,
        resource_id: couponId,
        status: "received",
        headers,
        payload,
        hmac_signature: headers["x-linkedstore-hmac-sha256"] || null,
        hmac_verified: true,
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create webhook log:", logError);
      return NextResponse.json({
        success: false,
        error: "Failed to log webhook",
      }, { status: 500 });
    }

    // 3. Processar exclusão do cupom
    const result = await processCouponDeletion(couponId, webhookLog.id);

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Coupon deleted webhook processed in ${totalTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: "Coupon deleted webhook processed",
        coupon_id: couponId,
        processing_time_ms: totalTime,
        affected_coupons: result.affected_coupons,
      });
    } else {
      console.error(`❌ Coupon deleted webhook failed: ${result.error_message}`);
      
      return NextResponse.json({
        success: false,
        error: result.error_message,
        coupon_id: couponId,
        should_retry: result.should_retry,
      }, { status: result.should_retry ? 500 : 422 });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("Coupon deleted webhook error:", error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processing_time_ms: totalTime,
    }, { status: 500 });
  }
}

// Função para processar a exclusão do cupom
async function processCouponDeletion(couponId: string, webhookLogId: string) {
  try {
    console.log(`🔍 Looking for coupon with nuvemshop_coupon_id: ${couponId}`);

    // Buscar cupons que correspondem ao ID do NuvemShop
    const { data: existingCoupons, error: searchError } = await supabase
      .from("generated_coupons")
      .select("id, code, brand, nuvemshop_status")
      .eq("nuvemshop_coupon_id", couponId)
      .neq("nuvemshop_status", "deleted");

    if (searchError) {
      console.error("Error searching for coupon:", searchError);
      throw new Error(`Failed to search for coupon: ${searchError.message}`);
    }

    if (!existingCoupons || existingCoupons.length === 0) {
      console.log(`⚠️ No active coupons found with nuvemshop_coupon_id: ${couponId}`);
      
      // Atualizar log do webhook
      await supabase
        .from("nuvemshop_webhook_logs")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          result: { message: "No active coupons found to delete" },
        })
        .eq("id", webhookLogId);

      return {
        success: true,
        affected_coupons: 0,
        message: "No active coupons found to delete",
      };
    }

    console.log(`📋 Found ${existingCoupons.length} coupon(s) to mark as deleted`);

    // Marcar cupons como deletados
    const { error: updateError } = await supabase
      .from("generated_coupons")
      .update({
        nuvemshop_status: "deleted",
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("nuvemshop_coupon_id", couponId)
      .neq("nuvemshop_status", "deleted");

    if (updateError) {
      console.error("Error updating coupons:", updateError);
      throw new Error(`Failed to mark coupons as deleted: ${updateError.message}`);
    }

    // Atualizar log do webhook com sucesso
    await supabase
      .from("nuvemshop_webhook_logs")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        result: {
          affected_coupons: existingCoupons.length,
          coupon_codes: existingCoupons.map(c => c.code),
        },
      })
      .eq("id", webhookLogId);

    console.log(`✅ Successfully marked ${existingCoupons.length} coupon(s) as deleted`);

    return {
      success: true,
      affected_coupons: existingCoupons.length,
      coupon_codes: existingCoupons.map(c => c.code),
    };

  } catch (error) {
    console.error("Error in processCouponDeletion:", error);

    // Atualizar log do webhook com erro
    await supabase
      .from("nuvemshop_webhook_logs")
      .update({
        status: "error",
        processed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", webhookLogId);

    return {
      success: false,
      error_message: error instanceof Error ? error.message : "Unknown error",
      should_retry: true,
    };
  }
}

// Endpoint para verificação de saúde
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "coupon/deleted",
    timestamp: new Date().toISOString(),
  });
}
