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

export interface MesAno {
  month: number; // 1-12
  year: number;
}

/**
 * Mês de fechamento de uma venda pelo dia em que fechou (YYYY-MM-DD). O
 * fechamento mensal vai do dia 02 ao dia 01 do mês seguinte -- vende-se até
 * meia-noite do último dia e parte dos cadastros só termina no dia 01. Mesma
 * regra do ciclo acima. Vale só onde há fechamento mensal (Live Dashboard,
 * gráfico mensal, metas do mês); seletores de período usam dias normais.
 */
export function mesDeFechamento(dia: string): MesAno {
  const [year, month, day] = dia.slice(0, 10).split("-").map(Number);
  if (day !== 1) return { month, year };
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

const NOMES_DOS_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Os últimos `quantos` meses de fechamento, do atual para trás. */
export function mesesRecentes(quantos: number, now = new Date()): MesAno[] {
  const ciclo = getLiveDashboardPeriod(now);
  const meses: MesAno[] = [];
  let month = ciclo.monthIndex + 1;
  let year = ciclo.year;
  for (let i = 0; i < quantos; i++) {
    meses.push({ month, year });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return meses;
}

/** "Setembro/2026" */
export function rotuloDoFechamento(m: MesAno): string {
  return `${NOMES_DOS_MESES[m.month - 1]}/${m.year}`;
}

/** Datas (YYYY-MM-DD) que cobrem os fechamentos do mês `de` até o mês `ate`. */
export function limitesDosFechamentos(de: MesAno, ate: MesAno): { inicio: string; fim: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const seguinte = ate.month === 12 ? { month: 1, year: ate.year + 1 } : { month: ate.month + 1, year: ate.year };
  return {
    inicio: `${de.year}-${pad(de.month)}-02`,
    fim: `${seguinte.year}-${pad(seguinte.month)}-01`,
  };
}
