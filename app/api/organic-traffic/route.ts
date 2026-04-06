import { NextRequest, NextResponse } from "next/server";

const SPREADSHEET_ID = "1quUeu99dGnLK4RUl5DGAsblDgJ0-Wr51";
const BASE_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=`;

// Parse a CSV string into array of objects using the first row as headers
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  // Basic CSV parser handling quoted fields
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) {
        inQuotes = true;
        continue;
      }
      if (ch === '"' && inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (ch === '"' && inQuotes) {
        inQuotes = false;
        continue;
      }
      if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    result.push(current);
    return result;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] || "").trim();
    });
    return obj;
  });
}

async function fetchCSVTab(
  sheetName: string,
): Promise<Record<string, string>[]> {
  const url = BASE_CSV_URL + encodeURIComponent(sheetName);
  const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
  if (!res.ok)
    throw new Error(`Failed to fetch sheet "${sheetName}": ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

export async function GET(_request: NextRequest) {
  try {
    // Fetch all tabs in parallel via public CSV export (works for xlsx files)
    const [dashboardRaw, reelsRaw, storiesRaw, postsRaw, historicosRaw] =
      await Promise.all([
        fetchCSVTab("Dashboard Semanal"),
        fetchCSVTab("Lançamento Reels"),
        fetchCSVTab("Lançamento Stories"),
        fetchCSVTab("Lançamento Posts"),
        fetchCSVTab("Dados Historicos"),
      ]);

    // Process Dashboard Semanal
    // The first column header is "Métrica --- STORIES ---"
    const dashboard = dashboardRaw
      .filter((row) => {
        const metric = row["Métrica --- STORIES ---"] || "";
        return metric && metric.trim() !== "" && !metric.startsWith("---");
      })
      .map((row) => ({
        metrica: row["Métrica --- STORIES ---"] || "",
        semanaAnterior: row["Semana Anterior"] || "0",
        semanaAtual: row["Semana Atual"] || "0",
        evolucao: row["Evolução (%)"] || "0%",
      }));

    // Process Reels (only rows with data for março: semanas 11-14)
    const reels = reelsRaw
      .filter((row) => {
        const sem = row["Semana"]?.trim();
        const desc = row["Descrição"]?.trim();
        return (
          sem && sem !== "" && !isNaN(parseInt(sem)) && desc && desc !== ""
        );
      })
      .map((row) => ({
        semana: parseInt(row["Semana"]) || 0,
        data: row["Data"] || "",
        descricao: row["Descrição"] || "",
        views: parseNum(row["Views (Plays)"]),
        curtidas: parseNum(row["Curtidas"]),
        comentarios: parseNum(row["Comentários"]),
        compartilhamentos: parseNum(row["Compartilhamentos"]),
        salvamentos: parseNum(row["Salvamentos"]),
      }));

    // Process Stories
    const stories = storiesRaw
      .filter((row) => {
        const sem = row["Semana"]?.trim();
        const desc = row["Descrição"]?.trim();
        return (
          sem && sem !== "" && !isNaN(parseInt(sem)) && desc && desc !== ""
        );
      })
      .map((row) => ({
        semana: parseInt(row["Semana"]) || 0,
        data: row["Data"] || "",
        descricao: row["Descrição"] || "",
        views: parseNum(row["Views"]),
        interacoes: parseNum(row["Interações"]),
        atividadePerfil: parseNum(row["Atividade do Perfil"]),
      }));

    // Process Posts
    const posts = postsRaw
      .filter((row) => {
        const sem = row["Semana"]?.trim();
        const desc = row["Descrição"]?.trim();
        return (
          sem && sem !== "" && !isNaN(parseInt(sem)) && desc && desc !== ""
        );
      })
      .map((row) => ({
        semana: parseInt(row["Semana"]) || 0,
        data: row["Data"] || "",
        descricao: row["Descrição"] || "",
        alcance: parseNum(row["Alcance (Reach)"]),
        curtidas: parseNum(row["Curtidas"]),
        comentarios: parseNum(row["Comentários"]),
        compartilhamentos: parseNum(row["Compartilhamentos"]),
        salvamentos: parseNum(row["Salvamentos"]),
      }));

    // Process Dados Historicos
    const historicos = historicosRaw
      .filter((row) => {
        const sem = row["Semana"]?.trim();
        return sem && sem !== "" && !isNaN(parseInt(sem));
      })
      .map((row) => ({
        semana: parseInt(row["Semana"]) || 0,
        storiesViews: parseNum(row["Stories Views"]),
        reelsViews: parseNum(row["Reels Views"]),
        postsAlcance: parseNum(row["Posts Alcance"]),
      }));

    // Aggregate totals
    const totalReelsViews = reels.reduce((s: number, r: any) => s + r.views, 0);
    const totalStoriesViews = stories.reduce(
      (s: number, r: any) => s + r.views,
      0,
    );
    const totalPostsAlcance = posts.reduce(
      (s: number, r: any) => s + r.alcance,
      0,
    );
    const totalReelsCurtidas = reels.reduce(
      (s: number, r: any) => s + r.curtidas,
      0,
    );
    const totalReelsComentarios = reels.reduce(
      (s: number, r: any) => s + r.comentarios,
      0,
    );
    const totalReelsCompartilhamentos = reels.reduce(
      (s: number, r: any) => s + r.compartilhamentos,
      0,
    );
    const totalReelsSalvamentos = reels.reduce(
      (s: number, r: any) => s + r.salvamentos,
      0,
    );

    return NextResponse.json({
      success: true,
      dashboard,
      reels,
      stories,
      posts,
      historicos,
      totals: {
        reelsViews: totalReelsViews,
        storiesViews: totalStoriesViews,
        postsAlcance: totalPostsAlcance,
        reelsCurtidas: totalReelsCurtidas,
        reelsComentarios: totalReelsComentarios,
        reelsCompartilhamentos: totalReelsCompartilhamentos,
        reelsSalvamentos: totalReelsSalvamentos,
        totalReels: reels.length,
        totalStories: stories.length,
        totalPosts: posts.length,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching organic traffic data:", error);
    return NextResponse.json(
      { error: "Failed to fetch organic traffic data", details: String(error) },
      { status: 500 },
    );
  }
}

function parseNum(val: string | number | undefined): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  return (
    parseInt(val.toString().replace(/\./g, "").replace(/,/g, "").trim()) || 0
  );
}
