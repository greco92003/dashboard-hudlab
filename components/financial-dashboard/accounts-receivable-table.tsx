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
import type { FinancialReceivable } from "@/lib/tiny/types";

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Parse dd/MM/yyyy or YYYY-MM-DD into a Date for sorting */
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  if (dateStr.includes("-")) {
    // YYYY-MM-DD
    return new Date(dateStr + "T00:00:00");
  }
  // dd/MM/yyyy
  const [d, m, y] = dateStr.split("/");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

const STATUS_LABELS: Record<FinancialReceivable["status"], string> = {
  open: "Em aberto",
  received: "Recebido",
  partial: "Parcial",
  overdue: "Vencido",
  canceled: "Cancelado",
};

const STATUS_VARIANT: Record<
  FinancialReceivable["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  received: "default",
  partial: "outline",
  overdue: "destructive",
  canceled: "outline",
};

interface AccountsReceivableTableProps {
  data?: FinancialReceivable[];
  loading?: boolean;
}

export function AccountsReceivableTable({
  data,
  loading,
}: AccountsReceivableTableProps) {
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
        Nenhuma conta a receber no período.
      </p>
    );
  }

  // Sort chronologically by due date
  const sorted = [...data].sort(
    (a, b) => parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime(),
  );

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vencimento</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="text-right">Recebido</TableHead>
            <TableHead>Parcela</TableHead>
            <TableHead>Meio de Pagamento</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{row.dueDate}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell>{row.customer?.name ?? "—"}</TableCell>
              <TableCell className="text-right font-medium">
                {fmt(row.amount)}
              </TableCell>
              <TableCell className="text-right font-medium">
                {fmt(row.saldo)}
              </TableCell>
              <TableCell className="text-right font-medium">
                {fmt(row.receivedAmount)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {row.installment ?? "—"}
              </TableCell>
              <TableCell>{row.receiptMethod ?? "—"}</TableCell>
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
