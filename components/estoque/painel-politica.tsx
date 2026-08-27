"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import type { SoladoResumo } from "@/lib/estoque/solados";

function Item({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{rotulo}</div>
        {nota && (
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {nota}
          </div>
        )}
      </div>
      <div className="shrink-0 text-sm font-medium tabular-nums">{valor}</div>
    </div>
  );
}

/**
 * A política de estoque fica atrás da engrenagem, não na tela: quem abre a
 * /estoque quer decidir a compra, não auditar o cálculo. Mas o cálculo precisa
 * estar acessível, senão o número vira caixa-preta.
 */
export function PainelPolitica({ dados }: { dados: SoladoResumo }) {
  const p = dados.parametros;
  const porDiaUtil = p.diasUteisPorMes
    ? Math.round(p.consumoMensalMedio / p.diasUteisPorMes)
    : 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Política de estoque">
          <Settings2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Política de estoque</SheetTitle>
          <SheetDescription>
            De onde saem o mínimo e a sugestão de compra.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <h3 className="pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Consumo
          </h3>
          <Item
            rotulo="Média mensal"
            valor={`${p.consumoMensalMedio} pares`}
            nota="Embarques dos últimos 6 meses fechados. O mês corrente fica de fora para não puxar a média para baixo."
          />
          <Item rotulo="Por dia útil" valor={`${porDiaUtil} pares`} />

          <h3 className="pb-1 pt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Estoque mínimo
          </h3>
          <Item
            rotulo="Cobertura"
            valor={`${p.diasUteisCobertura} dias úteis`}
            nota="Prazo de entrega do fornecedor. O mínimo cobre o consumo desse período."
          />
          <Item rotulo="Equivale a" valor={`${dados.coberturaEmPares} pares`} />
          <Item
            rotulo="Trava por numeração"
            valor={`${p.travaPorSku} pares`}
            nota="Piso para toda combinação de cor e numeração, mesmo sem demanda registrada."
          />
          <Item
            rotulo="Mínimo total"
            valor={`${dados.totalMinimo} pares`}
            nota={`Cobertura de ${dados.coberturaEmPares} mais ${dados.totalMinimo - dados.coberturaEmPares} que a trava acrescenta.`}
          />

          <h3 className="pb-1 pt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Compra
          </h3>
          <Item
            rotulo="Lote mínimo por numeração"
            valor={`${p.lotePorNumeracao} pares`}
            nota="Pedido mínimo por numeração junto ao fornecedor. Acima disso a quantidade é livre."
          />
          <Item
            rotulo="Pedido mínimo total"
            valor={`${p.pedidoMinimoTotal} pares`}
            nota="A ordem inteira precisa fechar esse volume. Enquanto a sugestão não chega lá, a compra fica retida — comprar 240 pares para cobrir 2 seria pior do que esperar."
          />
          <Item
            rotulo="Teto por pedido na curva"
            valor={`${Math.round(p.tetoInfluenciaPedido * 100)}%`}
            nota="Limita o peso de um pedido grande na distribuição por cor e numeração, para um único cliente não reescrever a política."
          />

          <p className="py-6 text-xs leading-relaxed text-muted-foreground">
            A distribuição por cor e numeração ainda sai da janela de pedidos em
            aberto — o histórico com essa quebra começou a ser guardado em
            21/08/2026. Conforme os meses acumulam, a curva melhora sozinha.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
