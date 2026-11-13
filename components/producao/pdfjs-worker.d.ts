// O pdf.js não publica tipos para o worker. Importado só pelo efeito de
// registrar o processamento na própria página (ver visualizador-pdf.tsx).
declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
