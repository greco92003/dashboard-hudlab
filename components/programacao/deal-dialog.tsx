"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Clock, DollarSign, Package, Palette, Tag, User } from "lucide-react";
import type { BoardDeal } from "@/lib/programacao/board-types";
import { formatDate } from "@/lib/programacao/board-dates";
import { TipoPedidoBadge } from "@/components/programacao/tipo-pedido-badge";

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <div className="text-sm text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}

export function DealDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: BoardDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{deal?.title}</DialogTitle>
          <DialogDescription>Detalhes completos do deal</DialogDescription>
        </DialogHeader>

        {deal && (
          <div className="space-y-6">
            {deal.dataEmbarque && (
              <div className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary/10 p-4 dark:bg-primary/20">
                <Clock className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Data de Embarque
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {formatDate(deal.dataEmbarque)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4 dark:bg-green-950/20">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Valor do Deal</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(deal.value / 100, deal.currency)}
                </p>
                {deal.stageTitle && (
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium text-blue-600">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    {deal.stageTitle}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailItem
                icon={<Tag className="h-5 w-5" />}
                label="Tipo do Pedido"
                value={
                  deal.tipoPedido ? (
                    <TipoPedidoBadge tipo={deal.tipoPedido} />
                  ) : (
                    "Ainda não preenchido no GHL"
                  )
                }
              />
              {deal.quantidadePares && (
                <DetailItem
                  icon={<Package className="h-5 w-5" />}
                  label="Quantidade de Pares"
                  value={deal.quantidadePares}
                />
              )}
              {deal.vendedor && (
                <DetailItem
                  icon={<User className="h-5 w-5" />}
                  label="Vendedor"
                  value={deal.vendedor}
                />
              )}
              {deal.designer && (
                <DetailItem
                  icon={<Palette className="h-5 w-5" />}
                  label="Designer"
                  value={deal.designer}
                />
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                ID do Deal: <span className="font-mono">{deal.id}</span>
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
