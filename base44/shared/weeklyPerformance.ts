// Weekly performance maths over WeeklyChannelKPI records — pure, no I/O.
// All money is integer cents. "Keep" = gross sales minus platform commission.

export const CHANNEL_LABELS: Record<string, string> = {
  phone_pickup: "Phone & pickup", tables: "Tables", bite: "Bite",
  uber_eats: "Uber Eats", doordash: "DoorDash", menulog: "Menulog", hungry_hungry: "Hungry Hungry",
};
const CHANNEL_ORDER = Object.keys(CHANNEL_LABELS);

// Flag thresholds — deliberately conservative so the page only shouts about real moves.
export const FLAG_RULES = {
  movePct: 0.2,            // ±20% vs 4-week average
  minMoveCents: 30000,     // …and at least $300
  highCommissionPct: 0.45, // platforms keeping more than 45%
};

export interface Totals { gross: number; commission: number; net: number; orders: number; aov: number | null }

const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

export function totalsOf(rows: any[]): Totals {
  const gross = sum(rows, "gross_sales_cents");
  const commission = sum(rows, "commission_cents");
  const counted = rows.filter((r) => r.has_order_count);
  const orders = sum(counted, "order_count");
  const countedGross = sum(counted, "gross_sales_cents");
  return { gross, commission, net: gross - commission, orders, aov: orders > 0 ? Math.round(countedGross / orders) : null };
}

function avgTotals(weeks: any[][]): Totals | null {
  if (!weeks.length) return null;
  const t = weeks.map(totalsOf);
  const avg = (k: keyof Totals) => Math.round(t.reduce((a, x) => a + (Number(x[k]) || 0), 0) / t.length);
  const aovs = t.map((x) => x.aov).filter((v): v is number => v !== null);
  return {
    gross: avg("gross"), commission: avg("commission"), net: avg("net"), orders: avg("orders"),
    aov: aovs.length ? Math.round(aovs.reduce((a, b) => a + b, 0) / aovs.length) : null,
  };
}

export const pctChange = (cur: number, base: number | null | undefined) =>
  base ? (cur - base) / base : null;

/** Sorted-desc distinct week_ending values present in the records. */
export function weeksAvailable(records: any[]): string[] {
  return [...new Set(records.map((r) => r.week_ending))].sort().reverse();
}

/**
 * Build the performance view for one site and week.
 * `records` = all WeeklyChannelKPI rows for the site (any order).
 */
export function sitePerformance(records: any[], weekEnding: string) {
  const byWeek = new Map<string, any[]>();
  for (const r of records) (byWeek.get(r.week_ending) || byWeek.set(r.week_ending, []).get(r.week_ending)!).push(r);
  const prior = [...byWeek.keys()].filter((w) => w < weekEnding).sort().reverse();
  const cur = byWeek.get(weekEnding) || [];
  const prev = prior[0] ? byWeek.get(prior[0])! : [];
  const last4 = prior.slice(0, 4).map((w) => byWeek.get(w)!);

  const channelsSeen = new Set([...cur, ...last4.flat()].map((r) => r.channel));
  const channels = CHANNEL_ORDER.filter((c) => channelsSeen.has(c)).map((c) => {
    const t = totalsOf(cur.filter((r) => r.channel === c));
    const p = prev.length ? totalsOf(prev.filter((r) => r.channel === c)) : null;
    const a = avgTotals(last4.map((w) => w.filter((r) => r.channel === c)));
    return {
      channel: c, label: CHANNEL_LABELS[c] || c, ...t,
      keep_pct: t.gross ? t.net / t.gross : null,
      commission_pct: t.gross ? t.commission / t.gross : null,
      prev_gross: p?.gross ?? null, avg4_gross: a?.gross ?? null,
      vs_prev_pct: pctChange(t.gross, p?.gross), vs_avg4_pct: pctChange(t.gross, a?.gross),
      missing: cur.every((r) => r.channel !== c),
    };
  });

  const totals = totalsOf(cur);
  const prevTotals = prev.length ? totalsOf(prev) : null;
  const avg4 = avgTotals(last4);

  const flags: { severity: "warning" | "info" | "positive"; message: string }[] = [];
  const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-AU")}`;
  for (const ch of channels) {
    if (ch.missing && (ch.avg4_gross || 0) > 0) {
      flags.push({ severity: "warning", message: `${ch.label}: no figures entered this week (usually ~${money(ch.avg4_gross!)})` });
      continue;
    }
    if (ch.avg4_gross && ch.vs_avg4_pct !== null && Math.abs(ch.gross - ch.avg4_gross) >= FLAG_RULES.minMoveCents) {
      if (ch.vs_avg4_pct <= -FLAG_RULES.movePct) flags.push({ severity: "warning", message: `${ch.label} down ${Math.round(-ch.vs_avg4_pct * 100)}% vs 4-week average (${money(ch.gross)} vs ${money(ch.avg4_gross)})` });
      else if (ch.vs_avg4_pct >= FLAG_RULES.movePct) flags.push({ severity: "positive", message: `${ch.label} up ${Math.round(ch.vs_avg4_pct * 100)}% vs 4-week average (${money(ch.gross)} vs ${money(ch.avg4_gross)})` });
    }
    if (ch.commission_pct !== null && ch.commission_pct > FLAG_RULES.highCommissionPct) {
      flags.push({ severity: "info", message: `${ch.label}: platform kept ${Math.round(ch.commission_pct * 100)}% of sales (${money(ch.commission)})` });
    }
  }

  return {
    week_ending: weekEnding, has_data: cur.length > 0,
    totals, prev_totals: prevTotals, avg4_totals: avg4,
    vs_prev_pct: pctChange(totals.gross, prevTotals?.gross), vs_avg4_pct: pctChange(totals.gross, avg4?.gross),
    channels, flags,
  };
}

/** Weekly gross/net series (oldest → newest) for the last `n` weeks up to weekEnding. */
export function trend(records: any[], weekEnding: string, n = 12) {
  const weeks = weeksAvailable(records).filter((w) => w <= weekEnding).slice(0, n).reverse();
  return weeks.map((w) => {
    const t = totalsOf(records.filter((r) => r.week_ending === w));
    return { week_ending: w, gross: t.gross, net: t.net, orders: t.orders };
  });
}
