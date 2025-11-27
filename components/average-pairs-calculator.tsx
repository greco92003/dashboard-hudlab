"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Calendar as CalendarIcon,
  Loader2,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { format, addDays, isWeekend, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DateRange } from "react-day-picker";

interface Holiday {
  date: string;
  name: string;
  type: string;
}

interface Deal {
  id: string;
  title: string;
  customField54: string | null; // Data de embarque
  quantidadePares: string | null;
}

interface AveragePairsCalculatorProps {
  deals: Deal[];
  activeCards: Set<string>;
}

export function AveragePairsCalculator({
  deals,
  activeCards,
}: AveragePairsCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [dailyLimit, setDailyLimit] = useState<string>("300");
  const [loading, setLoading] = useState(false);
  const [businessDays, setBusinessDays] = useState<number | null>(null);
  const [averagePairsPerDay, setAveragePairsPerDay] = useState<number | null>(
    null
  );
  const [totalPairsInPeriod, setTotalPairsInPeriod] = useState<number>(0);

  // Parse date from DD/MM/YYYY or YYYY-MM-DD format
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    try {
      if (dateStr.includes("-")) {
        // YYYY-MM-DD format
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(year, month - 1, day);
      } else {
        // DD/MM/YYYY format
        const [day, month, year] = dateStr.split("/").map(Number);
        return new Date(year, month - 1, day);
      }
    } catch {
      return null;
    }
  };

  const calculateBusinessDays = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error("Por favor, selecione um período");
      return;
    }

    setLoading(true);
    try {
      const startYear = dateRange.from.getFullYear();
      const endYear = dateRange.to.getFullYear();

      // Buscar feriados dos anos envolvidos
      const years = Array.from(new Set([startYear, endYear]));

      const holidaysPromises = years.map((year) =>
        fetch(`/api/holidays?year=${year}`).then((res) => res.json())
      );

      const holidaysArrays = await Promise.all(holidaysPromises);
      const allHolidays: Holiday[] = holidaysArrays.flat();

      // Criar um Set com as datas dos feriados para busca rápida
      const holidayDates = new Set(allHolidays.map((h) => h.date));

      // Calcular dias úteis no período
      let businessDaysCount = 0;
      let currentDate = new Date(dateRange.from);
      const endDate = new Date(dateRange.to);

      while (currentDate <= endDate) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const isHoliday = holidayDates.has(dateStr);
        const isWeekendDay = isWeekend(currentDate);

        if (!isWeekendDay && !isHoliday) {
          businessDaysCount++;
        }

        currentDate = addDays(currentDate, 1);
      }

      setBusinessDays(businessDaysCount);

      // Filtrar deals pela data de embarque dentro do período selecionado
      const filteredDeals = deals.filter((deal) => {
        if (!deal.customField54 || !activeCards.has(deal.id)) return false;

        const embarqueDate = parseDate(deal.customField54);
        if (!embarqueDate) return false;

        // Verificar se a data de embarque está dentro do período
        return (
          dateRange?.from &&
          dateRange?.to &&
          embarqueDate >= dateRange.from &&
          embarqueDate <= dateRange.to
        );
      });

      // Calcular total de pares no período
      const totalPairs = filteredDeals.reduce((sum, deal) => {
        const pairs = parseInt(deal.quantidadePares || "0");
        return sum + pairs;
      }, 0);

      setTotalPairsInPeriod(totalPairs);

      // Calcular média de pares por dia
      if (businessDaysCount > 0) {
        const average = totalPairs / businessDaysCount;
        setAveragePairsPerDay(average);
      } else {
        setAveragePairsPerDay(0);
      }

      toast.success("Cálculo realizado com sucesso!");
    } catch (error) {
      console.error("Erro ao calcular dias úteis:", error);
      toast.error("Erro ao calcular dias úteis. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange(undefined);
    setBusinessDays(null);
    setAveragePairsPerDay(null);
    setTotalPairsInPeriod(0);
  };

  // Export to PDF function
  const exportToPDF = () => {
    if (!dateRange?.from || !dateRange?.to || averagePairsPerDay === null) {
      toast.error("Por favor, calcule a média antes de exportar");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Add title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Média de Pares/Dia", 14, 15);

    // Add date range info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const dateRangeText = `Período: ${dateRange.from.toLocaleDateString(
      "pt-BR"
    )} - ${dateRange.to.toLocaleDateString("pt-BR")}`;
    doc.text(dateRangeText, 14, 22);

    // Add summary info with color indicator
    const limit = parseFloat(dailyLimit);
    const percentage = (averagePairsPerDay / limit) * 100;
    const statusColor = getStatusColor();

    let statusText = "";
    let statusColorRGB: [number, number, number] = [128, 128, 128];

    if (percentage > 100) {
      statusText = "ACIMA DO LIMITE";
      statusColorRGB = [220, 38, 38]; // Red
    } else if (percentage >= 90) {
      statusText = "PRÓXIMO DO LIMITE";
      statusColorRGB = [234, 179, 8]; // Yellow
    } else {
      statusText = "DENTRO DA CAPACIDADE";
      statusColorRGB = [34, 197, 94]; // Green
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...statusColorRGB);
    doc.text(`Status: ${statusText}`, 14, 29);
    doc.setTextColor(0, 0, 0); // Reset to black

    // Add metrics
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Dias Úteis no Período: ${businessDays}`, 14, 36);
    doc.text(
      `Total de Pares no Período: ${totalPairsInPeriod.toLocaleString()} pares`,
      14,
      41
    );
    doc.text(
      `Limite Diário de Produção: ${limit.toLocaleString()} pares`,
      14,
      46
    );
    doc.text(
      `Média de Pares por Dia Útil: ${averagePairsPerDay.toFixed(2)} pares`,
      14,
      51
    );

    const capacityAvailable = limit - averagePairsPerDay;
    doc.text(
      `Capacidade Disponível: ${capacityAvailable.toFixed(
        2
      )} pares/dia (${percentage.toFixed(1)}% utilizado)`,
      14,
      56
    );

    // Filter deals for the selected period
    const filteredDeals = deals.filter((deal) => {
      if (!deal.customField54 || !activeCards.has(deal.id)) return false;
      const embarqueDate = parseDate(deal.customField54);
      if (!embarqueDate) return false;
      return embarqueDate >= dateRange.from! && embarqueDate <= dateRange.to!;
    });

    // Prepare table data
    const tableData = filteredDeals.map((deal) => {
      let dataEmbarque = "-";
      if (deal.customField54) {
        if (deal.customField54.includes("-")) {
          const [year, month, day] = deal.customField54.split("-");
          dataEmbarque = `${day}/${month}/${year}`;
        } else {
          dataEmbarque = deal.customField54;
        }
      }

      return [
        deal.id,
        deal.title || "-",
        dataEmbarque,
        deal.quantidadePares || "0",
      ];
    });

    // Add table
    autoTable(doc, {
      head: [["ID do Deal", "Título", "Data de Embarque", "Qtd Pares"]],
      body: tableData,
      startY: 62,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: statusColorRGB,
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 30 }, // ID
        1: { cellWidth: 70 }, // Título
        2: { cellWidth: 35, halign: "center" }, // Data Embarque
        3: { cellWidth: 30, halign: "center" }, // Qtd Pares
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 62, left: 14, right: 14 },
    });

    // Add footer with page numbers
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        14,
        doc.internal.pageSize.getHeight() - 10
      );
    }

    // Save the PDF
    const fileName = `media_pares_dia_${
      new Date().toISOString().split("T")[0]
    }.pdf`;
    doc.save(fileName);
    toast.success("PDF exportado com sucesso!");
  };

  // Export to XLSX function
  const exportToXLSX = () => {
    if (!dateRange?.from || !dateRange?.to || averagePairsPerDay === null) {
      toast.error("Por favor, calcule a média antes de exportar");
      return;
    }

    const limit = parseFloat(dailyLimit);
    const percentage = (averagePairsPerDay / limit) * 100;
    const capacityAvailable = limit - averagePairsPerDay;

    let statusText = "";
    if (percentage > 100) {
      statusText = "ACIMA DO LIMITE";
    } else if (percentage >= 90) {
      statusText = "PRÓXIMO DO LIMITE";
    } else {
      statusText = "DENTRO DA CAPACIDADE";
    }

    // Filter deals for the selected period
    const filteredDeals = deals.filter((deal) => {
      if (!deal.customField54 || !activeCards.has(deal.id)) return false;
      const embarqueDate = parseDate(deal.customField54);
      if (!embarqueDate) return false;
      return embarqueDate >= dateRange.from! && embarqueDate <= dateRange.to!;
    });

    // Prepare summary data
    const summaryData = [
      ["RELATÓRIO DE MÉDIA DE PARES/DIA"],
      [],
      [
        "Período:",
        `${dateRange.from.toLocaleDateString(
          "pt-BR"
        )} - ${dateRange.to.toLocaleDateString("pt-BR")}`,
      ],
      ["Status:", statusText],
      [],
      ["MÉTRICAS"],
      ["Dias Úteis no Período:", businessDays],
      [
        "Total de Pares no Período:",
        `${totalPairsInPeriod.toLocaleString()} pares`,
      ],
      ["Limite Diário de Produção:", `${limit.toLocaleString()} pares`],
      [
        "Média de Pares por Dia Útil:",
        `${averagePairsPerDay.toFixed(2)} pares`,
      ],
      [
        "Capacidade Disponível:",
        `${capacityAvailable.toFixed(2)} pares/dia (${percentage.toFixed(
          1
        )}% utilizado)`,
      ],
      [],
      ["DEALS NO PERÍODO"],
    ];

    // Prepare deals data
    const dealsData = filteredDeals.map((deal) => {
      let dataEmbarque = "-";
      if (deal.customField54) {
        if (deal.customField54.includes("-")) {
          const [year, month, day] = deal.customField54.split("-");
          dataEmbarque = `${day}/${month}/${year}`;
        } else {
          dataEmbarque = deal.customField54;
        }
      }

      return {
        "ID do Deal": deal.id,
        Título: deal.title || "-",
        "Data de Embarque": dataEmbarque,
        "Quantidade de Pares": deal.quantidadePares || "0",
      };
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create summary worksheet
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths for summary
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 50 }];

    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

    // Create deals worksheet
    const wsDeals = XLSX.utils.json_to_sheet(dealsData);

    // Set column widths for deals
    wsDeals["!cols"] = [
      { wch: 30 }, // ID
      { wch: 50 }, // Título
      { wch: 20 }, // Data Embarque
      { wch: 20 }, // Qtd Pares
    ];

    XLSX.utils.book_append_sheet(wb, wsDeals, "Deals");

    // Save file
    const fileName = `media_pares_dia_${
      new Date().toISOString().split("T")[0]
    }.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success("Excel exportado com sucesso!");
  };

  // Determinar a cor do indicador baseado na média e no limite
  const getStatusColor = (): { bg: string; text: string; border: string } => {
    if (averagePairsPerDay === null || !dailyLimit) {
      return {
        bg: "bg-gray-50 dark:bg-gray-900/20",
        text: "text-gray-700 dark:text-gray-300",
        border: "border-gray-200 dark:border-gray-800",
      };
    }

    const limit = parseFloat(dailyLimit);
    const percentage = (averagePairsPerDay / limit) * 100;

    if (percentage > 100) {
      // Vermelho - acima do limite
      return {
        bg: "bg-red-50 dark:bg-red-900/20",
        text: "text-red-700 dark:text-red-300",
        border: "border-red-200 dark:border-red-800",
      };
    } else if (percentage >= 90) {
      // Amarelo - perto do limite (90% ou mais)
      return {
        bg: "bg-yellow-50 dark:bg-yellow-900/20",
        text: "text-yellow-700 dark:text-yellow-300",
        border: "border-yellow-200 dark:border-yellow-800",
      };
    } else {
      // Verde - abaixo do limite
      return {
        bg: "bg-green-50 dark:bg-green-900/20",
        text: "text-green-700 dark:text-green-300",
        border: "border-green-200 dark:border-green-800",
      };
    }
  };

  const statusColor = getStatusColor();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          className={cn(
            "p-3 rounded-lg border w-fit cursor-pointer hover:opacity-80 transition-colors",
            statusColor.bg,
            statusColor.border
          )}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className={cn("h-6 w-6", statusColor.text)} />
            <span className={cn("font-semibold text-sm", statusColor.text)}>
              Média de Pares/dia
            </span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Média de Pares/dia
          </DialogTitle>
          <DialogDescription>
            Calcule a média diária de pares a embarcar no período selecionado,
            considerando apenas dias úteis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Seletor de Período */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Período</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })}{" "}
                        - {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                    )
                  ) : (
                    <span>Selecione um período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  locale={ptBR}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Input de Limite Diário */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Limite Diário de Produção (pares)
            </label>
            <Input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="Ex: 300"
              min="0"
            />
          </div>

          {/* Total de Pares do Período - só mostra após calcular */}
          {totalPairsInPeriod > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Total de Pares no Período Selecionado:
              </p>
              <p className="text-2xl font-bold">
                {totalPairsInPeriod.toLocaleString()} pares
              </p>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-2">
            <Button
              onClick={calculateBusinessDays}
              disabled={!dateRange?.from || !dateRange?.to || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculando...
                </>
              ) : (
                "Calcular Média"
              )}
            </Button>
            <Button
              onClick={exportToPDF}
              disabled={averagePairsPerDay === null || loading}
              variant="outline"
              className="gap-2"
              title="Exportar PDF"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button
              onClick={exportToXLSX}
              disabled={averagePairsPerDay === null || loading}
              variant="outline"
              className="gap-2"
              title="Exportar Excel"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button onClick={handleReset} variant="outline" disabled={loading}>
              Limpar
            </Button>
          </div>

          {/* Resultado */}
          {averagePairsPerDay !== null && businessDays !== null && (
            <div
              className={cn(
                "rounded-lg border p-4 space-y-3",
                statusColor.bg,
                statusColor.border
              )}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Dias Úteis no Período:
                </p>
                <p className="text-lg font-semibold">{businessDays} dias</p>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Média de Pares por Dia Útil:
                </p>
                <p className={cn("text-2xl font-bold", statusColor.text)}>
                  {averagePairsPerDay.toFixed(1)} pares/dia
                </p>
              </div>

              {dailyLimit && parseFloat(dailyLimit) > 0 && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Capacidade Disponível:
                    </p>
                    <p
                      className={cn("text-lg font-semibold", statusColor.text)}
                    >
                      {(parseFloat(dailyLimit) - averagePairsPerDay).toFixed(1)}{" "}
                      pares/dia
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(
                        (averagePairsPerDay / parseFloat(dailyLimit)) *
                        100
                      ).toFixed(1)}
                      % da capacidade utilizada
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Informação adicional */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              • O cálculo considera apenas dias úteis (segunda a sexta-feira)
            </p>
            <p>• Feriados nacionais são excluídos do cálculo</p>
            <p>
              • <span className="text-green-600 font-semibold">Verde</span>:
              Abaixo de 90% da capacidade
            </p>
            <p>
              • <span className="text-yellow-600 font-semibold">Amarelo</span>:
              Entre 90% e 100% da capacidade
            </p>
            <p>
              • <span className="text-red-600 font-semibold">Vermelho</span>:
              Acima da capacidade diária
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
