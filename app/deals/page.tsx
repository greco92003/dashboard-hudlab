"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, FileDown } from "lucide-react";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { SyncChecker } from "@/components/ui/sync-checker";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { normalizeSellerName } from "@/lib/utils/normalize-names";
import {
  EditableDealCell,
  type DealFieldsUpdate,
} from "@/components/deals/editable-deal-cell";
import {
  DEAL_EDITABLE_FIELDS,
  tipoDoFrete,
  type DealEditableColumn,
} from "@/lib/ghl/deal-fields";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Define the deal type based on the new API response structure
interface Deal {
  deal_id: string;
  title: string;
  value: number;
  currency: string;
  status: string | null;
  stage_id: string | null;
  closing_date: string | null;
  created_date: string | null;
  custom_field_value: string | null; // Field ID 5 (Data Fechamento)
  custom_field_id: string | null;
  estado: string | null; // Field ID 25
  "quantidade-de-pares": string | null; // Field ID 39
  vendedor: string | null; // Field ID 45
  designer: string | null; // Field ID 47
  "utm-source": string | null; // Field ID 49 (UTM Source)
  "utm-medium": string | null; // Deal custom field ID 50 (UTM Medium)
  data_embarque: string | null; // GHL "Data de Embarque", dd/mm/aaaa
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
  segmento_de_negocio: string | null; // Contact field ID 7 (Segmento de Negócio)
  intencao_de_compra: string | null; // Contact field ID 50 (Intenção de Compra)
  ghl_condio_de_frete: string | null; // GHL "Condição de Frete"
  ghl_valor_do_frete_pago_hud_lab: string | null;
  ghl_valor_do_frete_pago_cliente: string | null;
}

/** Quem pagou o frete: Condição do GHL ou deduzido pelo valor (ver tipoDoFrete). */
function tipoFreteDoNegocio(deal: Deal) {
  return tipoDoFrete(
    deal.ghl_condio_de_frete,
    deal.ghl_valor_do_frete_pago_hud_lab,
    deal.ghl_valor_do_frete_pago_cliente,
  );
}

/** Campo de valor que corresponde a quem pagou o frete. */
function campoValorFrete(deal: Deal) {
  const tipo = tipoFreteDoNegocio(deal);
  if (tipo === "gratis") return "ghl_valor_do_frete_pago_hud_lab" as const;
  if (tipo === "cliente") return "ghl_valor_do_frete_pago_cliente" as const;
  return null;
}

function valorFrete(deal: Deal): number | null {
  const campo = campoValorFrete(deal);
  const valor = campo ? Number(deal[campo]) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** dd/mm/aaaa -> aaaa-mm-dd, para ordenar; vazio vai para o fim. */
function embarqueIso(valor: string | null) {
  const partes = valor?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return "9999";
  return `${partes[3]}-${partes[2].padStart(2, "0")}-${partes[1].padStart(2, "0")}`;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("won");

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
    getApiUrl,
  } = useGlobalDateRange();

  // Helper function to format date as local YYYY-MM-DD without timezone conversion
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Função para converter string ISO para Date
  const parseISODate = (isoString: string): Date => {
    const datePart = isoString.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Valores já usados em cada coluna editável, sugeridos ao preencher.
  const sugestoes = useMemo(() => {
    const porColuna = {} as Record<DealEditableColumn, string[]>;
    for (const column of Object.keys(DEAL_EDITABLE_FIELDS) as DealEditableColumn[]) {
      const valores = new Set<string>();
      for (const deal of deals) {
        const valor = deal[column];
        if (typeof valor === "string" && valor.trim()) valores.add(valor.trim());
      }
      porColuna[column] = [...valores].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return porColuna;
  }, [deals]);

  const aplicarEdicao = useCallback((update: DealFieldsUpdate) => {
    setDeals((atual) =>
      atual.map((deal) =>
        deal.deal_id === update.deal_id ? { ...deal, ...update } : deal,
      ),
    );
  }, []);

  // Campo vazio vira célula editável que grava no card do GHL.
  const celulaEditavel = (
    deal: Deal,
    column: DealEditableColumn,
    exibir: (valor: string) => ReactNode = (valor) => valor,
  ) => {
    const valor = deal[column];
    if (valor === null || valor === undefined || String(valor).trim() === "") {
      return (
        <EditableDealCell
          dealId={deal.deal_id}
          column={column}
          suggestions={sugestoes[column]}
          onSaved={aplicarEdicao}
        />
      );
    }
    return exibir(String(valor));
  };

  const cabecalhoOrdenavel = (
    column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" },
    rotulo: string,
  ) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className="px-0"
    >
      {rotulo}
      {column.getIsSorted() === "asc" ? (
        <ArrowUp className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === "desc" ? (
        <ArrowDown className="ml-2 h-4 w-4" />
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );

  // Define columns for the data table
  const columns: ColumnDef<Deal>[] = [
    {
      accessorKey: "title",
      // Fica preso à esquerda: rolando até as últimas colunas, ainda se vê de qual negócio é a linha.
      meta: { sticky: true },
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Título
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => (
        // Estreito em tela pequena: fixo à esquerda, não pode cobrir a última coluna.
        <div
          className="max-w-[120px] truncate sm:max-w-[180px] xl:max-w-[240px]"
          title={row.original.title}
        >
          {row.original.title}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Status
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const status = row.original.status?.toLowerCase();
        let badgeColor = "bg-gray-100 text-gray-800";
        let statusText = "Desconhecido";

        if (status === "won" || status === "1") {
          badgeColor = "bg-green-100 text-green-800";
          statusText = "Ganho";
        } else if (status === "open" || status === "0") {
          badgeColor = "bg-blue-100 text-blue-800";
          statusText = "Em Andamento";
        } else if (status === "lost" || status === "2") {
          badgeColor = "bg-red-100 text-red-800";
          statusText = "Perdido";
        }

        return (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${badgeColor}`}
          >
            {statusText}
          </span>
        );
      },
    },
    {
      accessorKey: "value",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Valor
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        // Divide by 100 to get real values and always use R$
        const value = (row.original.value || 0) / 100;
        return formatCurrency(value, "BRL");
      },
    },
    {
      accessorKey: "created_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Criação
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const createdDate = row.original.created_date;
        if (!createdDate) return "-";

        try {
          const date = parseISODate(createdDate);
          return date.toLocaleDateString("pt-BR");
        } catch {
          return "-";
        }
      },
    },
    {
      accessorKey: "closing_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Fechamento
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const closingDate = row.original.closing_date;
        if (!closingDate) return "-";

        try {
          const date = parseISODate(closingDate);
          return date.toLocaleDateString("pt-BR");
        } catch {
          return "-";
        }
      },
    },
    {
      accessorKey: "data_embarque",
      // O GHL guarda dd/mm/aaaa; ordenar o texto misturaria os meses.
      sortingFn: (a, b) =>
        embarqueIso(a.original.data_embarque).localeCompare(
          embarqueIso(b.original.data_embarque),
        ),
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Embarque
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "data_embarque"),
    },
    {
      accessorKey: "estado",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            UF
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "estado"),
    },
    {
      accessorKey: "quantidade-de-pares",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Pares
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "quantidade-de-pares"),
    },
    {
      // Só preenchimento: quem pagou o frete. Condição em branco é deduzida
      // pelo valor já preenchido (sem gravar nada no GHL).
      id: "frete_tipo",
      accessorFn: (deal) => tipoFreteDoNegocio(deal) ?? "",
      header: ({ column }) => cabecalhoOrdenavel(column, "Frete"),
      cell: ({ row }) => {
        const deal = row.original;
        const tipo = tipoFreteDoNegocio(deal);
        if (!tipo) return celulaEditavel(deal, "ghl_condio_de_frete");
        const deduzido = !deal.ghl_condio_de_frete?.trim();
        return (
          <span title={deduzido ? "Deduzido pelo valor do frete preenchido" : undefined}>
            {tipo === "gratis" ? "Grátis" : "Cliente"}
          </span>
        );
      },
    },
    {
      id: "frete_valor",
      accessorFn: (deal) => valorFrete(deal) ?? -1,
      header: ({ column }) => cabecalhoOrdenavel(column, "Valor do frete"),
      cell: ({ row }) => {
        const deal = row.original;
        const valor = valorFrete(deal);
        if (valor != null) return formatCurrency(valor, "BRL");
        const campo = campoValorFrete(deal);
        if (!campo) {
          return (
            <span className="text-muted-foreground" title="Defina antes quem pagou o frete">
              -
            </span>
          );
        }
        // R$ 0 conta como vazio: é o que a equipe grava no lado de quem não pagou.
        return (
          <EditableDealCell
            dealId={deal.deal_id}
            column={campo}
            suggestions={[]}
            onSaved={aplicarEdicao}
          />
        );
      },
    },
    {
      accessorKey: "vendedor",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Vendedor
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) =>
        celulaEditavel(row.original, "vendedor", normalizeSellerName),
    },
    {
      accessorKey: "designer",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Designer
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "designer"),
    },
    {
      accessorKey: "utm-source",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            UTM Source
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "utm-source"),
    },
    {
      accessorKey: "utm-medium",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            UTM Medium
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "utm-medium"),
    },
    {
      accessorKey: "segmento_de_negocio",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Segmento de Negócio
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "segmento_de_negocio"),
    },
    {
      accessorKey: "intencao_de_compra",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Intenção de Compra
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => celulaEditavel(row.original, "intencao_de_compra"),
    },
  ];

  // Fetch deals data based on the selected period or custom date range using cached data
  const fetchDeals = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      setLoading(true);
      try {
        let url = "/api/deals-cache";

        if (customDateRange?.from && customDateRange?.to) {
          // Use custom date range - format as local date to avoid timezone issues
          const startDate = formatDateToLocal(customDateRange.from);
          const endDate = formatDateToLocal(customDateRange.to);
          console.log("Deals: Custom date range selected:", {
            originalFrom: customDateRange.from,
            originalTo: customDateRange.to,
            formattedStart: startDate,
            formattedEnd: endDate,
          });
          url = `/api/deals-cache?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          // Use period-based filtering
          url = `/api/deals-cache?period=${selectedPeriod}`;
        }

        // Force fresh data - bypass all caches (Service Worker, HTTP cache, etc.)
        // Add timestamp to URL to prevent cache hits
        const cacheBuster = `_t=${Date.now()}`;
        const urlWithCacheBuster = url.includes("?")
          ? `${url}&${cacheBuster}`
          : `${url}?${cacheBuster}`;

        const response = await fetch(urlWithCacheBuster, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.deals) {
          setDeals(data.deals);

          // Calculate total value - divide by 100 to get real values
          const total = data.deals.reduce((sum: number, item: Deal) => {
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);
        } else {
          setDeals([]);
          setTotalValue(0);
        }
      } catch (error) {
        console.error("Error fetching deals:", error);
        setDeals([]);
        setTotalValue(0);

        // Show user-friendly error message
        // You could add a toast notification here
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
  };

  // Export to PDF function
  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Add title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Negócios", 14, 15);

    // Add date range info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let dateRangeText = "";
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      dateRangeText = `Período: ${dateRange.from.toLocaleDateString(
        "pt-BR",
      )} - ${dateRange.to.toLocaleDateString("pt-BR")}`;
    } else {
      dateRangeText = `Período: Últimos ${period} dias`;
    }
    doc.text(dateRangeText, 14, 22);

    // Add status filter info
    const statusText =
      statusFilter === "won"
        ? "Status: Ganhos"
        : statusFilter === "open"
          ? "Status: Em Andamento"
          : "Status: Perdidos";
    doc.text(statusText, 14, 27);

    // Add total value
    doc.setFont("helvetica", "bold");
    doc.text(
      `Valor Total: ${formatCurrency(filteredTotalValue, "BRL")}`,
      14,
      32,
    );

    // Prepare table data
    const tableData = filteredDeals.map((deal) => {
      const status = deal.status?.toLowerCase();
      let statusText = "Desconhecido";
      if (status === "won" || status === "1") statusText = "Ganho";
      else if (status === "open" || status === "0") statusText = "Em Andamento";
      else if (status === "lost" || status === "2") statusText = "Perdido";

      // Format dates
      const createdDate = deal.created_date
        ? parseISODate(deal.created_date).toLocaleDateString("pt-BR")
        : "-";
      const closingDate = deal.closing_date
        ? parseISODate(deal.closing_date).toLocaleDateString("pt-BR")
        : "-";

      const dataEmbarque = deal.data_embarque || "-";

      return [
        deal.deal_id,
        deal.title,
        statusText,
        formatCurrency((deal.value || 0) / 100, "BRL"),
        createdDate,
        closingDate,
        dataEmbarque,
        deal.estado || "-",
        deal["quantidade-de-pares"] || "-",
        deal.vendedor ? normalizeSellerName(deal.vendedor) : "-",
        deal.designer || "-",
      ];
    });

    // Add table
    autoTable(doc, {
      head: [
        [
          "ID",
          "Título",
          "Status",
          "Valor",
          "Data Criação",
          "Data Fechamento",
          "Data Embarque",
          "Estado",
          "Qtd Pares",
          "Vendedor",
          "Designer",
        ],
      ],
      body: tableData,
      startY: 37,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 20 }, // ID
        1: { cellWidth: 40 }, // Título
        2: { cellWidth: 25 }, // Status
        3: { cellWidth: 25 }, // Valor
        4: { cellWidth: 22 }, // Data Criação
        5: { cellWidth: 22 }, // Data Fechamento
        6: { cellWidth: 22 }, // Data Embarque
        7: { cellWidth: 20 }, // Estado
        8: { cellWidth: 18 }, // Qtd Pares
        9: { cellWidth: 25 }, // Vendedor
        10: { cellWidth: 25 }, // Designer
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 37, left: 14, right: 14 },
    });

    // Add footer with page numbers
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" },
      );
      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        14,
        doc.internal.pageSize.getHeight() - 10,
      );
    }

    // Save the PDF
    const fileName = `negocios_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  // Initial data fetch using global date state
  useEffect(() => {
    const initializeData = async () => {
      // Only fetch data after hydration is complete
      if (!isHydrated) {
        console.log("⏳ Deals: Waiting for hydration...");
        return;
      }

      console.log("✅ Deals: Hydrated, fetching data...", {
        useCustomPeriod,
        period,
        dateRange,
      });

      if (!useCustomPeriod) {
        await fetchDeals(period);
      } else {
        await fetchDeals(period, dateRange);
      }
    };

    initializeData();
  }, [period, useCustomPeriod, dateRange, fetchDeals, isHydrated]);

  // Function to refresh deals data
  const refreshDealsData = useCallback(() => {
    console.log("🔄 Deals: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
    } else {
      fetchDeals(period);
    }
  }, [useCustomPeriod, dateRange, period, fetchDeals]);

  // Register this page for automatic refresh after sync
  useDataRefresh("deals", refreshDealsData);

  // Filter deals based on status
  const filteredDeals = deals.filter((deal) => {
    const status = deal.status?.toLowerCase();

    if (statusFilter === "won") {
      return status === "won" || status === "1";
    } else if (statusFilter === "open") {
      return status === "open" || status === "0";
    } else if (statusFilter === "lost") {
      return status === "lost" || status === "2";
    }

    return false;
  });

  // Calculate filtered total value
  const filteredTotalValue = filteredDeals.reduce((sum, deal) => {
    return sum + (deal.value || 0) / 100;
  }, 0);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">Negócios</h1>
        <Button
          onClick={exportToPDF}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      <div className="flex flex-col gap-4 mb-4 mt-2">
        {/* Period Buttons - Stack on mobile, horizontal on larger screens */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Button
            variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(30)}
            className="w-full sm:w-auto"
          >
            Último mês
          </Button>
          <Button
            variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(60)}
            className="w-full sm:w-auto"
          >
            Últimos 2 meses
          </Button>
          <Button
            variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(90)}
            className="w-full sm:w-auto"
          >
            Últimos 3 meses
          </Button>
        </div>

        {/* Calendar Section - Stack on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <Label className="text-sm sm:text-base whitespace-nowrap">
            Selecione o período desejado:
          </Label>
          <div className="w-full sm:min-w-[250px] sm:w-auto">
            <Calendar23
              value={dateRange}
              onChange={handleDateRangeChangeLocal}
              hideLabel
            />
          </div>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Label className="text-sm sm:text-base whitespace-nowrap self-start sm:self-center">
            Filtrar por Status:
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={statusFilter === "won" ? "default" : "outline"}
              onClick={() => setStatusFilter("won")}
              size="sm"
              className={
                statusFilter === "won"
                  ? ""
                  : "border-green-500 text-green-700 hover:bg-green-50"
              }
            >
              Ganhos (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "won" || d.status === "1",
                ).length
              }
              )
            </Button>
            <Button
              variant={statusFilter === "open" ? "default" : "outline"}
              onClick={() => setStatusFilter("open")}
              size="sm"
              className={
                statusFilter === "open"
                  ? ""
                  : "border-blue-500 text-blue-700 hover:bg-blue-50"
              }
            >
              Em Andamento (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "open" || d.status === "0",
                ).length
              }
              )
            </Button>
            <Button
              variant={statusFilter === "lost" ? "default" : "outline"}
              onClick={() => setStatusFilter("lost")}
              size="sm"
              className={
                statusFilter === "lost"
                  ? ""
                  : "border-red-500 text-red-700 hover:bg-red-50"
              }
            >
              Perdidos (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "lost" || d.status === "2",
                ).length
              }
              )
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter === "won"
              ? "Faturamento Total (Ganhos)"
              : statusFilter === "open"
                ? "Valor Total (Em Andamento)"
                : "Valor Total (Perdidos)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-[200px]" />
          ) : (
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                {formatCurrency(filteredTotalValue, "BRL")}
              </p>
              <p className="text-sm text-muted-foreground">
                {filteredDeals.length} de {deals.length} negócios
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <DataTable columns={columns} data={filteredDeals} />
      )}

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
