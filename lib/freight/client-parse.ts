import * as XLSX from "xlsx";

/** Read a CSV/XLSX File into a matrix of rows (header:1, blanks kept). */
export function readFileToRows(file: File): Promise<(string | number | null)[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: "",
          blankrows: false,
        }) as (string | number | null)[][];
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** All sheet names + their rows (for files that split data across sheets). */
export function readAllSheets(
  file: File,
): Promise<{ name: string; rows: (string | number | null)[][] }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheets = wb.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
            header: 1,
            defval: "",
            blankrows: false,
          }) as (string | number | null)[][],
        }));
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Build & download the canonical price-table template (.xlsx). */
export function downloadPriceTemplate() {
  const headers = [
    "origem", "destino", "uf",
    "ate_10kg", "ate_20kg", "ate_30kg", "ate_50kg", "ate_70kg", "ate_100kg",
    "por_tonelada", "advalorem_pct", "pedagio", "taxa_ate_50", "taxa_acima_50",
    "gris_pct", "ta", "min", "icms",
  ];
  const example = [
    "NOVO HAMBURGO-93300", "SAO PAULO-5092", "SP",
    "41,93", "55,90", "69,86", "83,86", "97,82", "111,80",
    "1.117,99", "0,4000 %", "8,83", "60,00", "73,37", "0,0020 %", "4,13", "", "12",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "tabela");
  XLSX.writeFile(wb, "modelo_tabela_frete.xlsx");
}
