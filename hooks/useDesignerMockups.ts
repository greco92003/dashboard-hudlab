import { useState, useCallback } from "react";
import { toast } from "sonner";

interface MockupData {
  nomeNegocio: string;
  etapaFunil: string;
  atualizadoEm: string;
  designer: string;
}

interface DesignerMockupStats {
  quantidadeNegocios: number;
  mockupsFeitos: number;
  alteracoesFeitas: number;
}

interface MockupsState {
  data: Record<string, DesignerMockupStats>;
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
}

export function useDesignerMockups() {
  const [state, setState] = useState<MockupsState>({
    data: {},
    loading: false,
    error: null,
    lastSync: null,
  });

  const normalizeDesignerName = useCallback((name: string): string => {
    if (!name) return "";

    const normalized = name.toLowerCase().trim();

    // Mapeamento específico para variações do Vítor
    const vitorVariations = ["vitor", "vítor", "vito"];
    if (vitorVariations.includes(normalized)) {
      return "vítor";
    }

    // Remover acentos para comparação geral
    return normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }, []);

  const findMatchingDesigner = useCallback(
    (sheetDesignerName: string, designersList: string[]): string | null => {
      const normalizedSheetName = normalizeDesignerName(sheetDesignerName);

      return (
        designersList.find((designer) => {
          const normalizedDesigner = normalizeDesignerName(designer);
          return normalizedDesigner === normalizedSheetName;
        }) || null
      );
    },
    [normalizeDesignerName]
  );

  const processSheetData = useCallback(
    (rawData: any[], designers: string[], startDate?: Date, endDate?: Date) => {
      const result: Record<string, DesignerMockupStats> = {};

      // Inicializar todos os designers com zeros
      designers.forEach((designer) => {
        result[designer] = {
          quantidadeNegocios: 0,
          mockupsFeitos: 0,
          alteracoesFeitas: 0,
        };
      });

      // Debug: Log do período de filtro
      console.log("🗓️ INÍCIO DO PROCESSAMENTO - Filtro de datas:", {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        startDateLocal: startDate?.toLocaleDateString("pt-BR"),
        endDateLocal: endDate?.toLocaleDateString("pt-BR"),
        totalRows: rawData.length,
        hasDateFilter: !!(startDate && endDate),
      });

      // Se não há filtro de data, processar tudo
      if (!startDate || !endDate) {
        console.log("⚠️ SEM FILTRO DE DATA - Processando todos os dados");
      } else {
        console.log("✅ COM FILTRO DE DATA - Aplicando filtro por período");
      }

      // Contadores para debug
      let processedRows = 0;
      let filteredByDate = 0;
      let validDesigners = 0;

      // Processar dados da planilha
      rawData.forEach((row, index) => {
        if (!row || typeof row !== "object") return;

        const nomeNegocio =
          row["Nome do Negócio"] || row["nome do negocio"] || "";
        const etapaFunil = row["Etapa do Funil"] || row["etapa do funil"] || "";

        // Tentar diferentes variações do nome da coluna de data
        const atualizadoEm =
          row["Atualizado em"] ||
          row["atualizado em"] ||
          row["Atualizado Em"] ||
          row["Data"] ||
          row["data"] ||
          row["Data de Atualização"] ||
          row["data de atualizacao"] ||
          "";

        const designer = row["Designer"] || row["designer"] || "";

        // Debug: mostrar todas as chaves disponíveis para a primeira linha
        if (index === 0) {
          console.log("🔍 CHAVES DISPONÍVEIS NA LINHA 1:", Object.keys(row));
          console.log("🔍 VALORES DA LINHA 1:", row);
        }

        // Debug: Log das primeiras 3 linhas para verificar formato
        if (index < 3) {
          console.log(`📊 Linha ${index + 1}:`, {
            nomeNegocio,
            etapaFunil,
            atualizadoEm,
            designer,
            rawRow: row,
          });
        }

        // Filtrar por data se fornecida
        if (startDate && endDate && atualizadoEm) {
          console.log(`🔍 Linha ${index + 1} - Processando data:`, {
            atualizadoEm,
            tipo: typeof atualizadoEm,
            startDate: startDate.toLocaleDateString("pt-BR"),
            endDate: endDate.toLocaleDateString("pt-BR"),
          });

          // Converter string de data do Google Sheets para Date
          let dataAtualizada: Date | null = null;

          if (typeof atualizadoEm === "string" && atualizadoEm.trim()) {
            const dateStr = atualizadoEm.trim();

            // Google Sheets pode retornar datas em vários formatos
            // Vamos tentar os mais comuns:

            // 1. MM/DD/YYYY (formato americano padrão do Google Sheets)
            if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
              const [month, day, year] = dateStr.split("/");
              dataAtualizada = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day)
              );
              console.log(
                `📅 Formato MM/DD/YYYY detectado: ${dateStr} -> ${dataAtualizada.toLocaleDateString(
                  "pt-BR"
                )}`
              );
            }
            // 2. DD/MM/YYYY (formato brasileiro)
            else if (
              dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) &&
              dateStr.includes("/")
            ) {
              // Tentar como brasileiro se o americano não fez sentido
              const [day, month, year] = dateStr.split("/");
              const testDate = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day)
              );
              if (!isNaN(testDate.getTime())) {
                dataAtualizada = testDate;
                console.log(
                  `📅 Formato DD/MM/YYYY detectado: ${dateStr} -> ${dataAtualizada.toLocaleDateString(
                    "pt-BR"
                  )}`
                );
              }
            }
            // 3. YYYY-MM-DD (formato ISO)
            else if (dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
              dataAtualizada = new Date(dateStr);
              console.log(
                `📅 Formato ISO detectado: ${dateStr} -> ${dataAtualizada.toLocaleDateString(
                  "pt-BR"
                )}`
              );
            }
            // 4. Outros formatos - tentar parsing direto
            else {
              dataAtualizada = new Date(dateStr);
              console.log(
                `📅 Parsing direto: ${dateStr} -> ${dataAtualizada.toLocaleDateString(
                  "pt-BR"
                )}`
              );
            }
          }

          // Validar se a data foi convertida corretamente
          if (!dataAtualizada || isNaN(dataAtualizada.getTime())) {
            console.log(
              `❌ Data inválida na linha ${index + 1}: "${atualizadoEm}"`
            );
            return;
          }

          // Normalizar datas para comparação (apenas data, sem hora)
          const dataComparacao = new Date(
            dataAtualizada.getFullYear(),
            dataAtualizada.getMonth(),
            dataAtualizada.getDate()
          );
          const inicioComparacao = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate()
          );
          const fimComparacao = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate()
          );

          console.log(`🔍 Comparação de datas linha ${index + 1}:`, {
            dataOriginal: atualizadoEm,
            dataConvertida: dataComparacao.toLocaleDateString("pt-BR"),
            inicio: inicioComparacao.toLocaleDateString("pt-BR"),
            fim: fimComparacao.toLocaleDateString("pt-BR"),
            dentroDoRange:
              dataComparacao >= inicioComparacao &&
              dataComparacao <= fimComparacao,
          });

          // Aplicar filtro de data
          if (
            dataComparacao < inicioComparacao ||
            dataComparacao > fimComparacao
          ) {
            console.log(`🚫 Linha ${index + 1} FILTRADA - Fora do período`);
            filteredByDate++;
            return;
          }

          console.log(`✅ Linha ${index + 1} PASSOU no filtro de data`);
        } else {
          console.log(`⚠️ Linha ${index + 1} - Sem filtro de data aplicado`);
        }

        processedRows++;

        // Encontrar designer correspondente usando normalização
        const matchingDesigner = findMatchingDesigner(designer, designers);

        if (!matchingDesigner) {
          console.log(
            `⚠️ Designer não encontrado: "${designer}" (normalizado: "${normalizeDesignerName(
              designer
            )}")`
          );
          return;
        }

        if (!nomeNegocio || !etapaFunil) return;

        validDesigners++;
        const stats = result[matchingDesigner];

        // Contar negócios únicos (vamos usar um Set temporário)
        if (!stats.hasOwnProperty("_negocios")) {
          (stats as any)._negocios = new Set();
        }
        (stats as any)._negocios.add(nomeNegocio);

        // Contar mockups e alterações
        if (etapaFunil.toLowerCase().includes("mockup feito")) {
          stats.mockupsFeitos++;
        } else if (etapaFunil.toLowerCase().includes("alteração")) {
          stats.alteracoesFeitas++;
        }
      });

      // Converter Sets para números
      Object.keys(result).forEach((designer) => {
        const stats = result[designer];
        if ((stats as any)._negocios) {
          stats.quantidadeNegocios = (stats as any)._negocios.size;
          delete (stats as any)._negocios;
        }
      });

      // Debug: Log do resultado final
      console.log("📈 Estatísticas do processamento:", {
        totalRows: rawData.length,
        processedRows,
        filteredByDate,
        validDesigners,
        result,
      });

      return result;
    },
    [findMatchingDesigner]
  );

  const fetchMockupsData = useCallback(
    async (designers: string[], startDate?: Date, endDate?: Date) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        console.log("🔍 HOOK - Fetching mockups data from Google Sheets...");
        console.log("🔍 HOOK - Parameters:", {
          designers,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          startDateLocal: startDate?.toLocaleDateString("pt-BR"),
          endDateLocal: endDate?.toLocaleDateString("pt-BR"),
        });

        const response = await fetch("/api/google-sheets/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            spreadsheetId:
              process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID ||
              "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
            range: "Mockups Feitos!A1:Z1000",
            includeHeaders: true,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || result.details || "Erro ao buscar dados da planilha"
          );
        }

        console.log("📊 HOOK - Raw sheet data received:", {
          success: result.success,
          dataLength: result.data?.data?.length || 0,
          metadata: result.metadata,
          firstFewRows: result.data?.data?.slice(0, 5),
        });

        // Log específico para analisar as datas
        console.log("🔍 ANÁLISE DE DATAS DA PLANILHA:");
        result.data?.data?.slice(0, 10).forEach((row: any, index: number) => {
          console.log(`Linha ${index + 1}:`, {
            "Nome do Negócio": row["Nome do Negócio"],
            "Etapa do Funil": row["Etapa do Funil"],
            "Atualizado em": row["Atualizado em"],
            Designer: row["Designer"],
            "Tipo da data": typeof row["Atualizado em"],
            "Valor exato": JSON.stringify(row["Atualizado em"]),
          });
        });

        // Log dos parâmetros de filtro antes do processamento
        console.log("🎯 PARÂMETROS DE FILTRO ENVIADOS PARA PROCESSAMENTO:", {
          designers,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          startDateLocal: startDate?.toLocaleDateString("pt-BR"),
          endDateLocal: endDate?.toLocaleDateString("pt-BR"),
          hasStartDate: !!startDate,
          hasEndDate: !!endDate,
          willFilterByDate: !!(startDate && endDate),
        });

        // Processar dados
        const processedData = processSheetData(
          result.data.data || [],
          designers,
          startDate,
          endDate
        );

        setState((prev) => ({
          ...prev,
          data: processedData,
          loading: false,
          lastSync: new Date(),
        }));

        toast.success("Dados de mockups sincronizados com sucesso!");
        return processedData;
      } catch (error) {
        console.error("❌ Error fetching mockups data:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";

        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));

        toast.error(`Erro ao sincronizar mockups: ${errorMessage}`);
        throw error;
      }
    },
    [processSheetData]
  );

  const syncMockups = useCallback(
    async (designers: string[], startDate?: Date, endDate?: Date) => {
      return fetchMockupsData(designers, startDate, endDate);
    },
    [fetchMockupsData]
  );

  return {
    ...state,
    syncMockups,
    fetchMockupsData,
  };
}
