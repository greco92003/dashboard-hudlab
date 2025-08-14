import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchNuvemshopAPI } from "@/lib/nuvemshop/api";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Verificar autenticação e permissões
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verificar se o usuário é admin ou owner
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["admin", "owner"].includes(profile.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log("🔧 Starting auto-coupon format fix...");

    // Buscar cupons com formato incorreto
    const { data: incorrectCoupons, error: fetchError } = await supabase
      .from("generated_coupons")
      .select("id, code, brand, nuvemshop_coupon_id, nuvemshop_status")
      .like("code", "%-%")
      .like("code", "%15")
      .eq("percentage", 15);

    if (fetchError) {
      console.error("Error fetching incorrect coupons:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch coupons" },
        { status: 500 }
      );
    }

    if (!incorrectCoupons || incorrectCoupons.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No coupons need fixing",
        fixed: 0,
        errors: [],
      });
    }

    console.log(`Found ${incorrectCoupons.length} coupons to fix`);

    const results = {
      fixed: 0,
      errors: [] as any[],
      details: [] as any[],
    };

    // Processar cada cupom
    for (const coupon of incorrectCoupons) {
      try {
        // Gerar novo código no formato correto
        const firstWord = coupon.brand.trim().split(/\s+/)[0];
        let newCode = `${firstWord.toUpperCase()}15`;

        // Verificar se o novo código já existe
        const { data: existingCoupon } = await supabase
          .from("generated_coupons")
          .select("id")
          .eq("code", newCode)
          .neq("id", coupon.id)
          .single();

        if (existingCoupon) {
          // Se já existe, adicionar timestamp
          newCode = `${firstWord.toUpperCase()}15${Date.now()}`;
        }

        console.log(`Fixing coupon: ${coupon.code} -> ${newCode}`);

        // Atualizar código na base de dados
        const { error: updateError } = await supabase
          .from("generated_coupons")
          .update({
            code: newCode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", coupon.id);

        if (updateError) {
          console.error(`Error updating coupon ${coupon.code}:`, updateError);
          results.errors.push({
            oldCode: coupon.code,
            brand: coupon.brand,
            error: updateError.message,
          });
          continue;
        }

        // Se o cupom existe no Nuvemshop, tentar atualizar lá também
        if (
          coupon.nuvemshop_coupon_id &&
          coupon.nuvemshop_status === "created"
        ) {
          try {
            // Primeiro, deletar o cupom antigo no Nuvemshop
            await fetchNuvemshopAPI(`/coupons/${coupon.nuvemshop_coupon_id}`, {
              method: "DELETE",
            });

            console.log(`Deleted old coupon ${coupon.code} from Nuvemshop`);

            // Criar novo cupom no Nuvemshop com código correto
            const couponPayload = {
              code: newCode,
              type: "percentage",
              value: "15",
              valid: true,
              start_date: new Date().toISOString().split("T")[0],
              end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
              min_price: 0,
              first_consumer_purchase: false,
              combines_with_other_discounts: false,
              includes_shipping: false,
            };

            const newNuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
              method: "POST",
              body: JSON.stringify(couponPayload),
            });

            // Atualizar com novo ID do Nuvemshop
            await supabase
              .from("generated_coupons")
              .update({
                nuvemshop_coupon_id: newNuvemshopCoupon.id.toString(),
                nuvemshop_status: "created",
                nuvemshop_error: null,
              })
              .eq("id", coupon.id);

            console.log(
              `Created new coupon ${newCode} in Nuvemshop (ID: ${newNuvemshopCoupon.id})`
            );
          } catch (nuvemshopError) {
            console.error(
              `Failed to update coupon in Nuvemshop: ${coupon.code}`,
              nuvemshopError
            );
            // Marcar como erro no Nuvemshop mas manter a correção local
            await supabase
              .from("generated_coupons")
              .update({
                nuvemshop_status: "error",
                nuvemshop_error: `Failed to recreate in Nuvemshop: ${nuvemshopError}`,
              })
              .eq("id", coupon.id);
          }
        }

        results.fixed++;
        results.details.push({
          oldCode: coupon.code,
          newCode: newCode,
          brand: coupon.brand,
          nuvemshopUpdated: coupon.nuvemshop_coupon_id ? true : false,
        });
      } catch (error) {
        console.error(`Error processing coupon ${coupon.code}:`, error);
        results.errors.push({
          oldCode: coupon.code,
          brand: coupon.brand,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log(
      `✅ Fixed ${results.fixed} coupons, ${results.errors.length} errors`
    );

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.fixed} auto-coupons format`,
      fixed: results.fixed,
      errors: results.errors,
      details: results.details,
    });
  } catch (error) {
    console.error("Auto-coupon fix error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
