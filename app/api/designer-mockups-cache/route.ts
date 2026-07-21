import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeDesignerName } from "@/lib/utils/normalize-names";
import { getAllDesigners } from "@/lib/constants/designers";
import {
  requireAdminOrCron,
  requireApprovedUser,
} from "@/lib/security/route-guards";

// In-memory lock to prevent concurrent syncs
let syncInProgress = false;
let syncStartTime = 0;
const SYNC_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

// Create Supabase client for cache operations (uses service key)
function createSupabaseServerForCache() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
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

// GET - Retrieve cached mockups data
export async function GET(request: NextRequest) {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const designers = searchParams.get("designers")?.split(",") || [];
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    console.log("📊 GET Designer Mockups Cache:", {
      designers,
      startDate,
      endDate,
    });

    const supabase = createSupabaseServerForCache();

    // Debug: Check what's in the cache for the requested date range
    if (startDate && endDate) {
      const { data: debugData, error: debugError } = await supabase
        .from("designer_mockups_cache")
        .select(
          "designer, atualizado_em, nome_negocio, etapa_funil, is_mockup_feito, is_alteracao"
        )
        .gte("atualizado_em", startDate)
        .lte("atualizado_em", endDate)
        .limit(10);

      console.log("🔍 DEBUG - Cache records for date range:", {
        startDate,
        endDate,
        recordCount: debugData?.length || 0,
        sampleRecords: debugData?.slice(0, 3),
        error: debugError?.message,
      });

      // Also check what dates are actually in the cache
      const { data: allDatesData } = await supabase
        .from("designer_mockups_cache")
        .select("atualizado_em")
        .order("atualizado_em", { ascending: false })
        .limit(20);

      console.log("🔍 DEBUG - Recent dates in cache:", {
        dates: allDatesData?.map((d) => d.atualizado_em),
      });
    }

    // Use the database function for optimized queries
    console.log(
      "🔍 Calling RPC function get_designer_mockups_stats with params:",
      {
        p_designers: designers.length > 0 ? designers : null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      }
    );

    const { data, error } = await supabase.rpc("get_designer_mockups_stats", {
      p_designers: designers.length > 0 ? designers : null,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    });

    if (error) {
      console.error("❌ Error fetching cached mockups data:", {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        {
          error: "Failed to fetch cached data",
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const result: Record<string, any> = {};

    if (data && data.length > 0) {
      data.forEach((row: any) => {
        result[row.designer] = {
          quantidadeNegocios: parseInt(row.quantidade_negocios) || 0,
          mockupsFeitos: parseInt(row.mockups_feitos) || 0,
          alteracoesFeitas: parseInt(row.alteracoes_feitas) || 0,
          arquivosSerigrafia: parseInt(row.arquivos_serigrafia) || 0,
        };
      });
    } else {
      console.log("⚠️ No data found in cache, returning empty result");
    }

    // Get last sync info
    let lastSync = null;
    try {
      const { data: syncData, error: syncError } = await supabase.rpc(
        "get_last_designer_mockups_sync"
      );
      if (!syncError && syncData && syncData.length > 0) {
        lastSync = syncData[0];
      }
    } catch (syncErr) {
      console.warn("⚠️ Could not fetch last sync info:", syncErr);
    }

    console.log("✅ Cached mockups data retrieved:", {
      designers: Object.keys(result),
      dataCount: data?.length || 0,
      rawData: data,
      result: result,
      lastSync: lastSync?.last_sync_at,
      syncStatus: lastSync?.status,
    });

    return NextResponse.json({
      success: true,
      data: result,
      cached: true,
      lastSync: lastSync
        ? {
            timestamp: lastSync.last_sync_at,
            status: lastSync.status,
            totalRecords: lastSync.total_records,
            errorMessage: lastSync.error_message,
          }
        : null,
    });
  } catch (error) {
    console.error("❌ Error in GET designer mockups cache:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve cached data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Sync data from Google Sheets to cache
export async function POST(request: NextRequest) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  console.log("🚀 POST /api/designer-mockups-cache called");

  // Check if sync is already in progress (with timeout)
  const now = Date.now();
  if (syncInProgress && now - syncStartTime < SYNC_TIMEOUT) {
    console.log("⚠️ Sync already in progress, skipping...");
    return NextResponse.json(
      { error: "Sync already in progress" },
      { status: 429 }
    );
  }

  // Reset lock if timeout exceeded
  if (syncInProgress && now - syncStartTime >= SYNC_TIMEOUT) {
    console.log("⚠️ Previous sync timed out, resetting lock...");
    syncInProgress = false;
  }

  syncInProgress = true;
  syncStartTime = Date.now();
  let syncLogId: string | null = null;

  try {
    const body = await request.json();
    const {
      designers = getAllDesigners(), // Use centralized designer list
      startDate,
      endDate,
      forceSync = false,
    } = body;

    console.log("📦 POST - Request parameters:", {
      designers,
      startDate,
      endDate,
      forceSync,
    });

    const supabase = createSupabaseServerForCache();

    // Create sync log entry
    const { data: syncLogData, error: syncLogError } = await supabase
      .from("designer_mockups_sync_log")
      .insert({
        sync_type: "full",
        status: "running",
        date_range_start: startDate || null,
        date_range_end: endDate || null,
        triggered_by: "api",
        google_sheets_id:
          process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID ||
          "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
        google_sheets_range: "Mockups Feitos!A1:Z5000",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (syncLogError) {
      console.error("❌ Error creating sync log:", syncLogError);
      throw new Error("Failed to create sync log");
    }

    syncLogId = syncLogData.id;
    console.log("📝 Created sync log entry:", syncLogId);

    // Fetch data from Google Sheets - Mockups Feitos
    console.log("📊 Fetching Mockups Feitos data from Google Sheets...");
    const mockupsResponse = await fetch(
      `${request.nextUrl.origin}/api/google-sheets/read`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spreadsheetId:
            process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID ||
            "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
          range: "Mockups Feitos!A1:Z5000",
          includeHeaders: true,
        }),
      }
    );

    if (!mockupsResponse.ok) {
      const errorText = await mockupsResponse.text();
      throw new Error(`Google Sheets API error (Mockups): ${errorText}`);
    }

    const mockupsData = await mockupsResponse.json();
    console.log("📊 Mockups Feitos response:", mockupsData);

    // Fetch data from Google Sheets - Arquivo Serigrafia Feito
    console.log(
      "📊 Fetching Arquivo Serigrafia Feito data from Google Sheets..."
    );
    const serigrafiaResponse = await fetch(
      `${request.nextUrl.origin}/api/google-sheets/read`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spreadsheetId:
            process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID ||
            "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
          range: "Arquivo Serigrafia Feito!A1:Z5000",
          includeHeaders: true,
        }),
      }
    );

    if (!serigrafiaResponse.ok) {
      const errorText = await serigrafiaResponse.text();
      throw new Error(`Google Sheets API error (Serigrafia): ${errorText}`);
    }

    const serigrafiaData = await serigrafiaResponse.json();
    console.log("📊 Arquivo Serigrafia Feito response:", serigrafiaData);

    // Combine data from both sheets with source tracking
    const mockupsRawData = (mockupsData.data?.data || []).map((row: any) => ({
      ...row,
      _source: "mockups",
    }));
    const serigrafiaRawData = (serigrafiaData.data?.data || []).map(
      (row: any) => ({
        ...row,
        _source: "serigrafia",
      })
    );
    const rawData = [...mockupsRawData, ...serigrafiaRawData];

    console.log("📊 Raw data from Google Sheets:", {
      totalRows: rawData.length,
      mockupsRows: mockupsRawData.length,
      serigrafiaRows: serigrafiaRawData.length,
      headers: rawData.length > 0 ? Object.keys(rawData[0]) : [],
      sampleRow: rawData[0],
    });

    // Process and filter data
    const processedData = [];
    let processedRecords = 0;
    let newRecords = 0;
    let errorRecords = 0;

    for (const row of rawData) {
      try {
        processedRecords++;

        // Extract and validate required fields
        const nomeNegocio = row["Nome do Negócio"]?.toString().trim();
        const etapaFunil = row["Etapa do Funil"]?.toString().trim();
        const designer = row["Designer"]?.toString().trim();

        // Skip rows with missing essential data
        if (!nomeNegocio || !etapaFunil || !designer) {
          console.log("⚠️ Skipping row with missing data:", {
            nomeNegocio,
            etapaFunil,
            designer,
          });
          continue;
        }

        // Debug: Check all possible date column names
        const possibleDateColumns = [
          "Atualizado em",
          "Atualizado Em",
          "atualizado em",
          "Data",
          "data",
          "Data de Atualização",
          "data de atualizacao",
          "Updated",
          "updated",
          "Last Updated",
          "last updated",
        ];

        let atualizadoEmRaw = null;
        let foundDateColumn = null;

        for (const colName of possibleDateColumns) {
          if (
            row[colName] !== undefined &&
            row[colName] !== null &&
            row[colName] !== ""
          ) {
            atualizadoEmRaw = row[colName]?.toString().trim();
            foundDateColumn = colName;
            break;
          }
        }

        // Function to normalize text (remove accents and convert to lowercase)
        const normalizeText = (text: string | null | undefined) => {
          if (!text) return "";
          return text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, ""); // Remove accents
        };

        // Check if designer is Vítor (with all variants)
        const isVitor = (name: string | null | undefined) => {
          if (!name) return false;
          const normalized = normalizeText(name);
          return normalized.includes("vitor") || normalized.includes("vito");
        };

        // Debug log for first few rows and all Vítor rows
        if (processedRecords <= 5 || isVitor(designer)) {
          console.log(`🔍 Row ${processedRecords} debug (${designer}):`, {
            nomeNegocio,
            etapaFunil,
            designer,
            atualizadoEmRaw,
            foundDateColumn,
            availableColumns: Object.keys(row),
            rawRow: row,
          });
        }

        // Skip rows with missing required data
        if (!nomeNegocio || !etapaFunil || !designer) {
          continue;
        }

        // Filter by designers if specified
        const designerMatches =
          designers.length === 0 ||
          designers.some((d: string) => {
            const normalizedDesigner = normalizeText(designer);
            const normalizedFilter = normalizeText(d);
            return (
              normalizedDesigner.includes(normalizedFilter) ||
              normalizedFilter.includes(normalizedDesigner) ||
              // Special handling for Vítor variants
              (isVitor(designer) &&
                (normalizedFilter.includes("vitor") ||
                  normalizedFilter.includes("vito"))) ||
              (isVitor(d) &&
                (normalizedDesigner.includes("vitor") ||
                  normalizedDesigner.includes("vito")))
            );
          });

        if (!designerMatches) {
          if (isVitor(designer)) {
            console.log(`❌ Vítor row filtered out:`, {
              designer,
              normalizedDesigner: normalizeText(designer),
              requestedDesigners: designers,
              normalizedFilters: designers.map((d: string) => normalizeText(d)),
              designerMatches,
            });
          }
          continue;
        }

        // Log Vítor matches
        if (isVitor(designer)) {
          console.log(`✅ Vítor row matched:`, {
            designer,
            normalizedDesigner: normalizeText(designer),
            requestedDesigners: designers,
            etapaFunil,
            nomeNegocio,
          });
        }

        // Parse date
        let atualizadoEm: Date | null = null;
        if (atualizadoEmRaw) {
          // Google Sheets now returns dates in DD/MM/YYYY format (Brazilian format)
          const dateMatch = atualizadoEmRaw.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
          );

          if (dateMatch) {
            const day = parseInt(dateMatch[1]); // First part is day (DD/MM/YYYY)
            const month = parseInt(dateMatch[2]); // Second part is month
            const year = parseInt(dateMatch[3]); // Third part is year

            // Validate if it's DD/MM/YYYY format
            // If day > 12, it's definitely DD/MM/YYYY
            // If day <= 12 and month <= 12, assume DD/MM/YYYY (Brazilian standard)
            if (day > 12 || (day <= 12 && month <= 12)) {
              atualizadoEm = new Date(year, month - 1, day);
            }
            // If month > 12, then it's MM/DD/YYYY (swap them)
            else if (month > 12) {
              atualizadoEm = new Date(year, day - 1, month);
            }

            // Debug log for first few rows to verify parsing
            if (processedRecords <= 5) {
              console.log(`📅 Date parsing for row ${processedRecords}:`, {
                original: atualizadoEmRaw,
                parsedAs:
                  day > 12 || (day <= 12 && month <= 12)
                    ? "DD/MM/YYYY"
                    : "MM/DD/YYYY",
                day,
                month,
                year,
                result: atualizadoEm?.toISOString().split("T")[0],
                brazilianFormat: atualizadoEm?.toLocaleDateString("pt-BR"),
              });
            }
          } else {
            // Try other formats if DD/MM/YYYY doesn't match
            const isoMatch = atualizadoEmRaw.match(
              /^(\d{4})-(\d{1,2})-(\d{1,2})$/
            );
            if (isoMatch) {
              atualizadoEm = new Date(
                parseInt(isoMatch[1]),
                parseInt(isoMatch[2]) - 1,
                parseInt(isoMatch[3])
              );
            }
          }
        }

        // Filter by date range if specified
        if (startDate && atualizadoEm && atualizadoEm < new Date(startDate)) {
          continue;
        }
        if (endDate && atualizadoEm && atualizadoEm > new Date(endDate)) {
          continue;
        }

        // Determine the type based on source and etapa_funil
        const source = row._source || "mockups";
        const isArquivoSerigrafia = source === "serigrafia";
        const isMockupFeito =
          !isArquivoSerigrafia &&
          etapaFunil.toLowerCase().includes("mockup") &&
          !etapaFunil.toLowerCase().includes("alteração");
        const isAlteracao =
          !isArquivoSerigrafia &&
          etapaFunil.toLowerCase().includes("alteração");

        // Log categorization for Vítor
        if (isVitor(designer)) {
          console.log(`🏷️ Vítor categorization:`, {
            designer,
            etapaFunil,
            source,
            isMockupFeito,
            isAlteracao,
            isArquivoSerigrafia,
            nomeNegocio,
          });
        }

        const processedRow = {
          nome_negocio: nomeNegocio,
          etapa_funil: etapaFunil,
          designer: normalizeDesignerName(designer),
          atualizado_em_raw: atualizadoEmRaw,
          atualizado_em: atualizadoEm
            ? atualizadoEm.toISOString().split("T")[0]
            : null,
          is_mockup_feito: isMockupFeito,
          is_alteracao: isAlteracao,
          is_arquivo_serigrafia: isArquivoSerigrafia,
          last_synced_at: new Date().toISOString(),
          sync_status: "synced",
        };

        processedData.push(processedRow);
        newRecords++;
      } catch (rowError) {
        console.error("❌ Error processing row:", rowError, row);
        errorRecords++;
      }
    }

    // DO NOT remove duplicates - each row in the sheet represents a separate action
    // Even if the same business has multiple mockups/alterations on the same day,
    // each one should be counted separately
    console.log("🔄 Processing complete:", {
      processedRecords,
      newRecords,
      errorRecords,
      totalRows: processedData.length,
    });

    // Use all processed data without deduplication
    const finalData = processedData;

    // Clear existing cache data if force sync or if we have new data
    if (forceSync || finalData.length > 0) {
      console.log("🗑️ Clearing existing cache data...");
      const { error: deleteError } = await supabase
        .from("designer_mockups_cache")
        .delete()
        .gte("id", "00000000-0000-0000-0000-000000000000"); // Delete all records

      if (deleteError) {
        console.error("❌ Error clearing cache:", deleteError);
        throw new Error("Failed to clear existing cache data");
      }
      console.log("✅ Cache cleared successfully");
    }

    // Insert new data in batches
    if (finalData.length > 0) {
      console.log("💾 Inserting new data to cache...");
      const batchSize = 100;
      let insertedRecords = 0;

      for (let i = 0; i < finalData.length; i += batchSize) {
        const batch = finalData.slice(i, i + batchSize);

        console.log("💾 Inserting batch:", {
          batchNumber: i / batchSize + 1,
          batchSize: batch.length,
          sampleRecord: batch[0],
        });

        // Insert batch (cache was cleared, so no duplicates expected)
        const { error: insertError } = await supabase
          .from("designer_mockups_cache")
          .insert(batch);

        if (insertError) {
          console.error("❌ Error inserting batch:", insertError);
          console.error("❌ Failed batch data:", batch[0]);
          throw new Error(
            `Failed to insert batch ${i / batchSize + 1}: ${
              insertError.message
            }`
          );
        }

        insertedRecords += batch.length;
        console.log(
          `✅ Inserted batch ${i / batchSize + 1}/${Math.ceil(
            finalData.length / batchSize
          )} (${insertedRecords}/${finalData.length} records)`
        );
      }
    }

    // Update sync log with success
    const syncDuration = Math.round((Date.now() - syncStartTime) / 1000);
    await supabase
      .from("designer_mockups_sync_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: syncDuration,
        total_records: rawData.length,
        processed_records: processedRecords,
        new_records: newRecords,
        error_records: errorRecords,
      })
      .eq("id", syncLogId);

    console.log("✅ Sync completed successfully:", {
      duration: syncDuration,
      totalRecords: rawData.length,
      processedRecords,
      newRecords,
      errorRecords,
    });

    return NextResponse.json({
      success: true,
      message: "Designer mockups sync completed successfully",
      syncStats: {
        totalRecords: rawData.length,
        processedRecords,
        newRecords,
        errorRecords,
        duration: syncDuration,
      },
      data:
        finalData.length > 0 ? "Data cached successfully" : "No data to cache",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in POST designer mockups cache:", error);

    // Update sync log with error
    if (syncLogId) {
      const supabase = createSupabaseServerForCache();
      const syncDuration = Math.round((Date.now() - syncStartTime) / 1000);

      await supabase
        .from("designer_mockups_sync_log")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_seconds: syncDuration,
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          error_details: {
            error: error instanceof Error ? error.stack : error,
          },
        })
        .eq("id", syncLogId);
    }

    return NextResponse.json(
      {
        error: "Failed to sync designer mockups data",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    syncInProgress = false;
  }
}
