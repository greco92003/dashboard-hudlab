import { jsPDF } from "jspdf";
import autoTable, { type CellInput, type UserOptions } from "jspdf-autotable";
import sharp from "sharp";
import type { OrderDocument } from "./tiny-order-documents";
import { packVolumes } from "./romaneio-packing";

const MARGIN = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BORDER = [214, 214, 214] as [number, number, number];
const VOLUME_GAP = 10;

const baseTable: Partial<UserOptions> = {
  theme: "grid",
  margin: { left: MARGIN, right: MARGIN },
  styles: { font: "helvetica", fontSize: 10, textColor: 33, lineColor: BORDER, lineWidth: 0.2, cellPadding: 2.2, valign: "top" },
  headStyles: { fillColor: [255, 255, 255], textColor: 33, fontStyle: "bold" },
};

function brDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

/**
 * Consumo de material vai sempre com quatro casas: o PVC Mônaco é medido em
 * 0,0030 por par e arredondar esconde a diferença entre os tamanhos.
 */
function formatMaterialQuantity(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function lastY(doc: jsPDF) {
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function bold(content: string): CellInput {
  return { content, styles: { fontStyle: "bold" } };
}

function title(doc: jsPDF, text: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(33);
  doc.text(text, MARGIN, 22);
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 27, PAGE_WIDTH - MARGIN, 27);
  return 32;
}

async function drawImage(doc: jsPDF, image: Buffer, top: number) {
  const { width = 1, height = 1 } = await sharp(image).metadata();
  const maxWidth = CONTENT_WIDTH;
  const maxHeight = 95;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  doc.setDrawColor(...BORDER);
  doc.rect(MARGIN, top, CONTENT_WIDTH, maxHeight + 6);
  doc.addImage(image.toString("base64"), "JPEG", MARGIN + (CONTENT_WIDTH - drawWidth) / 2, top + 3, drawWidth, drawHeight);
  return top + maxHeight + 6 + 4;
}

export async function buildTalaoPdf(order: OrderDocument) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  if (order.products.length === 0) {
    title(doc, `Talão pedido ${order.number}`);
    doc.setFontSize(11).setFont("helvetica", "normal").text("Pedido sem produtos fabricados.", MARGIN, 42);
  }

  for (const [index, product] of order.products.entries()) {
    if (index > 0) doc.addPage();
    let top = title(doc, `Talão pedido ${order.number}`);
    if (product.image) top = await drawImage(doc, product.image, top);

    autoTable(doc, {
      ...baseTable,
      startY: top,
      body: [
        [bold("Referencia:"), product.reference, bold("Talão:"), `${index + 1}/${order.products.length}`],
        [bold("Cliente:"), order.customer, bold("Número do pedido:"), order.number],
        [bold("Data do Pedido:"), brDate(order.orderDate), bold("Previsão:"), brDate(order.expectedDate)],
      ],
      columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 28 }, 3: { cellWidth: 26 } },
    });

    autoTable(doc, {
      ...baseTable,
      startY: lastY(doc) + 3,
      head: [
        ...(product.soles.length > 0
          ? [[{ content: product.soles.join(" · "), colSpan: product.sizes.length + 1 }]]
          : []),
        [...product.sizes.map((entry) => entry.size), "Total"],
      ],
      body: [[...product.sizes.map((entry) => `${formatQuantity(entry.quantity)} pares`), `${formatQuantity(product.totalPairs)} pares`]],
    });

    if (product.materials.length > 0) {
      autoTable(doc, {
        ...baseTable,
        startY: lastY(doc) + 3,
        head: [["Material", "Total"]],
        body: product.materials.map((material) => [material.name, formatMaterialQuantity(material.quantity)]),
        columnStyles: { 1: { cellWidth: 30 } },
      });
    }

    autoTable(doc, {
      ...baseTable,
      startY: lastY(doc) + 3,
      body: [[bold("Observações:"), order.notes]],
      columnStyles: { 0: { cellWidth: 30 } },
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function buildRomaneioPdf(order: OrderDocument) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const volumes = packVolumes(order.products.flatMap((product) =>
    product.sizes.map((entry) => ({ reference: product.reference, size: entry.size, quantity: entry.quantity }))));
  if (volumes.length === 0) {
    doc.setFontSize(11).setFont("helvetica", "normal").text(`Pedido ${order.number} sem pares para despacho.`, MARGIN, 20);
  }

  // Todos os volumes seguidos, separados por uma linha de corte, para gastar
  // menos papel. Um volume nunca é partido entre duas páginas.
  const pageHeight = doc.internal.pageSize.getHeight();
  let top = MARGIN;
  for (const [index, volume] of volumes.entries()) {
    const references = new Set(volume.lines.map((line) => line.reference)).size;
    const estimatedHeight = (5 + references) * 9 + 12;
    if (index > 0) {
      if (top + VOLUME_GAP + estimatedHeight > pageHeight - MARGIN) {
        doc.addPage();
        top = MARGIN;
      } else {
        const cutY = top + VOLUME_GAP / 2;
        doc.setDrawColor(150);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.line(MARGIN, cutY, PAGE_WIDTH - MARGIN, cutY);
        doc.setLineDashPattern([], 0);
        top += VOLUME_GAP;
      }
    }

    autoTable(doc, {
      ...baseTable,
      startY: top,
      body: [[bold("Pedido:"), order.number, bold("Cliente:"), order.customer]],
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 40 }, 2: { cellWidth: 22 } },
    });

    const sizes = [...new Set(order.products.flatMap((product) => product.sizes.map((entry) => entry.size)))]
      .filter((size) => volume.lines.some((line) => line.size === size));
    const volumeReferences = [...new Set(volume.lines.map((line) => line.reference))];
    autoTable(doc, {
      ...baseTable,
      startY: lastY(doc) + 3,
      head: [["Referencia:", ...sizes]],
      body: volumeReferences.map((reference) => [
        reference,
        ...sizes.map((size) => {
          const quantity = volume.lines
            .filter((line) => line.reference === reference && line.size === size)
            .reduce((sum, line) => sum + line.quantity, 0);
          return quantity ? formatQuantity(quantity) : "";
        }),
      ]),
      columnStyles: Object.fromEntries(sizes.map((_, sizeIndex) => [sizeIndex + 1, { cellWidth: 17 }])),
    });

    autoTable(doc, {
      ...baseTable,
      startY: lastY(doc) + 3,
      body: [
        [bold("Volume"), `${index + 1}/${volumes.length}`, bold("Total de pares"), formatQuantity(volume.pairs)],
        [bold("Caixa"), `${volume.capacity} pares`, bold("Espaço vazio"), formatQuantity(volume.capacity - volume.pairs)],
      ],
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 32 }, 3: { cellWidth: 26 } },
    });
    top = lastY(doc);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
