"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FinancialPayable } from "@/lib/tiny/types";

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<FinancialPayable["status"], string> = {
  open: "Em aberto",
  paid: "Pago",
  partial: "Parcial",
  overdue: "Vencido",
  canceled: "Cancelado",
};

const STATUS_VARIANT: Record<
  FinancialPayable["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  paid: "default",
  partial: "outline",
  overdue: "destructive",
  canceled: "outline",
};

interface AccountsPayableTableProps {
  data?: FinancialPayable[];
  loading?: boolean;
}

export function AccountsPayableTable({ data, loading }: AccountsPayableTableProps) {
  if (loading || !data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Nenhuma conta a pagar no período.
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vencimento</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{row.dueDate}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell>{row.supplier?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.category?.name ?? "Sem categoria"}</Badge>
              </TableCell>
              <TableCell className="text-right font-medium">{fmt(row.amount)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status]}>
                  {STATUS_LABELS[row.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
