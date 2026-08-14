import test from "node:test";
import assert from "node:assert/strict";
import { getLiveDashboardPeriod } from "../lib/live-dashboard-period.ts";

test("agosto de 2026 começa excepcionalmente no dia 4", () => {
  const period = getLiveDashboardPeriod(new Date("2026-08-14T15:00:00.000Z"));
  assert.equal(period.startDate, "2026-08-04");
  assert.equal(period.endDate, "2026-08-31");
  assert.equal(period.startDay, 4);
  assert.equal(period.countedDays, 28);
  assert.equal(period.elapsedDays, 11);
});

test("outros meses continuam começando no dia 1", () => {
  const period = getLiveDashboardPeriod(new Date("2026-09-14T15:00:00.000Z"));
  assert.equal(period.startDate, "2026-09-01");
  assert.equal(period.startDay, 1);
  assert.equal(period.countedDays, 30);
  assert.equal(period.elapsedDays, 14);
});
