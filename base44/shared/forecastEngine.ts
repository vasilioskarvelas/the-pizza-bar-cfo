// Phase 08 — Deterministic Forecast & Scenario engine (PURE, no I/O).
// Reuses the LOCKED Phase 05 financial engine (computeAll, KPI_FORMULAS) and the
// LOCKED Phase 06 owner score engine (computeComponent, computeOverall) — no
// financial or scoring logic is duplicated or altered. All money is integer cents,
// percentages integer bps, ratios x10000. No binary float aggregation of money.
// Every forecast is reproducible: identical inputs => identical outputs.

import { computeAll, KPI_FORMULAS, LINES, roundDiv, pctBps, worstConfidence } from "./financialEngine.ts";
import { computeComponent, computeOverall, parseInputConfig, parseMethodologyConfig, statusBand, round2 } from "./ownerScoreEngine.ts";

export const FORECAST_ENGINE_VERSION = "forecast-engine-1.0";

// Metrics surfaced in the forecast/timeline (entity_id on CalculationResult or raw line).
export const FORECAST_METRICS = [
  { code: "revenue", label: "Revenue", unit: "cents", kind: "flow", raw: "revenue" },
  { code: "gross_profit", label: "Gross Profit", unit: "cents", kind: "flow", derived: true },
  { code: "ebitda", label: "EBITDA", unit: "cents", kind: "flow", derived: true },
  { code: "net_profit", label: "Net Profit", unit: "cents", kind: "flow", derived: true },
  { code: "cash", label: "Cash Position", unit: "cents", kind: "stock", raw: "closing_cash", alt: ["cash"] },
  { code: "net_gst_position", label: "GST", unit: "cents", kind: "flow", derived: true },
  { code: "working_capital", label: "Working Capital", unit: "cents", kind: "stock", derived: true },
  { code: "long_term_debt", label: "Debt", unit: "cents", kind: "stock", raw: "long_term_debt" },
  { code: "gross_margin", label: "Gross Margin", unit: "bps", kind: "ratio", kpi: true },
  { code: "labour_cost_pct", label: "Labour %", unit: "bps", kind: "ratio", kpi: true },
  { code: "food_cost_pct", label: "Food Cost %", unit: "bps", kind: "ratio", kpi: true },
  { code: "operating_expense_pct", label: "Operating Expenses %", unit: "bps", kind: "ratio", kpi: true },
  { code: "current_ratio", label: "Current Ratio", unit: "ratio_4dp", kind: "ratio", kpi: true },
  { code: "quick_ratio", label: "Quick Ratio", unit: "ratio_4dp", kind: "ratio", kpi: true },
  { code: "debt_ratio", label: "Debt Ratio", unit: "ratio_4dp", kind: "ratio", kpi: true },
  { code: "cash_runway", label: "Runway", unit: "weeks", kind: "ratio", kpi: true },
  { code: "owner_score", label: "Owner Score", unit: "score", kind: "score" },
];

export const HORIZONS = [
  { key: "30d", label: "30 days", months: 1 },
  { key: "90d", label: "90 days", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "12 months", months: 12 },
  { key: "24m", label: "24 months", months: 24 },
];

export const GRANULARITIES = ["daily", "weekly", "monthly", "quarterly", "yearly"];

// ---- helpers ----------------------------------------------------------------

// Least-squares linear regression. points: [{x, y}]. returns {slope, intercept}.
export function linreg(points) {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].y };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = (n * sxx - sx * sx);
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// Project a single metric forward. history: number[] chronological actuals (minor units).
// periodsAhead: months ahead (>0 = forecast). assumption: {growth_bps (annual), method} or null.
// Returns {value, kind, method}. kind: "actual" | "forecast" | "estimated".
export function projectValue(history, periodsAhead, assumption) {
  const h = (history || []).map((v) => Number(v) || 0);
  if (periodsAhead <= 0) return { value: h.length ? h[h.length - 1] : 0, kind: "actual", method: "actual" };
  const last = h.length ? h[h.length - 1] : 0;
  const method = assumption?.method || "auto";
  const hasGrowth = assumption?.growth_bps != null && assumption.growth_bps !== 0;

  if (method === "assumption" || (method === "auto" && hasGrowth)) {
    const g = (assumption.growth_bps || 0) / 10000;
    const monthly = Math.pow(1 + g, 1 / 12);
    return { value: Math.round(last * Math.pow(monthly, periodsAhead)), kind: "forecast", method: "assumption_growth" };
  }
  // Explicit trend requested: needs >=2 points.
  if (method === "trend" && h.length >= 2) {
    const pts = h.map((y, i) => ({ x: i, y }));
    const { slope, intercept } = linreg(pts);
    const idx = h.length - 1 + periodsAhead;
    return { value: Math.round(intercept + slope * idx), kind: "forecast", method: "linear_trend" };
  }
  // auto: trend only with >=3 points (sparse 2-point history overprojects); else flat.
  if (method === "auto" && h.length >= 3) {
    const pts = h.map((y, i) => ({ x: i, y }));
    const { slope, intercept } = linreg(pts);
    const idx = h.length - 1 + periodsAhead;
    return { value: Math.round(intercept + slope * idx), kind: "forecast", method: "linear_trend" };
  }
  // flat (1-2 points, no assumption)
  return { value: last, kind: "estimated", method: "flat_last" };
}

// Clamp inherently non-negative raw lines. Profit/working-capital/cash-flow may be negative.
const ALLOW_NEGATIVE_RAW = new Set([]);
export function clampRaw(code, cents) {
  const c = Math.round(Number(cents) || 0);
  if (ALLOW_NEGATIVE_RAW.has(code)) return c;
  return c < 0 ? 0 : c;
}

// ---- Loan amortisation (deterministic, level payment) ----------------------

export function levelPayment(principal, annualRate, termMonths) {
  const P = Number(principal) || 0;
  const r = (Number(annualRate) || 0) / 12;
  const n = Math.max(1, Math.round(Number(termMonths) || 1));
  if (r === 0) return Math.round(P / n);
  const m = P * r / (1 - Math.pow(1 + r, -n));
  return Math.round(m);
}

// Apply one loan period: returns {interest, principalRepaid, payment, remaining}
export function loanPeriod(loan) {
  const remaining = loan.remaining;
  const r = (loan.rate || 0) / 12;
  const interest = Math.round(remaining * r);
  let payment = Math.min(loan.payment, remaining + interest);
  const principalRepaid = Math.max(0, payment - interest);
  const newRemaining = Math.max(0, remaining - principalRepaid);
  return { interest, principalRepaid, payment, remaining: newRemaining };
}

// ---- Scenario adjustments ---------------------------------------------------
// adjustments: array of {type, value, ...}. Applied to a raw map each forecast period.
// Returns {raw, loans, oneOffDone} — loans carried across periods.

export function applyAdjustments(rawIn, adjustments, periodIndex, loansIn, gstRate, taxRate) {
  const raw = {};
  for (const k of Object.keys(rawIn)) raw[k] = rawIn[k];
  const loans = loansIn ? loansIn.map((l) => ({ ...l })) : [];
  let gst = gstRate;
  let tax = taxRate;

  for (const a of adjustments || []) {
    const t = a.type;
    const v = Number(a.value) || 0;
    switch (t) {
      case "revenue_pct": case "price_increase_pct":
        raw.revenue = (raw.revenue || 0) * (1 + v / 10000); break;
      case "cogs_pct":
        raw.cogs = (raw.cogs || 0) * (1 + v / 10000); break;
      case "food_cost_pct": // delta bps of revenue applied to cogs
        raw.cogs = (raw.cogs || 0) + (raw.revenue || 0) * v / 10000; break;
      case "labour_pct": // delta bps of revenue applied to labour
        raw.labour_cost = (raw.labour_cost || 0) + (raw.revenue || 0) * v / 10000; break;
      case "labour_absolute":
        raw.labour_cost = (raw.labour_cost || 0) + v; break;
      case "wage_increase_pct":
        raw.labour_cost = (raw.labour_cost || 0) * (1 + v / 10000); break;
      case "rent_absolute":
        raw.operating_expenses = (raw.operating_expenses || 0) + v; break;
      case "opex_pct":
        raw.operating_expenses = (raw.operating_expenses || 0) * (1 + v / 10000); break;
      case "capex": // one-off in period 0
        if (periodIndex === 0) {
          raw.fixed_assets = (raw.fixed_assets || 0) + v;
          raw.investing_cash_flow = (raw.investing_cash_flow || 0) - v;
        }
        break;
      case "loan": { // {amount, rate, term} — originate in period 0
        if (periodIndex === 0) {
          const amount = Number(a.amount) || 0;
          const rate = Number(a.rate) || 0;
          const term = Math.max(1, Math.round(Number(a.term) || 12));
          raw.long_term_debt = (raw.long_term_debt || 0) + amount;
          raw.financing_cash_flow = (raw.financing_cash_flow || 0) + amount;
          loans.push({ remaining: amount, rate, term, payment: levelPayment(amount, rate, term) });
        }
        break;
      }
      case "loan_repayment": case "debt_repayment":
        raw.long_term_debt = Math.max(0, (raw.long_term_debt || 0) - v);
        raw.financing_cash_flow = (raw.financing_cash_flow || 0) - v;
        break;
      case "new_store": {
        const rev = Number(a.revenue) || 0, cgs = Number(a.cogs) || 0, lab = Number(a.labour) || 0, opx = Number(a.opex) || 0;
        raw.revenue = (raw.revenue || 0) + rev;
        raw.cogs = (raw.cogs || 0) + cgs;
        raw.labour_cost = (raw.labour_cost || 0) + lab;
        raw.operating_expenses = (raw.operating_expenses || 0) + opx;
        break;
      }
      case "close_store": {
        const rev = Number(a.revenue) || 0, cgs = Number(a.cogs) || 0, lab = Number(a.labour) || 0, opx = Number(a.opex) || 0;
        raw.revenue = Math.max(0, (raw.revenue || 0) - rev);
        raw.cogs = Math.max(0, (raw.cogs || 0) - cgs);
        raw.labour_cost = Math.max(0, (raw.labour_cost || 0) - lab);
        raw.operating_expenses = Math.max(0, (raw.operating_expenses || 0) - opx);
        break;
      }
      case "employees": {
        const count = Number(a.count) || 0, wage = Number(a.avg_wage) || 0;
        raw.labour_cost = (raw.labour_cost || 0) + count * wage;
        break;
      }
      case "gst_rate": gst = v; break;
      case "tax_rate": tax = v; break;
      default: break;
    }
  }

  // Loan repayments every period (after origination in period 0)
  if (periodIndex >= 0 && loans.length) {
    let interestExp = 0, principalPaid = 0, paymentTotal = 0;
    for (const loan of loans) {
      if (loan.remaining <= 0) continue;
      const p = loanPeriod(loan);
      interestExp += p.interest;
      principalPaid += p.principalRepaid;
      paymentTotal += p.payment;
      loan.remaining = p.remaining;
    }
    raw.interest_expense = (raw.interest_expense || 0) + interestExp;
    raw.long_term_debt = Math.max(0, (raw.long_term_debt || 0) - principalPaid);
    raw.financing_cash_flow = (raw.financing_cash_flow || 0) - paymentTotal;
  }

  // clamp non-negative raw lines (round to cents)
  const out = {};
  for (const k of Object.keys(raw)) out[k] = clampRaw(k, raw[k]);
  return { raw: out, loans, gstRate: gst, taxRate: tax };
}

// ---- Forecast a series of periods -------------------------------------------
// histories: { rawCode: number[] } chronological actuals (minor units).
// baselineRaw: { rawCode: cents } latest actual (fallback when no history).
// assumptions: { metricOrRawCode: {growth_bps, method} }.
// adjustments: array (scenario) or null (baseline).
// Returns [{ period_index, period_start, period_end, raw, V, kpis }]
export function forecastPeriods(opts) {
  const { histories, baselineRaw, horizon, assumptions = {}, adjustments = null, gstRate = 0.10, companyTaxRate = null, openingCash = 0, priorTcl = 0, priorNoncashCA = 0 } = opts;
  const periods = [];
  let loans = [];
  let prevCash = openingCash;
  let prevTcl = priorTcl;
  let prevNoncashCA = priorNoncashCA;
  let curGst = gstRate;
  let curTax = companyTaxRate;

  for (let i = 1; i <= horizon; i++) {
    // forecast each raw line from its history
    const grown = {};
    for (const code of Object.keys(LINES)) {
      if (LINES[code].level !== 0) continue;
      const hist = histories[code] || [];
      const base = baselineRaw[code] || 0;
      // build a synthetic history from baseline if missing
      const useHist = hist.length ? hist : (base ? [base] : []);
      const a = assumptions[code] || null;
      const proj = projectValue(useHist, i, a);
      grown[code] = proj.value;
    }
    // opening_cash = previous closing cash
    grown.opening_cash = prevCash;

    // apply scenario adjustments (or pass-through)
    let raw, gstR, taxR;
    if (adjustments && adjustments.length) {
      const res = applyAdjustments(grown, adjustments, i - 1, loans, curGst, curTax);
      raw = res.raw; loans = res.loans; gstR = res.gstRate; taxR = res.taxRate;
      curGst = gstR; curTax = taxR;
    } else {
      raw = {};
      for (const k of Object.keys(grown)) raw[k] = clampRaw(k, grown[k]);
    }

    const prior = { revenueCents: histories.revenue?.length ? histories.revenue[histories.revenue.length - 1] : (baselineRaw.revenue || 0), closingCashCents: prevCash, tcl: prevTcl, noncashCA: prevNoncashCA };
    const V = computeAll(toRawConf(raw), prior, curTax);

    // KPIs for this period
    const kpis = {};
    for (const code of Object.keys(KPI_FORMULAS)) {
      const r = KPI_FORMULAS[code](V, prior);
      kpis[code] = { value: r.value, unit: r.unit, confidence: "forecast", na: !!r.na };
    }

    periods.push({
      period_index: i,
      period_start: shiftMonth(opts.baselinePeriodStart, i),
      period_end: shiftMonthEnd(opts.baselinePeriodStart, i),
      raw, V, kpis,
      closing_cash: V.closing_cash?.value || 0,
      cash_runway: V.cash_runway?.value || 0,
      owner_score: null, // filled by forecastOwnerScore
    });

    prevCash = V.closing_cash?.value || 0;
    prevTcl = V.total_current_liabilities?.value || 0;
    prevNoncashCA = (V.accounts_receivable?.value || 0) + (V.inventory?.value || 0) + (V.other_current_assets?.value || 0);
  }
  return periods;
}

// wrap raw cents into the {cents, confidence} shape computeAll expects
function toRawConf(raw) {
  const out = {};
  for (const k of Object.keys(raw)) out[k] = { cents: raw[k], confidence: "forecast" };
  return out;
}

// ---- Owner Score forecast (reuses locked engine) ---------------------------
// forecastKpis: { kpiCode: {value, unit, na} } for one forecast period.
// methodology: { components, inputs, thresholds (Map), methodConfig, derived (Map) }
export function forecastOwnerScore(forecastKpis, methodology) {
  const { components, inputs, thresholds, methodConfig, derived } = methodology;
  const resolvedAll = new Map();
  for (const inp of inputs) {
    if (derived && derived.has(inp.input_key)) { resolvedAll.set(inp.input_key, derived.get(inp.input_key)); continue; }
    const k = forecastKpis[inp.input_key];
    if (k && !k.na && k.value != null) {
      resolvedAll.set(inp.input_key, { present: true, value: k.value, unit: k.unit, confidence: "forecast", na: false, result_id: null });
    } else {
      resolvedAll.set(inp.input_key, { present: false, value: 0, unit: null, confidence: "forecast", na: false, result_id: null });
    }
  }
  const compResults = [];
  for (const comp of components) {
    const compInputs = inputs.filter((i) => i.component_id === comp.id);
    const cr = computeComponent(comp, compInputs, resolvedAll, thresholds, methodConfig.confidence_factors);
    compResults.push({ code: comp.code, name: comp.name, weight: Number(comp.weight), ...cr });
  }
  const overall = computeOverall(compResults, methodConfig);
  if (overall.score == null) return { score: null, status: "Unavailable", components: compResults.map((c) => ({ code: c.code, name: c.name, score: null })) };
  const status = statusBand(overall.score, methodConfig.status_bands);
  return {
    score: round2(overall.score),
    status,
    confidence: overall.confidence,
    confidence_numeric: overall.confidenceNumeric,
    components: compResults.map((c) => ({ code: c.code, name: c.name, score: round2(c.score), confidence: c.confidence, unavailable: c.unavailable })),
  };
}

// ---- Extract metrics from a computed period --------------------------------
export function extractMetric(period, code) {
  const m = FORECAST_METRICS.find((x) => x.code === code);
  if (!m) return null;
  if (code === "owner_score") return { value: period.owner_score?.score ?? null, unit: "score", confidence: "forecast" };
  if (m.kpi) {
    const k = period.kpis?.[code];
    return k ? { value: k.value, unit: k.unit, confidence: "forecast" } : null;
  }
  const v = period.V?.[m.raw || code];
  return v ? { value: v.value, unit: v.unit || m.unit, confidence: v.confidence } : null;
}

// ---- Deterministic forecast hash -------------------------------------------
export function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h = h & 0xffffffff; }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function forecastHash(parts) {
  const blob = JSON.stringify({
    o: parts.orgId, s: parts.siteId || "org", sc: parts.scenarioId || "baseline",
    bp: parts.baselinePeriod, h: parts.horizon,
    hist: parts.historiesKey, adj: parts.adjustments || [], gst: parts.gstRate, tax: parts.companyTaxRate,
    assump: parts.assumptionsKey, meth: parts.methodologyVersionId || "none",
    eng: FORECAST_ENGINE_VERSION,
  });
  return djb2(blob);
}

// ---- date helpers -----------------------------------------------------------
export function shiftMonth(isoStart, n) {
  const d = new Date(isoStart + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
}
export function shiftMonthEnd(isoStart, n) {
  const d = new Date(isoStart + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0)).toISOString().slice(0, 10);
}

// ---- Comparison -------------------------------------------------------------
// scenarios: [{name, periods}] where periods = forecast PAYLOAD periods
// (each carries .metrics[code].value and .owner_score.score).
export function pmetric(period, code) {
  if (code === "owner_score") return period?.owner_score?.score ?? null;
  return period?.metrics?.[code]?.value ?? null;
}
export function pmetricUnit(period, code) {
  if (code === "owner_score") return "score";
  return period?.metrics?.[code]?.unit ?? null;
}
export function compareScenarioSets(baseline, scenarios) {
  const codes = ["revenue", "net_profit", "cash", "long_term_debt", "net_gst_position", "owner_score", "cash_runway"];
  const last = (periods) => periods[periods.length - 1] || null;
  const sumFlow = (periods, code) => periods.reduce((s, p) => s + (Number(pmetric(p, code)) || 0), 0);
  const pick = (periods, code) => { const lp = last(periods); return lp ? pmetric(lp, code) : null; };
  const rows = codes.map((code) => {
    const m = FORECAST_METRICS.find((x) => x.code === code);
    const baseVal = m?.kind === "flow" ? sumFlow(baseline, code) : pick(baseline, code);
    const row = { code, label: m?.label || code, unit: m?.unit || "cents", baseline: baseVal, scenarios: [] };
    for (const sc of scenarios) {
      const val = m?.kind === "flow" ? sumFlow(sc.periods, code) : pick(sc.periods, code);
      let variance = null, pct = null;
      if (val != null && baseVal != null && baseVal !== 0) { variance = val - baseVal; pct = (variance / Math.abs(baseVal)) * 100; }
      else if (val != null && baseVal != null && baseVal === 0) { variance = val - baseVal; }
      row.scenarios.push({ name: sc.name, value: val, variance, pct });
    }
    return row;
  });
  let best = null, bestScore = -Infinity;
  for (const sc of scenarios) {
    const s = pick(sc.periods, "owner_score");
    if (s != null && s > bestScore) { bestScore = s; best = sc.name; }
  }
  return { metrics: rows, best_scenario: best };
}

// ---- Forecast alerts (deterministic) ---------------------------------------
// baseline: forecast PAYLOAD periods (carry .metrics and .owner_score).
export function generateForecastAlerts(baseline, obligations) {
  const out = [];
  const last = baseline[baseline.length - 1];
  const val = (p, code) => (p && p.metrics && p.metrics[code] ? Number(p.metrics[code].value) || 0 : 0);
  // 1. Cash runway exhausted (cash position goes negative)
  const firstNeg = baseline.find((p) => val(p, "cash") < 0);
  if (firstNeg) out.push({ rule_key: "forecast_cash_exhausted", severity: "critical", title: "Cash Runway Exhausted", reason: `Projected cash position goes negative in ${firstNeg.period_start}.`, affected_metric: "cash", business_impact: "Business will be unable to meet obligations without funding.", recommended_action: "Arrange funding, reduce outflows, or revise the scenario.", horizon_period: firstNeg.period_start });
  else {
    const runway = last ? val(last, "cash_runway") : 0;
    if (runway > 0 && runway < 4) out.push({ rule_key: "forecast_runway_low", severity: "high", title: "Forecast Runway Low", reason: `Projected runway falls to ${runway} weeks at horizon end.`, affected_metric: "cash_runway", business_impact: "Limited buffer against adverse shocks.", recommended_action: "Strengthen cash reserves before horizon end.", horizon_period: last?.period_start });
  }
  // 2. Forecast net losses
  const loss = baseline.find((p) => val(p, "net_profit") < 0);
  if (loss) out.push({ rule_key: "forecast_loss", severity: "high", title: "Forecast Net Loss", reason: `Net profit projected negative in ${loss.period_start}.`, affected_metric: "net_profit", business_impact: "Period of unprofitability ahead — cash reserves will be consumed.", recommended_action: "Review cost structure and pricing.", horizon_period: loss.period_start });
  // 3. Owner score predicted to fall
  const scores = baseline.map((p) => p.owner_score?.score).filter((s) => s != null);
  if (scores.length >= 2 && scores[scores.length - 1] < scores[0] - 2) {
    const drop = scores[0] - scores[scores.length - 1];
    out.push({ rule_key: "forecast_score_decline", severity: "high", title: "Owner Score Predicted to Fall", reason: `Owner Score projected to decline ${drop.toFixed(1)} points over the horizon.`, affected_metric: "owner_score", business_impact: "Overall business health weakening.", recommended_action: "Address the declining score drivers.", horizon_period: last?.period_start });
  }
  // 4. Upcoming obligations exceed projected cash (in their due period)
  if (obligations && obligations.length) {
    for (const ob of obligations) {
      if (ob.priority === "low") continue;
      const duePeriod = baseline.find((p) => p.period_start <= ob.due_date && p.period_end >= ob.due_date) || last;
      if (duePeriod && val(duePeriod, "cash") < (ob.amount_cents || 0)) {
        out.push({ rule_key: "obligation_exceeds_cash", severity: ob.priority === "critical" ? "critical" : "high", title: "Obligation Exceeds Forecast Cash", reason: `${ob.name} ($${((ob.amount_cents || 0) / 100).toFixed(0)}) due ${ob.due_date} exceeds projected cash.`, affected_metric: "cash", business_impact: "May miss a critical payment.", recommended_action: "Reschedule the obligation or arrange funding.", horizon_period: ob.due_date });
        break;
      }
    }
  }
  // 5. GST obligation forecast
  const gstSum = baseline.reduce((s, p) => s + val(p, "net_gst_position"), 0);
  if (gstSum > 100000) out.push({ rule_key: "forecast_gst_obligation", severity: "medium", title: "GST Obligation Forecast", reason: `Projected net GST position totals $${(gstSum / 100).toFixed(0)} over the horizon.`, affected_metric: "net_gst_position", business_impact: "BAS lodgement obligations ahead.", recommended_action: "Set aside funds for BAS payments.", horizon_period: last?.period_start });
  return out;
}