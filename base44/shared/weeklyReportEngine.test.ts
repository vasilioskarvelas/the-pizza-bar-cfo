// Phase 14H — Phase 4/5 regression test for M5 (cash-runway units).
// The financial engine computes cash_runway in WEEKS (cash/burn * 4.345), so the
// weekly-report metric metadata must label it "weeks", not "days".
//
//   Run:  deno test base44/shared/weeklyReportEngine.test.ts

import { METRIC_META } from "./weeklyReportEngine.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("M5: cash_runway metric unit is weeks (matches engine's weeks output)", () => {
  eq(METRIC_META.cash_runway.unit, "weeks");
});
