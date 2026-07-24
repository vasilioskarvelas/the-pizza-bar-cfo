// Phase 07 — Dashboard shared logic (deterministic, no AI).
// Pure presentation/orchestration over Phase 05/06 deterministic outputs.
// No metric is calculated here — every value is read from CalculationResult /
// CalculationRun / Owner Score results / reconciliation / connector data.

import { getCurrentOwnerScore } from "./ownerScoreRunner.ts";
import { getCurrentResults } from "./financialRunner.ts";

// ---- KPI card definitions --------------------------------------------------
// code = entity_id on CalculationResult (kpi or financial_figure).
export const KPI_CARDS = [
  { code: "revenue", label: "Revenue", unit: "cents", group: "profitability" },
  { code: "gross_profit", label: "Gross Profit", unit: "cents", group: "profitability" },
  { code: "gross_margin", label: "Gross Margin", unit: "bps", group: "profitability" },
  { code: "ebitda", label: "EBITDA", unit: "cents", group: "profitability" },
  { code: "net_profit", label: "Net Profit", unit: "cents", group: "profitability" },
  { code: "cash", label: "Cash Position", unit: "cents", group: "liquidity", alt: ["closing_cash"] },
  { code: "cash_runway", label: "Cash Runway", unit: "weeks", group: "liquidity" },
  { code: "working_capital", label: "Working Capital", unit: "cents", group: "liquidity" },
  { code: "current_ratio", label: "Current Ratio", unit: "ratio_4dp", group: "liquidity" },
  { code: "quick_ratio", label: "Quick Ratio", unit: "ratio_4dp", group: "liquidity" },
  { code: "debt_ratio", label: "Debt Ratio", unit: "ratio_4dp", group: "debt" },
  { code: "net_gst_position", label: "GST Position", unit: "cents", group: "tax" },
  { code: "labour_cost_pct", label: "Labour %", unit: "bps", group: "cost", alt: ["labour_pct"] },
  { code: "food_cost_pct", label: "Food Cost %", unit: "bps", group: "cost" },
  { code: "operating_expense_pct", label: "Operating Expense %", unit: "bps", group: "cost" },
];

export const BUSINESS_HEALTH = [
  { code: "owner_score", label: "Owner Score", group: "overall" },
  { code: "profitability", label: "Profitability" },
  { code: "cash_liquidity", label: "Liquidity" },
  { code: "debt_solvency", label: "Debt" },
  { code: "cost_control", label: "Cost Control" },
  { code: "tax_compliance", label: "Tax Compliance" },
  { code: "data_quality", label: "Data Quality" },
  { code: "operational_stability", label: "Operational Stability" },
];

// ---- period helpers --------------------------------------------------------

export function defaultPeriod() {
  // current calendar month in UTC
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { periodStart: iso(start), periodEnd: iso(end) };
}

// Latest period with a completed owner-score run — so the dashboard opens on
// meaningful data instead of an empty current month. Falls back to current month.
export async function latestPeriod(S, orgId) {
  try {
    const runs = await S.CalculationRun.filter({ organisation_id: orgId, run_type: "owner_score" }, "-created_date", 10);
    const completed = runs.find((r) => r.period_start && r.period_end && r.status === "completed");
    if (completed) return { periodStart: completed.period_start, periodEnd: completed.period_end };
  } catch {}
  return defaultPeriod();
}

export function previousPeriod(periodStart, periodEnd) {
  const s = new Date(periodStart + "T00:00:00Z");
  const e = new Date(periodEnd + "T00:00:00Z");
  const span = e.getTime() - s.getTime();
  // shift start back by one month
  const ps = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, s.getUTCDate()));
  const pe = new Date(ps.getTime() + span);
  return { periodStart: iso(ps), periodEnd: iso(pe) };
}

function iso(d) { return d.toISOString().slice(0, 10); }

// ---- metric resolution -----------------------------------------------------

// results: CalculationResult[] (any result_type). Returns latest by created_date.
// Scope by selected site: org view (siteId null) -> prefer site_id null (consolidated);
// site view -> prefer that site's record. Falls back to any record if none matches scope.
export function resolveMetric(results, code, alt = [], siteId) {
  const codes = [code, ...alt];
  const scoped = [];
  const other = [];
  for (const r of results) {
    if (codes.includes(r.entity_id) && (r.result_type === "kpi" || r.result_type === "financial_figure" || r.result_type === "score_component")) {
      const matchesScope = siteId == null ? r.site_id == null : r.site_id === siteId;
      if (matchesScope) scoped.push(r); else other.push(r);
    }
  }
  const pool = scoped.length ? scoped : other;
  let best = null;
  for (const r of pool) {
    if (!best || String(r.created_date || "").localeCompare(String(best.created_date || "")) > 0) best = r;
  }
  return best;
}

export function buildKpiCards(currentResults, previousResults, siteId) {
  return KPI_CARDS.map((c) => {
    const cur = resolveMetric(currentResults, c.code, c.alt, siteId);
    const prev = resolveMetric(previousResults || [], c.code, c.alt, siteId);
    const value = cur ? Number(cur.value) : null;
    const prevValue = prev ? Number(prev.value) : null;
    let change = null, pct = null;
    if (value != null && prevValue != null && prevValue !== 0) {
      change = value - prevValue;
      pct = (change / Math.abs(prevValue)) * 100;
    } else if (value != null && prevValue != null && prevValue === 0 && value !== 0) {
      change = value - prevValue; pct = null;
    }
    const trend = change == null ? "no_prior" : change > 0 ? "up" : change < 0 ? "down" : "flat";
    return {
      code: c.code, label: c.label, unit: cur?.unit || c.unit, group: c.group,
      value, confidence: cur?.confidence || null, na: cur?.label?.includes("N/A") || false,
      period_start: cur?.period_start || null, period_end: cur?.period_end || null,
      updated: cur?.updated_date || cur?.created_date || null, result_id: cur?.id || null,
      previous: prevValue, change, pct, trend,
      has_data: !!cur,
    };
  });
}

// ---- owner score hero ------------------------------------------------------

export async function buildOwnerScore(base44, orgId, siteId, periodStart, periodEnd) {
  try {
    const os = await getCurrentOwnerScore(base44, { orgId, siteId, periodStart, periodEnd });
    const prev = await previousOwnerScore(base44, orgId, siteId, periodStart, periodEnd);
    let trend = "no_prior";
    if (prev && os?.score?.value != null && prev.score?.value != null) {
      const d = os.score.value - prev.score.value;
      trend = d > 0 ? "up" : d < 0 ? "down" : "flat";
    }
    return { current: os, previous: prev, trend };
  } catch { return { current: null, previous: null, trend: "no_prior" }; }
}

async function previousOwnerScore(base44, orgId, siteId, periodStart, periodEnd) {
  const p = previousPeriod(periodStart, periodEnd);
  try { return await getCurrentOwnerScore(base44, { orgId, siteId, periodStart: p.periodStart, periodEnd: p.periodEnd }); }
  catch { return null; }
}

// ---- reconciliation summary -------------------------------------------------

export async function reconciliationSummary(S, orgId, siteId, periodStart, periodEnd) {
  const [runs, excs] = await Promise.all([
    S.ReconciliationRun.filter({ organisation_id: orgId }),
    S.ReconciliationException.filter({ organisation_id: orgId, resolved: false }),
  ]);
  const scopeRuns = runs.filter((r) => !siteId || r.site_id === siteId || !r.site_id);
  const latest = scopeRuns.length ? scopeRuns.sort((a, b) => String(b.run_started_at || "").localeCompare(String(a.run_started_at || "")))[0] : null;
  const scopedExcs = excs.filter((e) => !siteId || e.site_id === siteId || !e.site_id);
  const matched = (latest?.matched_count ?? 0);
  const total = (latest?.total_checked ?? 0);
  const partial = total - matched - (latest?.exception_count ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  const resolvedToday = await S.ReconciliationException.filter({ organisation_id: orgId, resolved: true }).then((rs) => rs.filter((e) => (e.resolved_at || "").slice(0, 10) === today && (!siteId || e.site_id === siteId)).length).catch(() => 0);
  return {
    latest_run: latest ? { id: latest.id, status: latest.status, started_at: latest.run_started_at, completed_at: latest.run_completed_at, reconciliation_type: latest.reconciliation_type } : null,
    matched, partial: Math.max(0, partial), unmatched: scopedExcs.filter((e) => e.exception_type === "unmatched").length,
    duplicates: scopedExcs.filter((e) => e.exception_type === "duplicate").length,
    critical: scopedExcs.filter((e) => e.severity === "critical").length,
    pending_review: scopedExcs.length, resolved_today: resolvedToday,
    exceptions: scopedExcs.slice(0, 20).map((e) => ({ id: e.id, type: e.exception_type, severity: e.severity, description: e.description, resolved: e.resolved })),
  };
}

// ---- connector summary -----------------------------------------------------

export async function connectorSummary(S, orgId, siteId) {
  const [connectors, runs] = await Promise.all([
    S.Connector.filter({ organisation_id: orgId }),
    S.ConnectorRun.filter({ organisation_id: orgId }),
  ]);
  const scoped = connectors.filter((c) => !siteId || c.site_id === siteId || !c.site_id);
  const scopedRuns = runs.filter((r) => !siteId || r.site_id === siteId || !r.site_id);
  const failed = scopedRuns.filter((r) => r.status === "failed");
  const running = scopedRuns.filter((r) => r.status === "running");
  const lastSuccessBySystem = {};
  for (const c of scoped) {
    const sysRuns = scopedRuns.filter((r) => r.connector_id === c.id).sort((a, b) => String(b.run_started_at || "").localeCompare(String(a.run_started_at || "")));
    lastSuccessBySystem[c.source_system] = sysRuns.find((r) => r.status === "completed")?.run_completed_at || null;
  }
  return {
    total: scoped.length, active: scoped.filter((c) => c.status === "active").length,
    error: scoped.filter((c) => c.status === "error").length, paused: scoped.filter((c) => c.status === "paused").length,
    failed_syncs: failed.length, running: running.length,
    pending_imports: scopedRuns.filter((r) => r.status === "running").length,
    import_latency: avgLatency(scopedRuns),
    connectors: scoped.map((c) => ({
      id: c.id, name: c.name, source_system: c.source_system, status: c.status,
      last_run_at: c.last_run_at, last_successful_sync_at: c.last_successful_sync_at, last_run_status: c.last_run_status,
    })),
    retry_queue: failed.length,
  };
}

function avgLatency(runs) {
  const done = runs.filter((r) => r.run_started_at && r.run_completed_at && r.status === "completed");
  if (!done.length) return null;
  let total = 0;
  for (const r of done) total += new Date(r.run_completed_at).getTime() - new Date(r.run_started_at).getTime();
  return Math.round(total / done.length / 1000); // seconds
}

// ---- alert generation (rule-based, deterministic) --------------------------

// ctx: { orgId, siteId, ownerScore, kpiCards, recon, connectors, calcRuns }
export function generateAlerts(ctx) {
  const out = [];
  const siteTag = ctx.siteId ? "" : " (org)";
  const metric = (code) => ctx.kpiCards.find((k) => k.code === code);

  // 1. Cash runway low (< 4 weeks)
  const cr = metric("cash_runway");
  if (cr && cr.has_data && cr.value != null && cr.value < 4 && cr.value >= 0 && !cr.na) {
    out.push(alert("cash_runway_low", "critical", "Cash Runway Low", `Cash runway is ${cr.value} weeks — below the 4-week safety threshold.`, "cash_runway", "Insufficient operating cash to sustain the business beyond one month at current burn.", "Review cash flow, accelerate receivables collection, or arrange short-term funding.", cr));
  }
  // 2. GST due (positive net GST position)
  const gst = metric("net_gst_position");
  if (gst && gst.has_data && gst.value != null && gst.value > 100000) {
    out.push(alert("gst_due", "high", "GST Obligation Due", `Net GST position is owed to the ATO (>$1,000).`, "net_gst_position", "BAS lodgement and payment obligation approaching.", "Confirm GST figure, prepare BAS lodgement, and set aside payment funds.", gst));
  }
  // 3. Labour above target (> 35%)
  const labour = metric("labour_cost_pct");
  if (labour && labour.has_data && labour.value != null && labour.value > 3500) {
    out.push(alert("labour_above_target", "medium", "Labour Cost Above Target", `Labour cost is ${(labour.value/100).toFixed(1)}% of revenue — above the 35% target.`, "labour_cost_pct", "Erodes EBITDA margin and profitability.", "Review rostering, reduce overtime, and align labour to revenue.", labour));
  }
  // 4. Food cost above target (> 32%)
  const food = metric("food_cost_pct");
  if (food && food.has_data && food.value != null && food.value > 3200) {
    out.push(alert("food_cost_above_target", "medium", "Food Cost Above Target", `Food cost is ${(food.value/100).toFixed(1)}% of revenue — above the 32% target.`, "food_cost_pct", "Reduces gross margin and indicates wastage or pricing issues.", "Review supplier pricing, portion control, and wastage logs.", food));
  }
  // 5. Owner Score drop (trend down)
  if (ctx.ownerScore?.current?.score?.value != null && ctx.ownerScore?.previous?.score?.value != null) {
    const cur = ctx.ownerScore.current.score.value, prev = ctx.ownerScore.previous.score.value;
    if (cur < prev && (prev - cur) >= 2) {
      out.push(alert("owner_score_drop", "high", "Owner Score Decline", `Owner Score dropped ${prev - cur} points (from ${prev} to ${cur}).`, "owner_score", "Overall business health has materially weakened versus last period.", "Review component scores for the largest declines and address the root drivers.", null));
    }
  }
  // 6. Negative operating cash flow
  const ocf = ctx.allResults ? resolveMetric(ctx.allResults, "operating_cash_flow") : null;
  if (ocf && Number(ocf.value) < 0) {
    out.push(alert("negative_operating_cash_flow", "high", "Negative Operating Cash Flow", `Operating cash flow is negative for the period.`, "operating_cash_flow", "Business is burning cash from operations — unsustainable without funding.", "Reduce operating outflows, increase revenue, or arrange working-capital support.", ocf));
  }
  // 7. Connector failure
  if (ctx.connectors?.failed_syncs > 0) {
    out.push(alert("connector_failure", "high", "Connector Sync Failure", `${ctx.connectors.failed_syncs} connector sync(s) failed in the current period.`, "connector", "Data freshness at risk — downstream calculations may be stale or incomplete.", "Review connector logs, re-authorise if needed, and retry the sync.", null));
  }
  // 8. Calculation failure
  if (ctx.calcRuns?.some((r) => r.status === "failed")) {
    const n = ctx.calcRuns.filter((r) => r.status === "failed").length;
    out.push(alert("calculation_failure", "critical", "Calculation Run Failed", `${n} calculation run(s) failed.`, "calculation_run", "Financial or score outputs may be missing or stale.", "Inspect the failed run logs, correct the input data, and re-run.", null));
  }
  // 9. Unresolved reconciliation exception (critical)
  if (ctx.recon?.critical > 0) {
    out.push(alert("unresolved_reconciliation", "high", "Critical Reconciliation Exceptions", `${ctx.recon.critical} critical reconciliation exception(s) unresolved.`, "reconciliation", "Canonical data integrity at risk — figures may not reconcile to source.", "Resolve the exceptions in the reconciliation queue before relying on outputs.", null));
  }
  // 10. Low confidence calculations
  if (ctx.ownerScore?.current?.score?.confidence_numeric != null && ctx.ownerScore.current.score.confidence_numeric < 0.6) {
    out.push(alert("low_confidence", "low", "Low Calculation Confidence", `Owner Score confidence is ${(ctx.ownerScore.current.score.confidence_numeric*100).toFixed(0)}% — below the 60% threshold.`, "confidence", "Displayed figures rely on estimated/forecast inputs — treat with caution.", "Confirm missing source data and re-run the calculations to lift confidence.", null));
  }
  // 11. Missing mappings (unmapped reconciliation exceptions)
  const unmapped = ctx.recon?.exceptions?.filter((e) => e.type === "broken_link").length || 0;
  if (unmapped > 0) {
    out.push(alert("missing_mappings", "medium", "Missing Account Mappings", `${unmapped} broken-link exception(s) indicate unmapped source records.`, "mapping", "Transactions cannot be classified — financial figures incomplete.", "Map the unmapped accounts in Account Mapping and re-run calculations.", null));
  }
  return out;
}

function alert(rule_key, severity, title, reason, affected_metric, business_impact, recommended_action, evidence) {
  return {
    rule_key, severity, title, reason, affected_metric, business_impact, recommended_action,
    evidence: evidence ? JSON.stringify({ value: evidence.value, unit: evidence.unit, confidence: evidence.confidence, period: evidence.period_start }) : null,
  };
}

// Persist + merge acknowledged/resolved state. Deterministic: one open alert per rule_key+site.
// Dedupes any duplicate records (e.g. from concurrent generation) by keeping the most
// progressed one (resolved > acknowledged > open) and deleting the rest.
export async function upsertAlerts(S, orgId, siteId, alerts, actorUserId) {
  const existing = await S.ExecutiveAlert.filter({ organisation_id: orgId });
  const bySite = existing.filter((e) => (e.site_id || null) === (siteId || null));
  const groups = new Map();
  for (const e of bySite) { if (!groups.has(e.rule_key)) groups.set(e.rule_key, []); groups.get(e.rule_key).push(e); }
  const byKey = new Map();
  for (const [key, recs] of groups) {
    if (recs.length > 1) {
      recs.sort((a, b) => (b.resolved ? 1 : 0) - (a.resolved ? 1 : 0) || (b.acknowledged ? 1 : 0) - (a.acknowledged ? 1 : 0) || String(b.created_date).localeCompare(String(a.created_date)));
      const keep = recs[0];
      for (const r of recs.slice(1)) await S.ExecutiveAlert.delete(r.id).catch(() => {});
      byKey.set(key, keep);
    } else byKey.set(key, recs[0]);
  }
  const result = [];
  for (const a of alerts) {
    const prev = byKey.get(a.rule_key);
    if (prev) {
      // keep ack/resolve state; update mutable fields if severity/reason changed
      const changed = prev.severity !== a.severity || prev.reason !== a.reason || prev.title !== a.title;
      if (changed) {
        await S.ExecutiveAlert.update(prev.id, { severity: a.severity, title: a.title, reason: a.reason, business_impact: a.business_impact, recommended_action: a.recommended_action, affected_metric: a.affected_metric, evidence: a.evidence });
      }
      result.push({ ...prev, ...a, acknowledged: prev.acknowledged, resolved: prev.resolved, acknowledged_by: prev.acknowledged_by, acknowledged_at: prev.acknowledged_at, resolved_by: prev.resolved_by, resolved_at: prev.resolved_at, status: prev.status, id: prev.id });
    } else {
      const created = await S.ExecutiveAlert.create({ organisation_id: orgId, site_id: siteId || null, rule_key: a.rule_key, severity: a.severity, title: a.title, reason: a.reason, affected_metric: a.affected_metric, business_impact: a.business_impact, recommended_action: a.recommended_action, evidence: a.evidence, acknowledged: false, resolved: false, status: "open" });
      result.push({ ...a, id: created.id, acknowledged: false, resolved: false, status: "open" });
      await S.Notification.create({ organisation_id: orgId, user_id: actorUserId, notification_type: "alert", delivery_channel: "in_app", title: a.title, body: a.reason, severity: a.severity === "critical" ? "critical" : a.severity === "high" ? "warning" : "info", status: "unread", related_entity_type: "ExecutiveAlert", related_entity_id: created.id }).catch(() => {});
    }
  }
  // resolved alerts whose rule no longer fires -> auto-resolve
  const fired = new Set(alerts.map((a) => a.rule_key));
  for (const [key, prev] of byKey) {
    if (!fired.has(key) && !prev.resolved && prev.status !== "dismissed") {
      await S.ExecutiveAlert.update(prev.id, { resolved: true, status: "resolved", resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved: condition no longer applies." });
    }
  }
  return result.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
}
const SEV = { critical: 4, high: 3, medium: 2, low: 1 };

// ---- deterministic daily brief (rule-based, NO AI) --------------------------

export function buildBrief(ctx, periodStart, periodEnd) {
  const os = ctx.ownerScore?.current;
  const score = os?.score?.value;
  const status = os?.score?.label?.replace("Owner Score — ", "") || "—";
  const kpi = (code) => ctx.kpiCards.find((k) => k.code === code);
  const fmt = formatCard;

  const yesterday = []; // yesterday's notable events from timeline
  const today = [];
  const watch = [];
  const wins = [];
  const actions = [];

  // Watch list from alerts
  for (const a of (ctx.alerts || []).slice(0, 8)) {
    watch.push(`${a.title}: ${a.reason}`);
  }
  // Wins from positive movements
  for (const c of ctx.kpiCards) {
    if (c.trend === "up" && c.pct != null && c.pct > 0 && (c.unit === "cents" || c.unit === "bps")) {
      wins.push(`${c.label} improved ${Math.abs(c.pct).toFixed(1)}% vs prior period.`);
    }
  }
  if (score != null && score >= 85) wins.push(`Owner Score is ${score} (${status}) — business health is Strong.`);
  // Today / actions from connectors + recon
  if (ctx.connectors?.failed_syncs > 0) today.push(`${ctx.connectors.failed_syncs} connector sync failure(s) need attention.`);
  if (ctx.recon?.pending_review > 0) { today.push(`${ctx.recon.pending_review} reconciliation exception(s) pending review.`); actions.push("Review unreconciled items in the reconciliation queue."); }
  const gst = kpi("net_gst_position");
  if (gst && gst.value != null && gst.value > 0) actions.push("Confirm GST position and prepare BAS lodgement.");
  const labour = kpi("labour_cost_pct");
  if (labour && labour.value != null && labour.value > 3500) actions.push("Review roster — labour cost above target.");
  const food = kpi("food_cost_pct");
  if (food && food.value != null && food.value > 3200) actions.push("Review food cost — above 32% target.");
  const cr = kpi("cash_runway");
  if (cr && cr.value != null && cr.value < 4 && cr.value >= 0 && !cr.na) actions.push("Cash runway below 4 weeks — arrange funding.");

  return {
    greeting: "Good morning.",
    as_of: new Date().toISOString().slice(0, 10),
    overall: {
      score, status, confidence: os?.score?.confidence || null,
      trend: ctx.ownerScore?.trend || "no_prior",
      components: (os?.components || []).map((c) => ({ code: c.code, name: c.name, score: c.score, confidence: c.confidence })),
    },
    yesterday, today, watch, wins, actions,
    financial_snapshot: ctx.kpiCards.filter((k) => ["revenue","gross_profit","ebitda","net_profit","cash","working_capital"].includes(k.code)).map(fmt),
    upcoming_obligations: [
      gst && gst.value != null && gst.value > 0 ? { item: "GST/BAS", amount_cents: gst.value, due: "next BAS cycle" } : null,
      kpi("net_profit") && Number(kpi("net_profit")?.value) > 0 ? { item: "Income tax provision", amount_cents: Math.round(Number(kpi("net_profit").value) * 0.25), due: "quarterly" } : null,
    ].filter(Boolean),
    data_quality: (os?.components || []).find((c) => c.code === "data_quality")?.score ?? null,
    connectors: { active: ctx.connectors?.active, failed: ctx.connectors?.failed_syncs, total: ctx.connectors?.total },
  };
}

function formatCard(c) {
  return { label: c.label, code: c.code, value: c.value, unit: c.unit, confidence: c.confidence, change: c.change, pct: c.pct, trend: c.trend, has_data: c.has_data };
}

// ---- trends ----------------------------------------------------------------

export async function buildTrends(S, orgId, siteId, code, rangeDays) {
  const results = await S.CalculationResult.filter({ organisation_id: orgId, result_type: "kpi" }, "-period_start", 200);
  const figResults = await S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }, "-period_start", 200);
  // scope: org view (siteId null) -> prefer site_id null records; site view -> that site.
  const all = [...results, ...figResults].filter((r) => {
    if (siteId == null) return r.site_id == null;
    return r.site_id === siteId;
  });
  const fallback = [...results, ...figResults].filter((r) => r.entity_id === code);
  const useAll = all.some((r) => r.entity_id === code) ? all : fallback;
  const byPeriod = new Map();
  for (const r of all) {
    if (r.entity_id === code) {
      const key = r.period_start;
      if (!byPeriod.has(key) || String(r.created_date) > String(byPeriod.get(key).created_date)) byPeriod.set(key, r);
    }
  }
  let points = [...byPeriod.values()].map((r) => ({ period: r.period_start, value: Number(r.value), confidence: r.confidence, unit: r.unit, result_id: r.id })).sort((a, b) => a.period.localeCompare(b.period));
  if (rangeDays) {
    const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
    points = points.filter((p) => p.period >= cutoff);
  }
  // moving average (3-point)
  const ma = points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 2), i + 1);
    return { ...p, moving_avg: window.reduce((s, x) => s + x.value, 0) / window.length };
  });
  return { code, range_days: rangeDays || null, points: ma, count: ma.length };
}

// ---- timeline --------------------------------------------------------------

export async function buildTimeline(S, orgId, siteId, limit = 100, filter = null) {
  const [events, audits, calcRuns, connRuns, reconRuns] = await Promise.all([
    S.SystemEvent.filter({ organisation_id: orgId }, "-occurred_at", 100),
    S.AuditLog.filter({ organisation_id: orgId }, "-created_date", 100),
    S.CalculationRun.filter({ organisation_id: orgId }, "-created_date", 100),
    S.ConnectorRun.filter({ organisation_id: orgId }, "-created_date", 100),
    S.ReconciliationRun.filter({ organisation_id: orgId }, "-created_date", 100),
  ]);
  const scoped = (r) => !siteId || r.site_id === siteId || !r.site_id;
  const items = [];
  for (const e of events) {
    if (!scoped(e)) continue;
    items.push({ id: "sys-" + e.id, type: classifyEvent(e.event_key), event_key: e.event_key, timestamp: e.occurred_at || e.created_date, title: e.message, severity: e.severity, entity_type: e.entity_type, entity_id: e.entity_id });
  }
  for (const a of audits) {
    items.push({ id: "aud-" + a.id, type: "audit", event_key: a.action_type, timestamp: a.created_date, title: `${a.action_type} ${a.entity_type || ""} ${a.entity_id || ""}`.trim(), severity: "info", entity_type: a.entity_type, entity_id: a.entity_id });
  }
  for (const r of calcRuns) {
    if (!scoped(r)) continue;
    items.push({ id: "calc-" + r.id, type: "calculation", event_key: r.run_type, timestamp: r.run_started_at, title: `${r.run_type} run ${r.status}`, severity: r.status === "failed" ? "critical" : "info", entity_type: "CalculationRun", entity_id: r.id });
  }
  for (const r of connRuns) {
    if (!scoped(r)) continue;
    items.push({ id: "conn-" + r.id, type: "connector", event_key: r.source_system, timestamp: r.run_started_at, title: `${r.source_system} sync ${r.status}`, severity: r.status === "failed" ? "critical" : "info", entity_type: "ConnectorRun", entity_id: r.id });
  }
  for (const r of reconRuns) {
    if (!scoped(r)) continue;
    items.push({ id: "recon-" + r.id, type: "reconciliation", event_key: r.reconciliation_type, timestamp: r.run_started_at, title: `${r.reconciliation_type} reconciliation ${r.status}`, severity: r.status === "failed" ? "critical" : "info", entity_type: "ReconciliationRun", entity_id: r.id });
  }
  let filtered = items;
  if (filter) filtered = items.filter((i) => i.type === filter);
  return filtered.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || ""))).slice(0, limit);
}

function classifyEvent(key) {
  const k = key || "";
  if (k.startsWith("connector") || k.startsWith("import")) return "connector";
  if (k.startsWith("reconciliation")) return "reconciliation";
  if (k.startsWith("financial") || k.startsWith("calc")) return "calculation";
  if (k.startsWith("owner_score")) return "owner_score";
  if (k.startsWith("methodology")) return "methodology";
  if (k.startsWith("config") || k.startsWith("mapping")) return "configuration";
  if (k.startsWith("alert")) return "alert";
  return "audit";
}