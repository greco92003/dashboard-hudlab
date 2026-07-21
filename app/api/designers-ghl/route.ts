import { NextRequest, NextResponse } from "next/server";
import { readGoogleSheet } from "@/lib/google-sheets";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { normalizeDesignerName } from "@/lib/utils/normalize-names";
import {
  calculateBrazilDateRange,
  formatBrazilDateToLocal,
} from "@/lib/utils/timezone";

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_GHL_DESIGNERS_ID ||
  "1QFaFou46g5LKB6DD0auaf3WXe9_F8tXsD2A9DrPt0Mg";
const SHEET_RANGE = "Designers!A:F";
const CACHE_TTL_MS = 5 * 60 * 1000;

type ActionType = "mockup" | "alteration" | "other";

export interface DesignerGhlAction {
  id: string;
  date: string;
  designer: string;
  stage: string;
  actionType: ActionType;
  name: string;
  email: string;
  utm2: string;
}

let actionsCache: { data: DesignerGhlAction[]; timestamp: number } | null = null;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getActionType(stage: string): ActionType {
  const normalizedStage = normalizeText(stage);
  if (normalizedStage.includes("alteracao")) return "alteration";
  if (normalizedStage.includes("mockup")) return "mockup";
  return "other";
}

function parseSheetDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function getActions(forceRefresh: boolean): Promise<DesignerGhlAction[]> {
  if (
    !forceRefresh &&
    actionsCache &&
    Date.now() - actionsCache.timestamp < CACHE_TTL_MS
  ) {
    return actionsCache.data;
  }

  const sheet = await readGoogleSheet(SPREADSHEET_ID, SHEET_RANGE, true);
  const actions = (sheet.data || [])
    .map((row, index): DesignerGhlAction | null => {
      const date = parseSheetDate(String(row["Data Ação"] || ""));
      const rawDesigner = String(row.Designer || "").trim();
      const stage = String(row.Etapa || "").trim();

      if (!date || !rawDesigner || !stage) return null;

      return {
        id: `${date}-${index}`,
        date,
        designer: normalizeDesignerName(rawDesigner),
        stage,
        actionType: getActionType(stage),
        name: String(row.Nome || "").trim(),
        email: String(row.Email || "").trim(),
        utm2: String(row.UTM2 || "").trim(),
      };
    })
    .filter((action): action is DesignerGhlAction => action !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  actionsCache = { data: actions, timestamp: Date.now() };
  return actions;
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const period = Number(searchParams.get("period") || "30");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const forceRefresh = searchParams.get("refresh") === "1";

    let startDate: string;
    let endDate: string;

    if (startDateParam && endDateParam) {
      startDate = startDateParam;
      endDate = endDateParam;
    } else {
      const safePeriod = [30, 60, 90].includes(period) ? period : 30;
      const range = calculateBrazilDateRange(safePeriod);
      startDate = formatBrazilDateToLocal(range.startDate);
      endDate = formatBrazilDateToLocal(range.endDate);
    }

    const allActions = await getActions(forceRefresh);
    const actions = allActions.filter(
      (action) => action.date >= startDate && action.date <= endDate,
    );

    return NextResponse.json(
      {
        actions,
        totalActions: actions.length,
        dateRange: { startDate, endDate },
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Error fetching GHL designer actions:", error);
    return NextResponse.json(
      {
        error: "Não foi possível carregar os dados dos designers GHL",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
