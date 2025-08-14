"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";

interface PeriodSelectorProps {
  period: number;
  useCustomPeriod: boolean;
  dateRange?: DateRange;
  onPeriodChange: (period: number) => void;
  onDateRangeChange: (range: DateRange | undefined) => void;
  showLabel?: boolean;
  className?: string;
}

export default function PeriodSelector({
  period,
  useCustomPeriod,
  dateRange,
  onPeriodChange,
  onDateRangeChange,
  showLabel = false,
  className = "",
}: PeriodSelectorProps) {
  return (
    <div className={`flex flex-col lg:flex-row gap-2 lg:gap-4 lg:items-center ${className}`}>
      {showLabel && (
        <Label className="text-sm font-medium">Período:</Label>
      )}
      
      {/* 3 botões de período */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <Button
          variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
          onClick={() => onPeriodChange(30)}
          className="text-xs sm:text-sm"
        >
          Último mês
        </Button>
        <Button
          variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
          onClick={() => onPeriodChange(60)}
          className="text-xs sm:text-sm"
        >
          Últimos 2 meses
        </Button>
        <Button
          variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
          onClick={() => onPeriodChange(90)}
          className="text-xs sm:text-sm"
        >
          Últimos 3 meses
        </Button>
      </div>

      {/* Seletor de período personalizado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="w-full sm:min-w-[250px] lg:w-auto">
          <Calendar23
            value={dateRange}
            onChange={onDateRangeChange}
            hideLabel
          />
        </div>
      </div>
    </div>
  );
}
