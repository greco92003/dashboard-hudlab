"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export type FinancialFilterState = {
  startDate: string;
  endDate: string;
  status: string;
  granularity: "day" | "week" | "month";
};

interface FinancialFiltersProps {
  filters: FinancialFilterState;
  onChange: (filters: FinancialFilterState) => void;
  onReset: () => void;
}

export function FinancialFilters({ filters, onChange, onReset }: FinancialFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fd-start">Data início</Label>
        <Input
          id="fd-start"
          type="date"
          value={filters.startDate}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fd-end">Data fim</Label>
        <Input
          id="fd-end"
          type="date"
          value={filters.endDate}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Status</Label>
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Em aberto</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
            <SelectItem value="paid">Pago / Recebido</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Granularidade</Label>
        <Select
          value={filters.granularity}
          onValueChange={(v) =>
            onChange({ ...filters, granularity: v as FinancialFilterState["granularity"] })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Dia</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" onClick={onReset} className="h-9 gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" />
        Resetar
      </Button>
    </div>
  );
}
