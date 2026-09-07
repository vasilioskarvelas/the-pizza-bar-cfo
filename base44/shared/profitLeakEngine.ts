// Deterministic Profit Leak Detection Engine.
// No generative AI. All leaks are computed from source data via rules,
// thresholds and historical comparisons. Industry-extensible via config.
// Each rule returns an array of raw leak objects (no persistence bookkeeping).

export const DEFAULT_CONFIG = {
  industry: "hospitality",
  min_monthly_impact_cents: 10000, // $100
  min_pct_of_revenue: 0.25,
  labour_target_pct: 30,
  supplier_warn_pct: 3,
  supplier_medium_pct: 5,
  supplier_high_pct: 10,
  contribution_target_pct: 60,
  merchant_target_pct: 1.5,
  discount_target_pct: 5,
  channel_min_contribution_pct: 15,
  cash_minimum_cents: 1000000,
  creep_min_periods: 4,
  creep_min_change_pct: 8,
};

export const CATEGORY_GROUPS = {
  Labour: ["labour"],
  Suppliers: ["supplier_price"],
  Pricing: ["underpriced_product"],
  Expenses: ["unused_subscription", "duplicate_subscription", "merchant_fees", "duplicate_expense", "unusual_expense", "expense_creep"],
  "Cash Flow": ["cash_flow_risk"],
  Receivables: ["overdue_receivables"],
  Channels: ["low_margin_channel", "excessive_discounting"],
  Waste: ["waste"],
};

const sum = (arr, f) => (arr || []).reduce((s, r) => s + (Number(r[f]) || 0), 0);
const avg = (arr, f) => ((arr && arr.length) ? sum(arr, f) / arr.length : 0);
const mean = (arr) => ((arr && arr.length) ? arr.reduce((s, v) => s + (Number(v) || 0), 0) / arr.length : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v);

function severityFromImpact(monthlyImpactCents, monthlyRevenueCents, opts = {}) {
  const abs = Math.abs(monthlyImpactCents || 0);
  const rev = monthlyRevenueCents || 0;
  const pct = rev > 0 ? (abs / rev) * 100 : 0;
  if (opts.cashRisk) return abs > 500000 ? "critical" : "high";
  if (opts.oneOff) {
    if (abs >= 200000) return "high";
    if (abs >= 50000) return "medium";
    return "low";
  }
  if (abs >= 500000 && (pct >= 1 || rev === 0)) return "critical";
  if (abs >= 200000 && pct >= 0.5) return "high";
  if (abs >= 100000) return "medium";
  return "low";
}

export function isMaterial(monthlyImpactCents, monthlyRevenueCents, config, opts = {}) {
  if (opts.always) return true; // duplicate, cash risk, compliance/fraud
  const minAbs = config.min_monthly_impact_cents;
  const minPct = config.min_pct_of_revenue;
  const pct = monthlyRevenueCents > 0 ? (Math.abs(monthlyImpactCents) / monthlyRevenueCents) * 100 : 0;
  return Math.abs(monthlyImpactCents) >= minAbs || pct >= minPct;
}

function monthlyRevenue(snaps) {
  if (!snaps || !snaps.length) return 0;
  return sum(snaps.slice(-28), "revenue") * (30 / 28);
}

function shiftDate(ds, days) {
  const d = new Date(ds + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- 1. LABOUR COST LEAK ----------
export function detectLabourLeak(snaps, config) {
  const out = [];
  if (!snaps || snaps.length < 14) return out;
  const asc = [...snaps].sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
  const last7 = asc.slice(-7);
  const curRev = sum(last7, "revenue");
  const curLabour = sum(last7, "labour_cents");
  const curPct = curRev > 0 ? (curLabour / curRev) * 100 : 0;

  // Same-day-of-week baseline: for each of the last 7 days, prior 4 same-weekday occurrences.
  const dayBaselines = [];
  for (const d of last7) {
    const dow = new Date(d.period_start + "T00:00:00Z").getUTCDay();
    const prior = asc.filter((s) => s.period_start < d.period_start && new Date(s.period_start + "T00:00:00Z").getUTCDay() === dow).slice(-4);
    if (prior.length) {
      const r = sum(prior, "revenue");
      const l = sum(prior, "labour_cents");
      if (r > 0) dayBaselines.push((l / r) * 100);
    }
  }
  const baselinePct = dayBaselines.length ? mean(dayBaselines) : null;
  if (baselinePct == null) return out;

  // 28d vs prior 90d for persistence
  const last28 = asc.slice(-28);
  const prior90 = asc.slice(Math.max(0, asc.length - 118), asc.length - 28);
  const pct28 = sum(last28, "revenue") > 0 ? (sum(last28, "labour_cents") / sum(last28, "revenue")) * 100 : 0;
  const pct90 = sum(prior90, "revenue") > 0 ? (sum(prior90, "labour_cents") / sum(prior90, "revenue")) * 100 : 0;
  const excess28 = pct28 - pct90;

  const excessPp = curPct - baselinePct;
  if (excessPp <= 0.5) return out; // require a meaningful rise

  const avgDailyRev = curRev / 7;
  const monthlyImpact = Math.round(avgDailyRev * 30 * (excessPp / 100));
  const weeklyImpact = Math.round(avgDailyRev * 7 * (excessPp / 100));
  const annualImpact = monthlyImpact * 12;

  // Revenue spike guard: if sales grew a lot, labour rise may be justified.
  const baselineRevPerDay = dayBaselines.length ? avg(last7.map((d, i) => i)) : 0; // placeholder
  const baselineRev = last7.reduce((s, d) => {
    const dow = new Date(d.period_start + "T00:00:00Z").getUTCDay();
    const prior = asc.filter((s2) => s2.period_start < d.period_start && new Date(s2.period_start + "T00:00:00Z").getUTCDay() === dow).slice(-4);
    return s + avg(prior, "revenue");
  }, 0);
  const revGrowthPct = baselineRev > 0 ? ((curRev - baselineRev) / baselineRev) * 100 : 0;

  let confidence = 60;
  if (asc.length >= 90) confidence += 15;
  if (excess28 > 0.5) confidence += 15; // persistent across periods
  if (revGrowthPct > 15) confidence -= 20; // sales spike may justify labour
  if (asc.length < 28) confidence -= 10;
  confidence = clamp(round(confidence), 20, 95);

  const monthlyRev = monthlyRevenue(asc);
  out.push({
    leak_key: "labour:overall",
    category: "labour",
    leak_type: "labour_cost_leak",
    title: `Labour is ${excessPp.toFixed(1)} points above same-day baseline`,
    explanation: `Labour reached ${curPct.toFixed(1)}% of revenue over the last 7 days versus a same-day-of-week baseline of ${baselinePct.toFixed(1)}%. Excess labour is costing an estimated $${(monthlyImpact / 100).toLocaleString()} per month.`,
    current_value: +curPct.toFixed(1),
    baseline_value: +baselinePct.toFixed(1),
    variance: +(curPct - baselinePct).toFixed(1),
    variance_pct: null,
    weekly_impact_cents: weeklyImpact,
    monthly_impact_cents: monthlyImpact,
    annual_impact_cents: annualImpact,
    confidence_score: confidence,
    severity: severityFromImpact(monthlyImpact, monthlyRev),
    evidence: {
      current_period: { revenue: sum(last7, "revenue"), labour: sum(last7, "labour_cents"), labour_pct: +curPct.toFixed(1) },
      baseline: { labour_pct: +baselinePct.toFixed(1), method: "same-day-of-week, prior 4 weeks" },
      variance_pp: +(curPct - baselinePct).toFixed(1),
      persistence_28d_vs_90d_pp: +excess28.toFixed(1),
      revenue_growth_pct: +revGrowthPct.toFixed(1),
      calculation: `avg daily revenue × 30 × excess labour % = $${(avgDailyRev / 100).toFixed(0)} × 30 × ${excessPp.toFixed(1)}%`,
    },
    source_systems: ["POS Sales", "Payroll"],
    recommended_action: "Review the roster for the dayparts with the lowest sales per labour hour and reduce hours where labour % is highest.",
    action_difficulty: "medium",
  });
  return out;
}

// ---------- 2. SUPPLIER PRICE INCREASE ----------
export function detectSupplierPriceLeaks(lines, config) {
  const out = [];
  if (!lines || !lines.length) return out;
  const groups = {};
  for (const l of lines) {
    const key = `${(l.supplier || "").toLowerCase()}::${(l.product || "").toLowerCase()}`;
    if (!groups[key]) groups[key] = { supplier: l.supplier, product: l.product, rows: [] };
    groups[key].rows.push(l);
  }
  const today = lines.reduce((m, l) => (l.invoice_date > m ? l.invoice_date : m), lines[0].invoice_date);
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    const rows = g.rows.sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : 1));
    if (rows.length < 2) continue;
    const latest = rows[rows.length - 1];
    const d30 = rows.filter((r) => r.invoice_date >= shiftDate(today, -30));
    const d90 = rows.filter((r) => r.invoice_date >= shiftDate(today, -90));
    const avg30 = d30.length ? avg(d30, "unit_cost_cents") : latest.unit_cost_cents;
    const avg90 = d90.length ? avg(d90, "unit_cost_cents") : latest.unit_cost_cents;
    const prev = rows[rows.length - 2].unit_cost_cents;
    const incVs90 = latest.unit_cost_cents - avg90;
    const pctVs90 = avg90 > 0 ? (incVs90 / avg90) * 100 : 0;
    if (pctVs90 < config.supplier_warn_pct) continue;
    const monthlyQty = sum(rows.filter((r) => r.invoice_date >= shiftDate(today, -30)), "quantity");
    const monthlyImpact = Math.round(incVs90 * monthlyQty);
    if (!isMaterial(monthlyImpact, 0, config, { always: pctVs90 >= config.supplier_high_pct })) continue;
    let band = "low";
    if (pctVs90 >= config.supplier_high_pct) band = "high";
    else if (pctVs90 >= config.supplier_medium_pct) band = "medium";
    else band = "low";
    let confidence = 55;
    if (rows.length >= 6) confidence += 20;
    if (latest.unit_cost_cents > prev) confidence += 15; // persisted vs previous purchase
    if (d30.length < 2) confidence -= 15;
    confidence = clamp(round(confidence), 25, 95);
    out.push({
      leak_key: `supplier_price:${key}`,
      category: "supplier_price",
      leak_type: "supplier_price_increase",
      title: `${g.product} from ${g.supplier} up ${pctVs90.toFixed(1)}%`,
      explanation: `${g.product} unit cost rose from $${(avg90 / 100).toFixed(2)} (90-day avg) to $${(latest.unit_cost_cents / 100).toFixed(2)} — a ${pctVs90.toFixed(1)}% increase. At ~${monthlyQty} units/month this is about $${(monthlyImpact / 100).toFixed(0)} per month.`,
      current_value: latest.unit_cost_cents,
      baseline_value: Math.round(avg90),
      variance: Math.round(incVs90),
      variance_pct: +pctVs90.toFixed(1),
      weekly_impact_cents: Math.round(monthlyImpact / 4),
      monthly_impact_cents: monthlyImpact,
      annual_impact_cents: monthlyImpact * 12,
      confidence_score: confidence,
      severity: severityFromImpact(monthlyImpact, 0, { oneOff: false }),
      evidence: {
        product: g.product, supplier: g.supplier,
        latest_unit_cost: latest.unit_cost_cents, avg_90d: Math.round(avg90), avg_30d: Math.round(avg30), previous_unit_cost: prev,
        pct_vs_90d: +pctVs90.toFixed(1),
        monthly_quantity: monthlyQty,
        calculation: `(latest - 90d avg) × monthly quantity = ($${(latest.unit_cost_cents / 100).toFixed(2)} - $${(avg90 / 100).toFixed(2)}) × ${monthlyQty}`,
        band,
      },
      source_systems: ["Supplier Invoices"],
      recommended_action: "Request a quote from two alternative suppliers and review recipe yields or menu pricing to offset the increase.",
      action_difficulty: "medium",
    });
  }
  return out;
}

// ---------- 3. UNDERPRICED PRODUCT ----------
export function detectUnderpricedProducts(menu, config) {
  const out = [];
  if (!menu || !menu.length) return out;
  for (const m of menu) {
    const contribution = m.selling_price_cents - (m.ingredient_cost_cents || 0) - (m.packaging_cost_cents || 0) - (m.platform_commission_cents || 0) - (m.labour_allocation_cents || 0);
    const marginPct = m.selling_price_cents > 0 ? (contribution / m.selling_price_cents) * 100 : 0;
    if (marginPct >= config.contribution_target_pct) continue;
    const scenarios = [50, 100, 200].map((p) => ({ price_lift_cents: p, additional_monthly: m.sales_quantity * p }));
    const monthlyImpact = scenarios[1].additional_monthly; // $1 scenario
    if (!isMaterial(monthlyImpact, 0, config)) continue;
    let confidence = 55;
    if ((m.sales_quantity || 0) >= 200) confidence += 25;
    if ((m.ingredient_cost_change_pct || 0) > 5) confidence += 10; // cost rose without price move
    confidence = clamp(round(confidence), 30, 90);
    out.push({
      leak_key: `underpriced:${(m.name || "").toLowerCase()}`,
      category: "underpriced_product",
      leak_type: "underpriced_product",
      title: `${m.name} is underpriced (contribution ${marginPct.toFixed(0)}%)`,
      explanation: `${m.name} sells ${m.sales_quantity} units/month at a ${marginPct.toFixed(0)}% contribution margin against a ${config.contribution_target_pct}% target. A $1 increase at current volume is about $${(monthlyImpact / 100).toFixed(0)}/month — labelled as potential contribution at current sales volume.`,
      current_value: +marginPct.toFixed(1),
      baseline_value: config.contribution_target_pct,
      variance: +(marginPct - config.contribution_target_pct).toFixed(1),
      variance_pct: null,
      weekly_impact_cents: Math.round(monthlyImpact / 4),
      monthly_impact_cents: monthlyImpact,
      annual_impact_cents: monthlyImpact * 12,
      confidence_score: confidence,
      severity: severityFromImpact(monthlyImpact, 0),
      evidence: {
        item: m.name, selling_price: m.selling_price_cents, ingredient_cost: m.ingredient_cost_cents, packaging: m.packaging_cost_cents, commission: m.platform_commission_cents, labour: m.labour_allocation_cents,
        contribution: contribution, contribution_pct: +marginPct.toFixed(1), target_pct: config.contribution_target_pct,
        sales_quantity: m.sales_quantity,
        scenarios: scenarios.map((s) => ({ lift: s.price_lift_cents / 100, additional_monthly_cents: s.additional_monthly })),
        note: "Potential contribution at current sales volume — does not assume volume is retained after a price change.",
      },
      source_systems: ["POS", "Recipe Costing"],
      recommended_action: "Test a small price increase on this high-volume item and monitor volume for 2–3 weeks before rolling out.",
      action_difficulty: "easy",
    });
  }
  return out;
}

// ---------- 4. OVERDUE RECEIVABLES ----------
export function detectOverdueReceivables(receivables, config) {
  const out = [];
  if (!receivables || !receivables.length) return out;
  const today = receivables.reduce((m, r) => (r.due_date > m ? r.due_date : m), receivables[0].due_date);
  const overdue = receivables.filter((r) => r.status !== "paid" && r.due_date < today);
  if (!overdue.length) return out;
  const total = sum(receivables, "amount_cents");
  const overdueTotal = sum(overdue, "amount_cents");
  const avgDays = mean(overdue.map((r) => Math.max(0, Math.round((new Date(today) - new Date(r.due_date)) / 86400000))));
  const pctOverdue = total > 0 ? (overdueTotal / total) * 100 : 0;
  const buckets = { "1-7": 0, "8-14": 0, "15-30": 0, "31-60": 0, "60+": 0 };
  for (const r of overdue) {
    const days = Math.max(0, Math.round((new Date(today) - new Date(r.due_date)) / 86400000));
    if (days <= 7) buckets["1-7"] += r.amount_cents;
    else if (days <= 14) buckets["8-14"] += r.amount_cents;
    else if (days <= 30) buckets["15-30"] += r.amount_cents;
    else if (days <= 60) buckets["31-60"] += r.amount_cents;
    else buckets["60+"] += r.amount_cents;
  }
  const confidence = clamp(60 + (overdue.length >= 3 ? 15 : 0) + (avgDays > 14 ? 15 : 0), 40, 95);
  out.push({
    leak_key: "overdue_receivables:overall",
    category: "overdue_receivables",
    leak_type: "overdue_receivables",
    title: `${overdue.length} overdue invoices — ${formatPctLabel(pctOverdue)} of receivables`,
    explanation: `${overdue.length} invoices totalling $${(overdueTotal / 100).toFixed(0)} are overdue by an average of ${Math.round(avgDays)} days. This is a cash-flow / collection risk, not lost profit — the potential cash recoverable is $${(overdueTotal / 100).toFixed(0)}.`,
    current_value: overdueTotal,
    baseline_value: 0,
    variance: overdueTotal,
    variance_pct: +pctOverdue.toFixed(1),
    weekly_impact_cents: 0,
    monthly_impact_cents: 0,
    annual_impact_cents: 0,
    confidence_score: confidence,
    severity: severityFromImpact(overdueTotal, 0, { oneOff: true }),
    evidence: {
      total_receivables: total, overdue_total: overdueTotal, pct_overdue: +pctOverdue.toFixed(1), avg_days_overdue: Math.round(avgDays),
      ageing_buckets: buckets, overdue_invoices: overdue.map((r) => ({ ref: r.invoice_ref, customer: r.customer, amount: r.amount_cents, due_date: r.due_date })),
      note: "Cash flow / collection risk. Potential cash recoverable, not lost profit.",
    },
    source_systems: ["Accounting (Receivables)"],
    recommended_action: "Chase overdue invoices today, starting with the largest and oldest. Set a payment plan for repeat late payers.",
    action_difficulty: "easy",
  });
  return out;
}

// ---------- 5. UNUSED / DUPLICATE SUBSCRIPTIONS ----------
export function detectSubscriptionLeaks(expenses, config) {
  const out = [];
  if (!expenses || !expenses.length) return out;
  const subs = expenses.filter((e) => e.recurring && (e.category === "software" || e.category === "subscriptions"));
  const groups = {};
  for (const s of subs) {
    const key = `${(s.supplier || s.description || "").toLowerCase()}::${s.amount_cents}`;
    if (!groups[key]) groups[key] = { label: s.supplier || s.description, amount: s.amount_cents, rows: [] };
    groups[key].rows.push(s);
  }
  // Duplicate recurring: same supplier+amount appearing as multiple distinct services → possible duplicate
  const bySupplier = {};
  for (const s of subs) {
    const k = (s.supplier || s.description || "").toLowerCase();
    if (!bySupplier[k]) bySupplier[k] = [];
    bySupplier[k].push(s);
  }
  for (const k of Object.keys(bySupplier)) {
    const amounts = new Set(bySupplier[k].map((s) => s.amount_cents));
    if (amounts.size > 1) {
      // price increase on same subscription
      const sorted = bySupplier[k].sort((a, b) => (a.date < b.date ? -1 : 1));
      const first = sorted[0].amount_cents;
      const last = sorted[sorted.length - 1].amount_cents;
      if (last > first) {
        const monthlyImpact = (last - first);
        out.push({
          leak_key: `subscription_price:${k}`,
          category: "unused_subscription",
          leak_type: "subscription_price_increase",
          title: `Subscription ${bySupplier[k][0].supplier || bySupplier[k][0].description} increased`,
          explanation: `Recurring charge for ${bySupplier[k][0].supplier || bySupplier[k][0].description} rose from $${(first / 100).toFixed(0)} to $${(last / 100).toFixed(0)} per period.`,
          current_value: last, baseline_value: first, variance: last - first, variance_pct: first > 0 ? +(((last - first) / first) * 100).toFixed(1) : 0,
          weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
          confidence_score: 70, severity: severityFromImpact(monthlyImpact, 0),
          evidence: { supplier: bySupplier[k][0].supplier, from: first, to: last },
          source_systems: ["Accounting (Expenses)"],
          recommended_action: "Review whether the higher tier is needed or can be downgraded.",
          action_difficulty: "easy",
        });
      }
    }
  }
  // Possible unused: recurring software with no activity data available → review recommended
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    if (g.rows.length < 2) continue;
    const monthlyImpact = g.amount;
    out.push({
      leak_key: `subscription_unused:${key}`,
      category: "unused_subscription",
      leak_type: "possible_unused_subscription",
      title: `Possible unused subscription — ${g.label}`,
      explanation: `A recurring ${g.label} charge of $${(g.amount / 100).toFixed(0)} appears each period. No activity data is connected, so this is flagged as a possible unused subscription — review recommended, not a confirmed saving.`,
      current_value: g.amount, baseline_value: 0, variance: g.amount, variance_pct: null,
      weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
      confidence_score: 35,
      severity: severityFromImpact(monthlyImpact, 0),
      evidence: { supplier: g.label, recurring_amount: g.amount, occurrences: g.rows.length, note: "No activity data available — review recommended, not confirmed." },
      source_systems: ["Accounting (Expenses)"],
      recommended_action: "Confirm whether this service is still used; cancel if not.",
      action_difficulty: "easy",
    });
  }
  return out;
}

// ---------- 6. MERCHANT FEE LEAK ----------
export function detectMerchantFeeLeak(channels, expenses, config) {
  const out = [];
  const cardChannels = (channels || []).filter((c) => ["in_store", "pickup", "direct_online"].includes(c.channel));
  const cardRevenueTotal = sum(cardChannels, "revenue_cents");
  const mfRows = (expenses || []).filter((e) => e.category === "merchant_fees");
  const merchantFeesTotal = sum(mfRows, "amount_cents");
  if (cardRevenueTotal <= 0 || merchantFeesTotal <= 0) return out;
  const channelDays = new Set((channels || []).map((c) => c.date)).size || 30;
  const mfMonths = new Set(mfRows.map((e) => e.date.slice(0, 7))).size || 1;
  const cardRevenueMonthly = (cardRevenueTotal / channelDays) * 30;
  const merchantFeesMonthly = merchantFeesTotal / mfMonths;
  const rate = cardRevenueMonthly > 0 ? (merchantFeesMonthly / cardRevenueMonthly) * 100 : 0;
  if (rate <= config.merchant_target_pct) return out;
  const monthlyImpact = Math.round((rate - config.merchant_target_pct) / 100 * cardRevenueMonthly);
  if (!isMaterial(monthlyImpact, 0, config)) return out;
  out.push({
    leak_key: "merchant_fees:overall",
    category: "merchant_fees",
    leak_type: "merchant_fee_rate_high",
    title: `Merchant fees at ${rate.toFixed(2)}% vs ${config.merchant_target_pct}% target`,
    explanation: `Effective merchant fee rate is ${rate.toFixed(2)}% of card revenue against a ${config.merchant_target_pct}% target. Returning to target would save about $${(monthlyImpact / 100).toFixed(0)}/month.`,
    current_value: +rate.toFixed(2), baseline_value: config.merchant_target_pct, variance: +(rate - config.merchant_target_pct).toFixed(2), variance_pct: null,
    weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
    confidence_score: 70, severity: severityFromImpact(monthlyImpact, 0),
    evidence: { merchant_fees_monthly: Math.round(merchantFeesMonthly), card_revenue_monthly: Math.round(cardRevenueMonthly), effective_rate: +rate.toFixed(2), target_rate: config.merchant_target_pct, calculation: `(rate - target) × monthly card revenue` },
    source_systems: ["Payment Processor", "POS"],
    recommended_action: "Request a rate review from your processor or add a card surcharge within regulatory limits.",
    action_difficulty: "medium",
  });
  return out;
}

// ---------- 7. DUPLICATE EXPENSE DETECTION ----------
export function detectDuplicateExpenses(expenses, config) {
  const out = [];
  if (!expenses || !expenses.length) return out;
  const rows = [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.date && b.date && Math.abs((new Date(b.date) - new Date(a.date)) / 86400000) > 14) break;
      const sameRef = a.reference && b.reference && a.reference === b.reference;
      const sameSupplier = (a.supplier || "").toLowerCase() === (b.supplier || "").toLowerCase() && a.supplier;
      const sameAmount = a.amount_cents === b.amount_cents;
      if (sameRef && sameSupplier && sameAmount) {
        out.push({
          leak_key: `duplicate:${a.supplier}:${a.reference}:${a.amount_cents}`,
          category: "duplicate_expense", leak_type: "duplicate_invoice",
          title: `Possible duplicate invoice ${a.reference} — ${a.supplier}`,
          explanation: `Two expenses from ${a.supplier} share reference ${a.reference} and amount $${(a.amount_cents / 100).toFixed(0)} (high confidence). Verify before any action.`,
          current_value: a.amount_cents, baseline_value: 0, variance: a.amount_cents, variance_pct: null,
          weekly_impact_cents: 0, monthly_impact_cents: 0, annual_impact_cents: a.amount_cents,
          confidence_score: 92, severity: severityFromImpact(a.amount_cents, 0, { oneOff: true }),
          evidence: { supplier: a.supplier, reference: a.reference, amount: a.amount_cents, dates: [a.date, b.date], confidence: "high" },
          source_systems: ["Accounting (Expenses)"],
          recommended_action: "Confirm with the supplier whether this was a duplicate payment and request a refund if so.",
          action_difficulty: "medium",
        });
      } else if (sameSupplier && sameAmount && !sameRef && a.date !== b.date) {
        out.push({
          leak_key: `duplicate_similar:${a.supplier}:${a.amount_cents}:${a.date}`,
          category: "duplicate_expense", leak_type: "possible_duplicate_expense",
          title: `Similar duplicate expense — ${a.supplier} $${(a.amount_cents / 100).toFixed(0)}`,
          explanation: `Two expenses from ${a.supplier} for $${(a.amount_cents / 100).toFixed(0)} within a short window (different references, lower confidence). Review recommended.`,
          current_value: a.amount_cents, baseline_value: 0, variance: a.amount_cents, variance_pct: null,
          weekly_impact_cents: 0, monthly_impact_cents: 0, annual_impact_cents: a.amount_cents,
          confidence_score: 45, severity: severityFromImpact(a.amount_cents, 0, { oneOff: true }),
          evidence: { supplier: a.supplier, amount: a.amount_cents, dates: [a.date, b.date], references: [a.reference, b.reference], confidence: "low" },
          source_systems: ["Accounting (Expenses)"],
          recommended_action: "Check whether these are genuinely separate purchases before assuming a duplicate.",
          action_difficulty: "medium",
        });
      }
    }
  }
  return out;
}

// ---------- 8. UNUSUAL EXPENSE DETECTION ----------
const RECURRING_KNOWN = new Set(["rent", "payroll", "insurance", "finance"]);
export function detectUnusualExpenses(expenses, config) {
  const out = [];
  if (!expenses || !expenses.length) return out;
  const byCat = {};
  for (const e of expenses) {
    if (!byCat[e.category]) byCat[e.category] = [];
    byCat[e.category].push(e);
  }
  for (const cat of Object.keys(byCat)) {
    const rows = byCat[cat].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (rows.length < 3) continue;
    for (let i = 0; i < rows.length; i++) {
      const e = rows[i];
      const others = rows.filter((_, j) => j !== i);
      const a = avg(others, "amount_cents");
      const sd = Math.sqrt(mean(others.map((o) => Math.pow(o.amount_cents - a, 2))));
      if (sd === 0) continue; // no variation → recurring fixed, skip
      const z = (e.amount_cents - a) / sd;
      if (e.amount_cents > a * 1.8 && z > 1.8) {
        // Skip recurring known categories unless the spike is large vs the fixed amount
        if (RECURRING_KNOWN.has(cat)) continue;
        const impact = Math.round(e.amount_cents - a);
        if (!isMaterial(impact, 0, config, { always: e.amount_cents > a * 3 })) continue;
        out.push({
          leak_key: `unusual:${cat}:${e.supplier || ""}:${e.date}`,
          category: "unusual_expense", leak_type: "unusual_expense",
          title: `Unusual ${cat} expense — ${e.supplier || e.description || ""}`,
          explanation: `A ${cat} expense of $${(e.amount_cents / 100).toFixed(0)} is well above the category average of $${(a / 100).toFixed(0)} (z-score ${z.toFixed(1)}). One-off anomaly — not a recurring pattern.`,
          current_value: e.amount_cents, baseline_value: Math.round(a), variance: impact, variance_pct: a > 0 ? +((impact / a) * 100).toFixed(1) : 0,
          weekly_impact_cents: 0, monthly_impact_cents: 0, annual_impact_cents: impact,
          confidence_score: clamp(round(55 + (rows.length >= 6 ? 15 : 0)), 35, 85),
          severity: severityFromImpact(impact, 0, { oneOff: true }),
          evidence: { category: cat, amount: e.amount_cents, category_avg: Math.round(a), std_dev: Math.round(sd), z_score: +z.toFixed(1), date: e.date, description: e.description },
          source_systems: ["Accounting (Expenses)"],
          recommended_action: "Investigate the cause of this spike and confirm it is not a billing error.",
          action_difficulty: "medium",
        });
      }
    }
  }
  return out;
}

// ---------- 9. EXPENSE CREEP ----------
const CREEP_FIXED = new Set(["rent", "insurance", "finance"]);
export function detectExpenseCreep(expenses, config) {
  const out = [];
  if (!expenses || !expenses.length) return out;
  const byCat = {};
  for (const e of expenses) {
    if (CREEP_FIXED.has(e.category)) continue;
    const m = e.date.slice(0, 7);
    if (!byCat[e.category]) byCat[e.category] = {};
    byCat[e.category][m] = (byCat[e.category][m] || 0) + e.amount_cents;
  }
  for (const cat of Object.keys(byCat)) {
    const months = Object.keys(byCat[cat]).sort();
    if (months.length < config.creep_min_periods) continue;
    const vals = months.map((m) => byCat[cat][m]);
    const first3 = vals.slice(0, 3);
    const last3 = vals.slice(-3);
    const firstAvg = mean(first3);
    const lastAvg = mean(last3);
    if (firstAvg <= 0) continue;
    const changePct = ((lastAvg - firstAvg) / firstAvg) * 100;
    if (changePct < config.creep_min_change_pct) continue;
    const monthlyImpact = Math.round(lastAvg - firstAvg);
    if (!isMaterial(monthlyImpact, 0, config)) continue;
    out.push({
      leak_key: `expense_creep:${cat}`,
      category: "expense_creep", leak_type: "expense_creep",
      title: `${cat} costs creeping up ${changePct.toFixed(0)}%`,
      explanation: `${cat} has risen from a ${firstAvg / 100 | 0}-month avg of $${(firstAvg / 100).toFixed(0)} to $${(lastAvg / 100).toFixed(0)} — a ${changePct.toFixed(0)}% increase with no single large spike. Trend slope is positive.`,
      current_value: Math.round(lastAvg), baseline_value: Math.round(firstAvg), variance: monthlyImpact, variance_pct: +changePct.toFixed(1),
      weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
      confidence_score: clamp(round(55 + (months.length >= 6 ? 20 : 0)), 40, 85),
      severity: severityFromImpact(monthlyImpact, 0),
      evidence: { category: cat, monthly_totals: months.map((m, i) => ({ month: m, total: vals[i] })), first_avg: Math.round(firstAvg), last_avg: Math.round(lastAvg), change_pct: +changePct.toFixed(1) },
      source_systems: ["Accounting (Expenses)"],
      recommended_action: "Review the underlying drivers of this gradual increase and negotiate or switch suppliers if needed.",
      action_difficulty: "medium",
    });
  }
  return out;
}

// ---------- 10. LOW-MARGIN CHANNEL ----------
export function detectLowMarginChannels(channels, config) {
  const out = [];
  if (!channels || !channels.length) return out;
  const byChan = {};
  for (const c of channels) {
    if (!byChan[c.channel]) byChan[c.channel] = [];
    byChan[c.channel].push(c);
  }
  for (const ch of Object.keys(byChan)) {
    const rows = byChan[ch];
    const revenue = sum(rows, "revenue_cents");
    if (revenue < 500000) continue; // immaterial channel
    const contribution = sum(rows, "contribution_cents");
    const marginPct = revenue > 0 ? (contribution / revenue) * 100 : 0;
    if (marginPct >= config.channel_min_contribution_pct) continue;
    const monthlyImpact = Math.round(((config.channel_min_contribution_pct - marginPct) / 100) * revenue);
    out.push({
      leak_key: `low_margin_channel:${ch}`,
      category: "low_margin_channel", leak_type: "low_margin_channel",
      title: `${labelChannel(ch)} contribution only ${marginPct.toFixed(0)}%`,
      explanation: `${labelChannel(ch)} generates $${(revenue / 100).toFixed(0)} in revenue but only ${marginPct.toFixed(0)}% contribution after commission, packaging, refunds and direct costs. Revenue is not profit here.`,
      current_value: +marginPct.toFixed(1), baseline_value: config.channel_min_contribution_pct, variance: +(marginPct - config.channel_min_contribution_pct).toFixed(1), variance_pct: null,
      weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
      confidence_score: 75, severity: severityFromImpact(monthlyImpact, revenue),
      evidence: { channel: ch, revenue, discounts: sum(rows, "discounts_cents"), commission: sum(rows, "commission_cents"), packaging: sum(rows, "packaging_cents"), refunds: sum(rows, "refunds_cents"), direct_costs: sum(rows, "direct_costs_cents"), contribution, contribution_pct: +marginPct.toFixed(1) },
      source_systems: ["POS", "Delivery Platforms"],
      recommended_action: "Review pricing, packaging or commission on this channel; consider shifting volume to higher-margin channels.",
      action_difficulty: "hard",
    });
  }
  return out;
}

// ---------- 11. EXCESSIVE DISCOUNTING ----------
export function detectExcessiveDiscounting(channels, config) {
  const out = [];
  if (!channels || !channels.length) return out;
  const byChan = {};
  for (const c of channels) {
    if (!byChan[c.channel]) byChan[c.channel] = [];
    byChan[c.channel].push(c);
  }
  for (const ch of Object.keys(byChan)) {
    const rows = byChan[ch];
    const gross = sum(rows, "revenue_cents") + sum(rows, "discounts_cents");
    if (gross <= 0) continue;
    const discountPct = (sum(rows, "discounts_cents") / gross) * 100;
    if (discountPct <= config.discount_target_pct) continue;
    const revenue = sum(rows, "revenue_cents");
    const monthlyImpact = Math.round(((discountPct - config.discount_target_pct) / 100) * gross);
    if (!isMaterial(monthlyImpact, 0, config)) continue;
    out.push({
      leak_key: `discounting:${ch}`,
      category: "excessive_discounting", leak_type: "excessive_discounting",
      title: `${labelChannel(ch)} discounts at ${discountPct.toFixed(1)}% vs ${config.discount_target_pct}% target`,
      explanation: `Discounts on ${labelChannel(ch)} are ${discountPct.toFixed(1)}% of gross sales against a ${config.discount_target_pct}% target. Reducing discounts to target would recover about $${(monthlyImpact / 100).toFixed(0)}/month.`,
      current_value: +discountPct.toFixed(1), baseline_value: config.discount_target_pct, variance: +(discountPct - config.discount_target_pct).toFixed(1), variance_pct: null,
      weekly_impact_cents: Math.round(monthlyImpact / 4), monthly_impact_cents: monthlyImpact, annual_impact_cents: monthlyImpact * 12,
      confidence_score: 65, severity: severityFromImpact(monthlyImpact, revenue),
      evidence: { channel: ch, discounts: sum(rows, "discounts_cents"), gross_sales: gross, discount_pct: +discountPct.toFixed(1), target_pct: config.discount_target_pct },
      source_systems: ["POS"],
      recommended_action: "Review active promotions and manager discount codes; tighten discount approval rules.",
      action_difficulty: "medium",
    });
  }
  return out;
}

// ---------- 14. CASH FLOW RISK ----------
export function detectCashFlowRisk(snaps, config) {
  const out = [];
  if (!snaps || snaps.length < 14) return out;
  const asc = [...snaps].sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
  const cur = asc[asc.length - 1];
  const recent = asc.slice(-14);
  const avgNet = avg(recent, "net_cash_flow");
  const proj30 = cur.cash_position + avgNet * 30;
  if (proj30 >= config.cash_minimum_cents) return out;
  const shortfall = config.cash_minimum_cents - proj30;
  const daysToFloor = avgNet < 0 ? Math.floor((cur.cash_position - config.cash_minimum_cents) / Math.abs(avgNet)) : 30;
  const obligations = (cur.bills_due || 0) + (cur.tax_obligations || 0) + (cur.labour_cents || 0);
  out.push({
    leak_key: "cash_flow_risk:overall",
    category: "cash_flow_risk", leak_type: "cash_flow_risk",
    title: `Projected cash falls below $${(config.cash_minimum_cents / 100).toFixed(0)} in ~${Math.max(0, daysToFloor)} days`,
    explanation: `At the current 14-day average net cash flow, cash is projected to reach $${(proj30 / 100).toFixed(0)} in 30 days — below your $${(config.cash_minimum_cents / 100).toFixed(0)} floor. This is a financial risk, not a profit leak.`,
    current_value: Math.round(proj30), baseline_value: config.cash_minimum_cents, variance: -Math.round(shortfall), variance_pct: null,
    weekly_impact_cents: 0, monthly_impact_cents: 0, annual_impact_cents: 0,
    confidence_score: 70, severity: severityFromImpact(shortfall, 0, { cashRisk: true }),
    evidence: { current_cash: cur.cash_position, avg_net_14d: Math.round(avgNet), projected_30d: Math.round(proj30), minimum_floor: config.cash_minimum_cents, shortfall: Math.round(shortfall), days_to_floor: Math.max(0, daysToFloor), upcoming_obligations: obligations },
    source_systems: ["Bank Feed", "Accounting"],
    recommended_action: "Prioritise overdue invoice collection, defer non-essential supplier payments, and review the roster for the quietest trading days.",
    action_difficulty: "hard",
  });
  return out;
}

function labelChannel(ch) {
  return ({ in_store: "In-store", pickup: "Pickup", direct_online: "Direct Online", uber_eats: "Uber Eats", doordash: "DoorDash", menulog: "Menulog" })[ch] || ch;
}
function formatPctLabel(p) { return `${p.toFixed(1)}%`; }

// ---------- ORCHESTRATION ----------
export function runAllRules(data, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const all = [
    ...detectLabourLeak(data.snapshots, cfg),
    ...detectSupplierPriceLeaks(data.supplierInvoiceLines, cfg),
    ...detectUnderpricedProducts(data.menuItems, cfg),
    ...detectOverdueReceivables(data.receivables, cfg),
    ...detectSubscriptionLeaks(data.expenses, cfg),
    ...detectMerchantFeeLeak(data.channelSales, data.expenses, cfg),
    ...detectDuplicateExpenses(data.expenses, cfg),
    ...detectUnusualExpenses(data.expenses, cfg),
    ...detectExpenseCreep(data.expenses, cfg),
    ...detectLowMarginChannels(data.channelSales, cfg),
    ...detectExcessiveDiscounting(data.channelSales, cfg),
    ...detectCashFlowRisk(data.snapshots, cfg),
  ];
  const monthlyRev = monthlyRevenue(data.snapshots);
  // Apply materiality (with exceptions) + severity normalisation
  return all.filter((l) => {
    const always = ["duplicate_expense", "cash_flow_risk", "overdue_receivables"].includes(l.category);
    return isMaterial(l.monthly_impact_cents || l.annual_impact_cents, monthlyRev, cfg, { always });
  });
}