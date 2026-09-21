// KPI sheet importer + weekly performance — unit tests.
//   Run:  deno test base44/shared/kpiSheet.test.ts

import { parseKpiSheet, weekEnding, channelFromHeader, matchSite, toEntity, figuresChanged, shopNameFromSheet } from "./kpiSheet.ts";
import { sitePerformance } from "./weeklyPerformance.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Mirrors the real layout: turnover run, commission run, supplier noise, count run.
function grid(): unknown[][] {
  const blank = () => new Array(20).fill(null);
  const year = blank(); year[1] = 2026; year[3] = "Turnover"; year[9] = "COMISSIONS";
  const head = blank();
  Object.assign(head, { 1: "Week", 2: "Week Ending", 3: "BITE", 4: "PHONE & PICK UP", 5: "DOORDASH", 6: "TABLES", 7: "UBER EATS", 8: "Total",
    9: "BITE", 10: "DOORDASH", 11: "UBER EATS", 12: "Total", 13: "DELRAY", 14: "BITE", 15: "PHONE / PICK UP", 16: "DOORDASH", 17: "TABLES CUSTOMER COUNT", 18: "UBER EATS", 19: " TRANSACTIONS " });
  const w1 = blank(); Object.assign(w1, { 1: 1, 2: 46026, 3: 2000, 4: 3000, 5: 100, 6: 600, 7: 6000, 8: 11700, 9: 45, 10: 40, 11: 2900, 14: 40, 15: 90, 16: 3, 17: 10, 18: 110 });
  const w2 = blank(); Object.assign(w2, { 1: 2, 3: 2100, 4: "#DIV/0!", 7: 5000 }); // partial week
  const w3 = blank(); w3[1] = 3; // empty future week
  return [blank(), year, head, w1, w2, w3];
}

Deno.test("week numbers map to Mon–Sun weeks ending on Sundays", () => {
  eq(weekEnding(2026, 1), "2026-01-04");
  eq(weekEnding(2026, 31), "2026-08-02");
  eq(weekEnding(2023, 1), "2023-01-01");
});

Deno.test("header text maps to channels; totals and counts are ignored", () => {
  eq(channelFromHeader("PHONE & PICK UP"), "phone_pickup");
  eq(channelFromHeader("TABLES CUSTOMER COUNT"), "tables");
  eq(channelFromHeader("Total"), null);
  eq(channelFromHeader(" TRANSACTIONS "), null);
});

Deno.test("parses turnover, commission and counts by header position", () => {
  const { rows, warnings } = parseKpiSheet("KPI TEST", grid());
  const w1 = rows.filter((r) => r.week === 1);
  const uber = w1.find((r) => r.channel === "uber_eats")!;
  eq([uber.gross_sales, uber.commission, uber.order_count], [6000, 2900, 110]);
  const phone = w1.find((r) => r.channel === "phone_pickup")!;
  eq([phone.gross_sales, phone.commission, phone.order_count], [3000, null, 90]);
  eq(w1.length, 5, "five channels in week 1");
  eq(rows.filter((r) => r.week === 2).map((r) => r.channel), ["bite", "uber_eats"], "#DIV/0! and blanks skipped");
  eq(rows.some((r) => r.week === 3), false, "empty week produces nothing");
  eq(warnings.length, 0, "matching dates → no warnings");
});

Deno.test("stale week-ending dates are corrected and reported once per block", () => {
  const g = grid();
  (g[3] as unknown[])[2] = 45661; // 2025-01-04 — a copied block's stale date
  const { rows, warnings } = parseKpiSheet("KPI TEST", g);
  eq(rows[0].week_ending, "2026-01-04");
  eq(warnings.length, 1);
});

Deno.test("tabs match sites by distinctive words", () => {
  const sites = [{ id: "a", name: "The Pizza Bar Strathmore" }, { id: "b", name: "The Pizza Bar Diggers Rest" }];
  eq(shopNameFromSheet("KPI DIGGERS REST "), "DIGGERS REST");
  eq(matchSite("DIGGERS REST", sites)?.id, "b");
  eq(matchSite("STRATHMORE", sites)?.id, "a");
  eq(matchSite("BRUNSWICK", sites), null);
  eq(shopNameFromSheet("BE STRATHMORE"), null);
});

Deno.test("entity shape is idempotent and cents-exact", () => {
  const { rows } = parseKpiSheet("KPI TEST", grid());
  const e = toEntity(rows.find((r) => r.channel === "uber_eats")!, "org", "site", "ref");
  eq([e.gross_sales_cents, e.commission_cents, e.net_sales_cents, e.dedup_key], [600000, 290000, 310000, "kpi_sheet|site|2026-01-04|uber_eats"]);
  eq(figuresChanged(e, { ...e }), false);
  eq(figuresChanged(e, { ...e, order_count: 111 }), true);
});

Deno.test("weekly performance: deltas, keep %, and drop flags", () => {
  const mk = (w: string, ch: string, gross: number, comm = 0, n = 10) => ({ week_ending: w, channel: ch, gross_sales_cents: gross, commission_cents: comm, order_count: n, has_order_count: true });
  const recs = [
    ...["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23"].map((w) => mk(w, "uber_eats", 600000, 300000)),
    mk("2026-08-30", "uber_eats", 300000, 150000),
    ...["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"].map((w) => mk(w, "phone_pickup", 500000)),
  ];
  const p = sitePerformance(recs, "2026-08-30");
  const uber = p.channels.find((c) => c.channel === "uber_eats")!;
  eq([uber.gross, uber.net, uber.keep_pct, uber.vs_avg4_pct], [300000, 150000, 0.5, -0.5]);
  eq(p.totals.gross, 800000);
  eq(p.flags.some((f) => f.severity === "warning" && f.message.startsWith("Uber Eats down 50%")), true);
  eq(p.flags.some((f) => f.message.startsWith("Phone")), false, "stable channel not flagged");
});
