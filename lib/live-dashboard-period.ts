const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface LiveDashboardPeriod {
  year: number;
  monthIndex: number;
  todayDay: number;
  todayDate: string;
  startDay: number;
  totalDaysInMonth: number;
  countedDays: number;
  elapsedDays: number;
  startDate: string;
  endDate: string;
  dates: string[];
}

function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Ciclo comercial do Live Dashboard: dia 02 de um mês até dia 01 do mês
 * seguinte. No próprio dia 01, o ciclo anterior continua ativo e é encerrado;
 * o novo ciclo começa no dia 02.
 */
export function getLiveDashboardPeriod(now = new Date()): LiveDashboardPeriod {
  const brazilNow = new Date(now.getTime() - BRAZIL_UTC_OFFSET_MS);
  const currentYear = brazilNow.getUTCFullYear();
  const currentMonthIndex = brazilNow.getUTCMonth();
  const todayDay = brazilNow.getUTCDate();
  const todayDate = formatUtcDate(brazilNow);
  const startsInPreviousMonth = todayDay === 1;
  const start = new Date(
    Date.UTC(
      currentYear,
      currentMonthIndex - (startsInPreviousMonth ? 1 : 0),
      2,
    ),
  );
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  const year = start.getUTCFullYear();
  const monthIndex = start.getUTCMonth();
  const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startDay = 2;
  const dates: string[] = [];

  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    dates.push(formatUtcDate(cursor));
  }

  const countedDays = dates.length;
  const todayIndex = dates.indexOf(todayDate);
  const elapsedDays = todayIndex >= 0 ? todayIndex + 1 : 0;

  return {
    year,
    monthIndex,
    todayDay,
    todayDate,
    startDay,
    totalDaysInMonth,
    countedDays,
    elapsedDays,
    startDate: formatUtcDate(start),
    endDate: formatUtcDate(end),
    dates,
  };
}
