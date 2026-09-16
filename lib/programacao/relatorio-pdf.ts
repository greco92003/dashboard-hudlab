import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AGRUPAMENTO_ROTULOS,
  celulasDoDeal,
  colunasDoRelatorio,
  rotuloDoGrupo,
  totaisDoRelatorio,
  type RelatorioAgrupamento,
  type RelatorioGrupo,
} from "./relatorio";

const MARGEM = 12;

export type RelatorioPdfInput = {
  titulo: string;
  /** PNG em data URL ou base64. */
  logo?: string | null;
  grupos: RelatorioGrupo[];
  agrupamento: RelatorioAgrupamento;
  mostrarValor: boolean;
  /** Coluna com os dias de atraso — usada pelo filtro rápido "em atraso". */
  mostrarAtraso?: boolean;
  /** Linhas de texto descrevendo o recorte, impressas no cabeçalho. */
  resumoFiltros: string[];
};

export function montarRelatorioPdf(input: RelatorioPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const largura = doc.internal.pageSize.getWidth();
  const colunas = colunasDoRelatorio({
    mostrarValor: input.mostrarValor,
    mostrarAtraso: Boolean(input.mostrarAtraso),
  });
  const totalPedidos = input.grupos.reduce((soma, grupo) => soma + grupo.deals.length, 0);

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
  doc.text(totaisDoRelatorio(input.grupos, input.mostrarValor), MARGEM, y + 2);
  y += 6;

  if (totalPedidos === 0) {
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text("Nenhum pedido encontrado com os filtros escolhidos.", MARGEM, y + 6);
  }

  // Estilo por coluna montado a partir da definição compartilhada, e não por
  // índice fixo: a coluna de atraso entra e sai conforme o filtro.
  const columnStyles = Object.fromEntries(
    colunas.flatMap((coluna, indice) =>
      coluna.largura
        ? [[indice, { cellWidth: coluna.largura, ...(coluna.direita ? { halign: "right" as const } : {}) }]]
        : [],
    ),
  );

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
              content: rotuloDoGrupo(grupo, input.mostrarValor),
              colSpan: colunas.length,
              styles: { fillColor: [229, 231, 235] as [number, number, number], fontSize: 9.5 },
            }]]
          : []),
        colunas.map((coluna) => coluna.rotulo),
      ],
      body: grupo.deals.map((deal) => celulasDoDeal(deal, colunas)),
      columnStyles,
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `relatorio-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
}
