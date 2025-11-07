"use client";

import { useState } from "react";
import { Calculator, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { format, addDays, isWeekend } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Holiday {
  date: string;
  name: string;
  type: string;
}

export function BusinessDaysCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [resultDate, setResultDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const calculateBusinessDays = async () => {
    if (!selectedDate) {
      toast.error("Por favor, selecione uma data");
      return;
    }

    setLoading(true);
    try {
      const year = selectedDate.getFullYear();

      // Buscar feriados do ano selecionado
      const response = await fetch(`/api/holidays?year=${year}`);

      if (!response.ok) {
        throw new Error("Erro ao buscar feriados");
      }

      const holidaysData: Holiday[] = await response.json();
      setHolidays(holidaysData);

      // Criar um Set com as datas dos feriados para busca rápida
      const holidayDates = new Set(holidaysData.map((h) => h.date));

      // Calcular 15 dias úteis
      let businessDaysCount = 0;
      let currentDate = new Date(selectedDate);

      while (businessDaysCount < 15) {
        currentDate = addDays(currentDate, 1);

        // Verificar se não é fim de semana e não é feriado
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const isHoliday = holidayDates.has(dateStr);
        const isWeekendDay = isWeekend(currentDate);

        if (!isWeekendDay && !isHoliday) {
          businessDaysCount++;
        }
      }

      setResultDate(currentDate);
      toast.success("Cálculo realizado com sucesso!");
    } catch (error) {
      console.error("Erro ao calcular dias úteis:", error);
      toast.error("Erro ao calcular dias úteis. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedDate(undefined);
    setResultDate(null);
    setHolidays([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 w-fit cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
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
            <Calculator className="h-6 w-6 text-green-600" />
            <span className="font-semibold text-green-800 dark:text-green-200 text-sm">
              Calculadora de Dias Úteis
            </span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculadora de Dias Úteis
          </DialogTitle>
          <DialogDescription>
            Selecione uma data inicial e calcule 15 dias úteis a partir dela,
            considerando finais de semana e feriados nacionais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Seletor de Data */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Data Inicial</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })
                  ) : (
                    <span>Selecione uma data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-2">
            <Button
              onClick={calculateBusinessDays}
              disabled={!selectedDate || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculando...
                </>
              ) : (
                "Calcular 15 Dias Úteis"
              )}
            </Button>
            <Button onClick={handleReset} variant="outline" disabled={loading}>
              Limpar
            </Button>
          </div>

          {/* Resultado */}
          {resultDate && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Data Inicial:
                </p>
                <p className="text-lg font-semibold">
                  {selectedDate &&
                    format(selectedDate, "dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })}
                </p>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Após 15 dias úteis:
                </p>
                <p className="text-lg font-semibold text-primary">
                  {format(resultDate, "dd 'de' MMMM 'de' yyyy", {
                    locale: ptBR,
                  })}
                </p>
              </div>

              {holidays.length > 0 && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {holidays.length} feriado(s) considerado(s) no período
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
            <p>• Finais de semana não são contabilizados</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
