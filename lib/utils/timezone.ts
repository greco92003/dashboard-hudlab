/**
 * Utility functions for handling Brazilian timezone (UTC-3) consistently
 * across development and production environments
 */

/**
 * Get current date and time in Brazilian timezone
 * Always returns the current moment in Brazil, regardless of server timezone
 */
export function getNowInBrazil(): Date {
  const now = new Date();

  // Brazil is UTC-3, so we subtract 3 hours from UTC
  // If server is in UTC, we need to subtract 3 hours
  // If server is already in Brazil time, this will be correct
  const brazilOffset = -3 * 60; // -3 hours in minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brazilTime = new Date(utc + brazilOffset * 60000);

  return brazilTime;
}

/**
 * Create a date in Brazilian timezone for a specific day
 * @param year - Full year (e.g., 2024)
 * @param month - Month (0-11, where 0 = January)
 * @param day - Day of month (1-31)
 * @param hour - Hour (0-23, default: 0)
 * @param minute - Minute (0-59, default: 0)
 * @param second - Second (0-59, default: 0)
 * @param millisecond - Millisecond (0-999, default: 0)
 */
export function createBrazilDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  millisecond: number = 0
): Date {
  // Create date directly in local time (which will be interpreted as Brazil time)
  return new Date(year, month, day, hour, minute, second, millisecond);
}

/**
 * Calculate date range for period-based filtering in Brazilian timezone
 * @param period - Number of days (30, 60, 90)
 * @returns Object with startDate and endDate in Brazilian timezone
 */
export function calculateBrazilDateRange(period: number): {
  startDate: Date;
  endDate: Date;
} {
  // Get current date in Brazil timezone
  const nowInBrazil = getNowInBrazil();

  // End date: today at 23:59:59.999 in Brazil
  const endDate = new Date(nowInBrazil);
  endDate.setHours(23, 59, 59, 999);

  // Start date: period days ago at 00:00:00.000 in Brazil
  const startDate = new Date(nowInBrazil);

  // Calculate months to subtract based on period
  let monthsToSubtract = 1;
  if (period === 60) monthsToSubtract = 2;
  else if (period === 90) monthsToSubtract = 3;

  startDate.setMonth(startDate.getMonth() - monthsToSubtract);
  startDate.setHours(0, 0, 0, 0);

  return { startDate, endDate };
}

/**
 * Calculate date range for day-based filtering in Brazilian timezone
 * @param days - Number of days to go back
 * @returns Object with startDate and endDate in Brazilian timezone
 */
export function calculateBrazilDayRange(days: number): {
  startDate: Date;
  endDate: Date;
} {
  // Get current date in Brazil timezone
  const nowInBrazil = getNowInBrazil();

  // End date: today at 23:59:59.999 in Brazil
  const endDate = new Date(nowInBrazil);
  endDate.setHours(23, 59, 59, 999);

  // Start date: days ago at 00:00:00.000 in Brazil
  const startDate = new Date(nowInBrazil);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  return { startDate, endDate };
}

/**
 * Format date as YYYY-MM-DD in Brazilian timezone
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatBrazilDateToLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date string in Brazilian timezone (YYYY-MM-DD format)
 */
export function getTodayInBrazil(): string {
  const today = getNowInBrazil();
  return formatBrazilDateToLocal(today);
}

/**
 * Convert a date to Brazilian timezone
 * @param date - Date to convert
 * @returns Date adjusted to Brazilian timezone
 */
export function convertToBrazilTimezone(date: Date): Date {
  // Convert any date to Brazil timezone
  const brazilOffset = -3 * 60; // -3 hours in minutes
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const brazilTime = new Date(utc + brazilOffset * 60000);

  return brazilTime;
}

/**
 * Debug function to log timezone information
 */
export function logTimezoneDebug(context: string): void {
  const now = new Date();
  const brazilNow = getNowInBrazil();

  console.log(`[${context}] Timezone Debug:`, {
    serverTime: now.toISOString(),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    brazilTime: brazilNow.toISOString(),
    brazilFormatted: formatBrazilDateToLocal(brazilNow),
    offsetDifference:
      (brazilNow.getTime() - now.getTime()) / (1000 * 60 * 60) + " hours",
  });
}
