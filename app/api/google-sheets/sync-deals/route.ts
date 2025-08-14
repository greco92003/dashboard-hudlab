import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { writeGoogleSheet, appendGoogleSheet } from "@/lib/google-sheets";

// Create Supabase client for sync operations
async function createSupabaseServerForSync() {
  const { createClient } = await import("@supabase/supabase-js");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      spreadsheetId, 
      sheetName = 'Deals',
      mode = 'replace', // 'replace' ou 'append'
      dateRange,
      includeHeaders = true 
    } = body;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Syncing deals to Google Sheet: ${spreadsheetId}`);

    // Conectar ao Supabase
    const supabase = await createSupabaseServerForSync();

    // Buscar deals do banco de dados
    let query = supabase
      .from('deals_cache')
      .select(`
        deal_id,
        title,
        value,
        status,
        stage,
        owner_name,
        contact_name,
        contact_email,
        organization_name,
        created_date,
        updated_date,
        close_date,
        estado,
        quantidade_pares,
        vendedor,
        designer
      `)
      .order('created_date', { ascending: false });

    // Aplicar filtro de data se fornecido
    if (dateRange?.start && dateRange?.end) {
      query = query
        .gte('close_date', dateRange.start)
        .lte('close_date', dateRange.end);
    }

    const { data: deals, error } = await query;

    if (error) {
      console.error("Error fetching deals:", error);
      return NextResponse.json(
        { error: "Failed to fetch deals from database" },
        { status: 500 }
      );
    }

    if (!deals || deals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No deals found to sync",
        syncedRows: 0
      });
    }

    // Preparar dados para o Google Sheets
    const headers = [
      'ID do Deal',
      'Título',
      'Valor (R$)',
      'Status',
      'Estágio',
      'Responsável',
      'Contato',
      'Email',
      'Empresa',
      'Data Criação',
      'Data Atualização',
      'Data Fechamento',
      'Estado',
      'Quantidade Pares',
      'Vendedor',
      'Designer'
    ];

    const dataRows = deals.map(deal => [
      deal.deal_id?.toString() || '',
      deal.title || '',
      deal.value ? (deal.value / 100).toFixed(2) : '0.00', // Converter centavos para reais
      deal.status || '',
      deal.stage || '',
      deal.owner_name || '',
      deal.contact_name || '',
      deal.contact_email || '',
      deal.organization_name || '',
      deal.created_date ? new Date(deal.created_date).toLocaleDateString('pt-BR') : '',
      deal.updated_date ? new Date(deal.updated_date).toLocaleDateString('pt-BR') : '',
      deal.close_date ? new Date(deal.close_date).toLocaleDateString('pt-BR') : '',
      deal.estado || '',
      deal.quantidade_pares?.toString() || '0',
      deal.vendedor || '',
      deal.designer || ''
    ]);

    // Preparar valores para escrita
    const values = includeHeaders ? [headers, ...dataRows] : dataRows;
    const range = mode === 'replace' 
      ? `${sheetName}!A1:P${values.length}` 
      : `${sheetName}!A:P`;

    // Escrever no Google Sheets
    let result;
    if (mode === 'append') {
      result = await appendGoogleSheet(spreadsheetId, range, values);
    } else {
      // Limpar a planilha primeiro se estiver substituindo
      const client = (await import("@/lib/google-sheets")).getGoogleSheetsClient();
      await client.clearSheet(spreadsheetId, `${sheetName}!A:P`);
      
      // Escrever os novos dados
      result = await writeGoogleSheet(spreadsheetId, range, values);
    }

    // Log da sincronização
    await supabase
      .from('sync_log')
      .insert({
        sync_type: 'google_sheets_deals',
        status: 'completed',
        records_processed: deals.length,
        details: {
          spreadsheetId,
          sheetName,
          mode,
          dateRange,
          syncedRows: result.updatedRows,
          syncedColumns: result.updatedColumns
        }
      });

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${deals.length} deals to Google Sheets`,
      data: {
        mode,
        spreadsheetId,
        sheetName,
        syncedDeals: deals.length,
        syncedRows: result.updatedRows,
        syncedColumns: result.updatedColumns,
        syncedCells: result.updatedCells,
        dateRange
      }
    });

  } catch (error) {
    console.error("Error syncing deals to Google Sheets:", error);
    
    // Log do erro
    try {
      const supabase = await createSupabaseServerForSync();
      await supabase
        .from('sync_log')
        .insert({
          sync_type: 'google_sheets_deals',
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
    } catch (logError) {
      console.error("Error logging sync failure:", logError);
    }
    
    return NextResponse.json(
      { 
        error: "Failed to sync deals to Google Sheets",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
