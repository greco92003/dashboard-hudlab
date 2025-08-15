import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Create Supabase client with service role key
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parâmetros de consulta
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const testBatch = searchParams.get("testBatch");
    const status = searchParams.get("status");
    const orderBy = searchParams.get("orderBy") || "created_at";
    const orderDirection = searchParams.get("orderDirection") || "desc";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    console.log("🔍 Fetching deals from parallel test table...");
    console.log(`📊 Params: limit=${limit}, offset=${offset}, testBatch=${testBatch}`);

    const supabase = await createSupabaseServer();

    // Construir query base
    let query = supabase
      .from("deals_parallel_test")
      .select(`
        id,
        deal_id,
        title,
        value,
        currency,
        status,
        stage_id,
        closing_date,
        created_date,
        custom_field_value,
        custom_field_id,
        estado,
        "quantidade-de-pares",
        vendedor,
        designer,
        "utm-source",
        "utm-medium",
        contact_id,
        organization_id,
        api_updated_at,
        last_synced_at,
        sync_status,
        test_batch,
        created_at,
        updated_at
      `, { count: 'exact' });

    // Aplicar filtros
    if (testBatch) {
      query = query.eq("test_batch", testBatch);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("closing_date", startDate);
    }

    if (endDate) {
      query = query.lte("closing_date", endDate);
    }

    // Aplicar ordenação
    const validOrderColumns = [
      "created_at", "deal_id", "title", "value", "closing_date", 
      "last_synced_at", "status", "test_batch"
    ];
    
    if (validOrderColumns.includes(orderBy)) {
      query = query.order(orderBy, { 
        ascending: orderDirection.toLowerCase() === "asc" 
      });
    }

    // Aplicar paginação
    query = query.range(offset, offset + limit - 1);

    const { data: deals, error, count } = await query;

    if (error) {
      console.error("❌ Error fetching deals:", error);
      return NextResponse.json(
        { error: "Failed to fetch deals", details: error.message },
        { status: 500 }
      );
    }

    // Buscar estatísticas adicionais
    const { data: stats } = await supabase
      .from("deals_parallel_test")
      .select("test_batch, sync_status")
      .then(({ data }) => {
        if (!data) return { data: null };
        
        const batchStats = data.reduce((acc: any, deal: any) => {
          const batch = deal.test_batch || 'unknown';
          const status = deal.sync_status || 'unknown';
          
          if (!acc[batch]) {
            acc[batch] = { total: 0, synced: 0, error: 0, pending: 0 };
          }
          
          acc[batch].total++;
          acc[batch][status] = (acc[batch][status] || 0) + 1;
          
          return acc;
        }, {});
        
        return { data: batchStats };
      });

    console.log(`✅ Found ${deals?.length || 0} deals (total: ${count})`);

    return NextResponse.json({
      success: true,
      data: {
        deals: deals || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        },
        filters: {
          testBatch,
          status,
          startDate,
          endDate,
          orderBy,
          orderDirection
        },
        statistics: {
          totalDeals: count || 0,
          batchStats: stats || {},
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// POST endpoint para inserir deals de teste
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deals, testBatch } = body;

    if (!deals || !Array.isArray(deals)) {
      return NextResponse.json(
        { error: "Invalid request body. Expected 'deals' array." },
        { status: 400 }
      );
    }

    console.log(`📝 Inserting ${deals.length} deals into parallel test table...`);
    console.log(`🏷️ Test batch: ${testBatch || 'default'}`);

    const supabase = await createSupabaseServer();

    // Adicionar test_batch aos deals se fornecido
    const dealsWithBatch = deals.map(deal => ({
      ...deal,
      test_batch: testBatch || `test_${Date.now()}`,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced'
    }));

    const { data, error } = await supabase
      .from("deals_parallel_test")
      .upsert(dealsWithBatch, { 
        onConflict: "deal_id",
        ignoreDuplicates: false 
      })
      .select("id, deal_id, test_batch");

    if (error) {
      console.error("❌ Error inserting deals:", error);
      return NextResponse.json(
        { error: "Failed to insert deals", details: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully inserted/updated ${data?.length || 0} deals`);

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${data?.length || 0} deals`,
      data: {
        insertedDeals: data?.length || 0,
        testBatch: testBatch || `test_${Date.now()}`,
        deals: data || []
      }
    });

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint para limpar dados de teste
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testBatch = searchParams.get("testBatch");
    const confirmDelete = searchParams.get("confirm") === "true";

    if (!confirmDelete) {
      return NextResponse.json(
        { error: "Delete operation requires confirmation. Add ?confirm=true" },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting deals from parallel test table...`);
    if (testBatch) {
      console.log(`🏷️ Filtering by test batch: ${testBatch}`);
    } else {
      console.log(`⚠️ Deleting ALL test deals`);
    }

    const supabase = await createSupabaseServer();

    let query = supabase.from("deals_parallel_test").delete();
    
    if (testBatch) {
      query = query.eq("test_batch", testBatch);
    } else {
      // Para deletar tudo, usar uma condição que sempre seja verdadeira
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { error, count } = await query;

    if (error) {
      console.error("❌ Error deleting deals:", error);
      return NextResponse.json(
        { error: "Failed to delete deals", details: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully deleted ${count || 0} deals`);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${count || 0} deals`,
      data: {
        deletedCount: count || 0,
        testBatch: testBatch || 'all'
      }
    });

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
