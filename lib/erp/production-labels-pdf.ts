import { jsPDF } from "jspdf";
import type { ProductionLabel } from "./production-labels";
import type { EtiquetaProducao, Pessoa } from "./pares-identificados";

/** Rolo da térmica POS-9210: 80 × 50 mm, uma etiqueta por página. */
const WIDTH = 80;
const HEIGHT = 50;
const MARGIN = 3;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const SIZE_CARD_WIDTH = 25;
const SIZE_CARD_HEIGHT = 16;
const PT_TO_MM = 0.3528;

// Térmica não imprime cinza: tudo em preto sólido.
function ink(doc: jsPDF) {
  doc.setTextColor(0);
  doc.setDrawColor(0);
}

/** Maior fonte (até `max`) em que o texto cabe em `maxLines` linhas. */
function fitText(doc: jsPDF, text: string, width: number, max: number, min: number, maxLines: number) {
  for (let size = max; size >= min; size -= 0.5) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    if (lines.length <= maxLines) return { size, lines };
  }
  doc.setFontSize(min);
  const lines = doc.splitTextToSize(text, width) as string[];
  return { size: min, lines: lines.slice(0, maxLines) };
}

function lineHeight(fontSize: number) {
  return fontSize * PT_TO_MM * 1.15;
}

function drawParsed(doc: jsPDF, label: ProductionLabel) {
  let y = MARGIN + 3;
  doc.setFont("helvetica", "normal");
  const kind = fitText(doc, label.kind.toUpperCase(), CONTENT_WIDTH, 8, 6, 1);
  doc.text(kind.lines, MARGIN, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label.code, MARGIN, y);
  const codeWidth = doc.getTextWidth(label.code);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + codeWidth + 2, y - 1.1, WIDTH - MARGIN, y - 1.1);

  const model = fitText(doc, label.model, CONTENT_WIDTH, 20, 10, 2);
  y += lineHeight(model.size) + 0.5;
  doc.text(model.lines, MARGIN, y, { lineHeightFactor: 1.15 });

  const cardX = WIDTH - MARGIN - SIZE_CARD_WIDTH;
  const cardY = HEIGHT - MARGIN - SIZE_CARD_HEIGHT;
  doc.setFont("helvetica", "bold");
  const color = fitText(doc, label.color, cardX - MARGIN - 3, 14, 8, 2);
  const colorBlock = lineHeight(color.size) * color.lines.length;
  doc.text(color.lines, MARGIN, HEIGHT - MARGIN - 1 - colorBlock + lineHeight(color.size), { lineHeightFactor: 1.15 });

  doc.setLineWidth(0.7);
  doc.roundedRect(cardX, cardY, SIZE_CARD_WIDTH, SIZE_CARD_HEIGHT, 2.5, 2.5, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("TAMANHO", cardX + SIZE_CARD_WIDTH / 2, cardY + 3.6, { align: "center" });
  doc.setFont("helvetica", "bold");
  const size = fitText(doc, label.size, SIZE_CARD_WIDTH - 3, 20, 10, 1);
  doc.text(size.lines, cardX + SIZE_CARD_WIDTH / 2, cardY + SIZE_CARD_HEIGHT - 3, { align: "center" });
}

/**
 * Etiqueta de par com dono: o nome ganha o destaque que o modelo tem na
 * etiqueta normal; modelo e cor vão na linha do código, e filial/setor
 * ficam ao lado do tamanho.
 */
function drawWithPerson(doc: jsPDF, label: ProductionLabel, pessoa: Pessoa) {
  let y = MARGIN + 2.6;
  doc.setFont("helvetica", "normal");
  const kind = fitText(doc, label.kind.toUpperCase(), CONTENT_WIDTH, 7, 5.5, 1);
  doc.text(kind.lines, MARGIN, y);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label.code, MARGIN, y);
  const codeWidth = doc.getTextWidth(label.code);
  doc.setFont("helvetica", "normal");
  const modelAndColor = [label.model, label.color].filter(Boolean).join(" - ");
  const model = fitText(doc, modelAndColor, CONTENT_WIDTH - codeWidth - 2, 8, 6, 1);
  doc.text(model.lines, MARGIN + codeWidth + 2, y);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 1.3, WIDTH - MARGIN, y + 1.3);

  doc.setFont("helvetica", "bold");
  const name = fitText(doc, pessoa.nome.toUpperCase(), CONTENT_WIDTH, 15, 8, 2);
  y += 1.3 + lineHeight(name.size) * 0.95;
  doc.text(name.lines, MARGIN, y, { lineHeightFactor: 1.1 });

  const cardX = WIDTH - MARGIN - SIZE_CARD_WIDTH;
  const cardY = HEIGHT - MARGIN - SIZE_CARD_HEIGHT;
  const leftWidth = cardX - MARGIN - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("FILIAL", MARGIN, cardY + 2.2);
  doc.setFont("helvetica", "bold");
  const filial = fitText(doc, pessoa.filial, leftWidth, 11, 7, 1);
  doc.text(filial.lines, MARGIN, cardY + 2.2 + lineHeight(filial.size));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("SETOR", MARGIN, cardY + 10.2);
  doc.setFont("helvetica", "bold");
  const setor = fitText(doc, pessoa.setor, leftWidth, 11, 7, 1);
  doc.text(setor.lines, MARGIN, cardY + 10.2 + lineHeight(setor.size));

  doc.setLineWidth(0.7);
  doc.roundedRect(cardX, cardY, SIZE_CARD_WIDTH, SIZE_CARD_HEIGHT, 2.5, 2.5, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("TAMANHO", cardX + SIZE_CARD_WIDTH / 2, cardY + 3.6, { align: "center" });
  doc.setFont("helvetica", "bold");
  const size = fitText(doc, label.size, SIZE_CARD_WIDTH - 3, 20, 10, 1);
  doc.text(size.lines, cardX + SIZE_CARD_WIDTH / 2, cardY + SIZE_CARD_HEIGHT - 3, { align: "center" });
}

function drawFallback(doc: jsPDF, label: ProductionLabel) {
  doc.setFont("helvetica", "bold");
  const text = fitText(doc, label.description, CONTENT_WIDTH, 16, 8, 6);
  const block = lineHeight(text.size) * text.lines.length;
  const top = (HEIGHT - block) / 2 + lineHeight(text.size) * 0.8;
  doc.text(text.lines, MARGIN, top, { lineHeightFactor: 1.15 });
}

export function buildProductionLabelsPdf(labels: EtiquetaProducao[]): Buffer {
  const doc = new jsPDF({ unit: "mm", format: [WIDTH, HEIGHT], orientation: "landscape" });
  labels.forEach((label, index) => {
    if (index > 0) doc.addPage([WIDTH, HEIGHT], "landscape");
    ink(doc);
    if (label.parsed && label.pessoa) drawWithPerson(doc, label, label.pessoa);
    else if (label.parsed) drawParsed(doc, label);
    else drawFallback(doc, label);
  });
  return Buffer.from(doc.output("arraybuffer"));
}
