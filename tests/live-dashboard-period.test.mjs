import test from "node:test";
import assert from "node:assert/strict";
import { getLiveDashboardPeriod } from "../lib/live-dashboard-period.ts";

test("ciclo começa no dia 2 e termina no dia 1 seguinte", () => {
  const period = getLiveDashboardPeriod(new Date("2026-08-14T15:00:00.000Z"));
  assert.equal(period.startDate, "2026-08-02");
  assert.equal(period.endDate, "2026-09-01");
  assert.equal(period.startDay, 2);
  assert.equal(period.countedDays, 31);
  assert.equal(period.elapsedDays, 13);
  assert.equal(period.dates[0], "2026-08-02");
  assert.equal(period.dates.at(-1), "2026-09-01");
});

test("no dia 1 mantém o ciclo iniciado no mês anterior", () => {
  const period = getLiveDashboardPeriod(new Date("2026-09-01T15:00:00.000Z"));
  assert.equal(period.year, 2026);
  assert.equal(period.monthIndex, 7);
  assert.equal(period.startDate, "2026-08-02");
  assert.equal(period.endDate, "2026-09-01");
  assert.equal(period.countedDays, 31);
  assert.equal(period.elapsedDays, 31);
});

test("ciclo atravessa corretamente a virada do ano", () => {
  const period = getLiveDashboardPeriod(new Date("2027-01-01T15:00:00.000Z"));
  assert.equal(period.startDate, "2026-12-02");
  assert.equal(period.endDate, "2027-01-01");
  assert.equal(period.year, 2026);
  assert.equal(period.monthIndex, 11);
  assert.equal(period.elapsedDays, 31);
});
