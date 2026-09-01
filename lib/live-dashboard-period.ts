const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface LiveDashboardPeriod {
  year: number;
  monthIndex: number;
  todayDay: number;
  startDay: number;
  totalDaysInMonth: number;
  countedDays: number;
  elapsedDays: number;
  startDate: string;
  endDate: string;
}

/** The live dashboard always covers the full current month. */
export function getLiveDashboardPeriod(now = new Date()): LiveDashboardPeriod {
  const brazilNow = new Date(now.getTime() - BRAZIL_UTC_OFFSET_MS);
  const year = brazilNow.getUTCFullYear();
  const monthIndex = brazilNow.getUTCMonth();
  const todayDay = brazilNow.getUTCDate();
  const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startDay = 1;
  const countedDays = totalDaysInMonth - startDay + 1;
  const elapsedDays = Math.max(
    0,
    Math.min(todayDay, totalDaysInMonth) - startDay + 1,
  );
  const month = String(monthIndex + 1).padStart(2, "0");

  return {
    year,
    monthIndex,
    todayDay,
    startDay,
    totalDaysInMonth,
    countedDays,
    elapsedDays,
    startDate: `${year}-${month}-${String(startDay).padStart(2, "0")}`,
    endDate: `${year}-${month}-${String(totalDaysInMonth).padStart(2, "0")}`,
  };
}
