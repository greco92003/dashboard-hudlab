import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./board-dates";
import {
  AGRUPAMENTO_ROTULOS,
  etapaDoDeal,
  paresDoDeal,
  tipoDoDeal,
  vendedorDoDeal,
  type RelatorioAgrupamento,
  type RelatorioGrupo,
} from "./relatorio";

const MARGEM = 12;

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type RelatorioPdfInput = {
  titulo: string;
  /** PNG em data URL ou base64. */
  logo?: string | null;
  grupos: RelatorioGrupo[];
  agrupamento: RelatorioAgrupamento;
  mostrarValor: boolean;
  /** Linhas de texto descrevendo o recorte, impressas no cabeçalho. */
  resumoFiltros: string[];
};

export function montarRelatorioPdf(input: RelatorioPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const largura = doc.internal.pageSize.getWidth();
  const deals = input.grupos.flatMap((grupo) => grupo.deals);
  const totalPares = input.grupos.reduce((soma, grupo) => soma + grupo.pares, 0);
  const totalValor = input.grupos.reduce((soma, grupo) => soma + grupo.valor, 0);

  // A logo fica à esquerda do título, com a altura fixa e a largura na
  // proporção da imagem.
  const alturaLogo = 18;
  let larguraLogo = 0;
  if (input.logo) {
    const { width, height } = doc.getImageProperties(input.logo);
    larguraLogo = (alturaLogo * width) / height;
    doc.addImage(input.logo, "PNG", MARGEM, 5, larguraLogo, alturaLogo, "logo-hudlab", "FAST");
  }
  const xTitulo = input.logo ? MARGEM + larguraLogo + 5 : MARGEM;

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(33);
  doc.text(`Relatório · ${input.titulo}`, xTitulo, 16);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, largura - MARGEM, 16, { align: "right" });

  let y = input.logo ? 29 : 23;
  for (const linha of input.resumoFiltros) {
    const quebradas = doc.splitTextToSize(linha, largura - MARGEM * 2) as string[];
    doc.text(quebradas, MARGEM, y);
    y += quebradas.length * 4.2;
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(33);
  doc.text(
    [`${deals.length} pedido(s)`, `${totalPares} pares`, input.mostrarValor ? moeda(totalValor) : ""]
      .filter(Boolean).join("   ·   "),
    MARGEM,
    y + 2,
  );
  y += 6;

  const cabecalho = ["Embarque", "Pedido", "Tipo", "Etapa", "Vendedor", "Pares", ...(input.mostrarValor ? ["Valor"] : [])];
  const colunaPares = 5;

  if (deals.length === 0) {
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text("Nenhum pedido encontrado com os filtros escolhidos.", MARGEM, y + 6);
  }

  for (const grupo of input.grupos) {
    autoTable(doc, {
      startY: y + 2,
      theme: "grid",
      margin: { left: MARGEM, right: MARGEM },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, textColor: 33, lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [243, 244, 246], textColor: 33, fontStyle: "bold" },
      head: [
        ...(input.agrupamento !== "nenhum"
          ? [[{
              content: `${grupo.titulo}  —  ${grupo.deals.length} pedido(s) · ${grupo.pares} pares${input.mostrarValor ? ` · ${moeda(grupo.valor)}` : ""}`,
              colSpan: cabecalho.length,
              styles: { fillColor: [229, 231, 235] as [number, number, number], fontSize: 9.5 },
            }]]
          : []),
        cabecalho,
      ],
      body: grupo.deals.map((deal) => [
        formatDate(deal.dataEmbarque) || "—",
        deal.title,
        tipoDoDeal(deal),
        etapaDoDeal(deal),
        vendedorDoDeal(deal),
        String(paresDoDeal(deal)),
        ...(input.mostrarValor ? [moeda((deal.value || 0) / 100)] : []),
      ]),
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 45 },
        4: { cellWidth: 38 },
        [colunaPares]: { cellWidth: 16, halign: "right" },
        ...(input.mostrarValor ? { 6: { cellWidth: 28, halign: "right" as const } } : {}),
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  // Rodapé no fim, uma vez por página: cada grupo é uma tabela e numerar dentro
  // delas desenhava o mesmo texto várias vezes na mesma folha.
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(`${input.titulo} · página ${pagina} de ${paginas}`, largura - MARGEM, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }

  doc.setProperties({ title: `Relatório ${input.titulo} (${AGRUPAMENTO_ROTULOS[input.agrupamento].toLowerCase()})` });
  return doc;
}

export function nomeDoRelatorio(titulo: string) {
  const slug = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-");
  return `relatorio-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
}
