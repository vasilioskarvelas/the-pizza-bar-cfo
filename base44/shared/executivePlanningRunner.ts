// Phase 09 — Executive Planning RUNNER (I/O against base44.asServiceRole).
// Loads deterministic Phase 05/06/08 outputs, builds the metrics map + histories,
// and drives the pure executivePlanningEngine. Persists generated risks /
// opportunities + notifications and writes audit logs on CRUD. No AI.

import {
  PLANNING_ENGINE_VERSION, GOAL_CATEGORIES, categoryMeta,
  goalProgress, goalStatus, goalPace, monthsRemaining, forecastGoal,
  generateRisks, generateOpportunities, buildScorecard, buildRoadmap,
  generatePlanningNotifications, evalFormula,
} from "./executivePlanningEngine.ts";
import { getCurrentResults } from "./financialRunner.ts";
import { getCurrentOwnerScore } from "./ownerScoreRunner.ts";
import { publishEvent, writeAudit, now, today } from "./authEvents.ts";

// latest result per (result_type, entity_id, site, period) by created_date
function latestPerKey(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${r.result_type}|${r.entity_id}|${r.site_id || ""}|${r.period_start}|${r.period_end}`;
    const prev = map.get(key);
    if (!prev || String(r.created_date || "").localeCompare(String(prev.created_date || "")) > 0) map.set(key, r);
  }
  return [...map.values()];
}

// ---- metric loading ----------------------------------------------------------

const METRIC_CODES = [
  "revenue","gross_profit","gross_margin","ebitda","net_profit","cash","closing_cash",
  "cash_runway","working_capital","current_ratio","quick_ratio","debt_ratio",
  "net_gst_position","labour_cost_pct","food_cost_pct","operating_expense_pct",
  "long_term_debt","owner_score",
];

export async function loadMetrics(base44, { orgId, siteId, periodStart, periodEnd }) {
  const S = base44.asServiceRole.entities;
  const [allFig, allKpi, allScore, connRuns] = await Promise.all([
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }, "-period_start", 1000),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "kpi" }, "-period_start", 1000),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" }, "-period_start", 1000),
    S.ConnectorRun.filter({ organisation_id: orgId }),
  ]);
  const scope = (r) => (siteId ? r.site_id === siteId : !r.site_id);
  const all = latestPerKey([...allFig, ...allKpi, ...allScore]).filter(scope);

  const periods = [...new Set(all.map((r) => r.period_start))].sort();
  let bp = periodStart, be = periodEnd;
  if (!bp || !be) {
    const last = periods[periods.length - 1];
    if (last) { bp = last; be = all.find((r) => r.period_start === last).period_end; }
  }
  const periodFigs = all.filter((r) => r.period_start === bp);

  const metrics = {};
  const confidence = {};
  for (const code of METRIC_CODES) {
    const rec = periodFigs.find((r) => r.entity_id === code) || all.filter((r) => r.entity_id === code).slice(-1)[0];
    if (rec) { metrics[code] = Number(rec.value) || 0; confidence[code] = rec.confidence; }
  }
  for (const k of Object.keys(confidence)) metrics[`${k}__confidence`] = confidence[k];

  try {
    const os = await getCurrentOwnerScore(base44, { orgId, siteId, periodStart: bp, periodEnd: be });
    if (os?.score?.value != null) { metrics.owner_score = os.score.value; metrics.owner_score__confidence = os.score.confidence || null; }
  } catch {}

  const historyMap = {};
  for (const code of METRIC_CODES) {
    const recs = all.filter((r) => r.entity_id === code).sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
    historyMap[code] = recs.map((r) => ({ period: r.period_start, value: Number(r.value) || 0, confidence: r.confidence }));
  }

  try { metrics.forecast_accuracy = await computeForecastAccuracy(base44, { orgId, siteId, bp }); } catch { metrics.forecast_accuracy = null; }
  try { metrics.scenario_performance = await computeScenarioPerformance(base44, { orgId, siteId }); } catch { metrics.scenario_performance = null; }

  const connector_failures = connRuns.filter((r) => (siteId ? r.site_id === siteId : true) && r.status === "failed").length;

  return { metrics, historyMap, periodStart: bp, periodEnd: be, connector_failures };
}

async function computeForecastAccuracy(base44, { orgId, siteId, actualPeriod }) {
  const S = base44.asServiceRole.entities;
  const [forecasts, actuals] = await Promise.all([
    S.ForecastResult.filter({ organisation_id: orgId, site_id: siteId || null }, "-generated_at", 20),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }, "-period_start", 500),
  ]);
  if (!forecasts.length) return null;
  let totalErr = 0, count = 0;
  const f = forecasts[0];
  let payload = [];
  try { payload = JSON.parse(f.payload || "[]"); } catch {}
  for (const p of payload) {
    const actual = actuals.find((a) => a.entity_id === "revenue" && a.period_start === p.period_start);
    if (actual && p.metrics?.revenue?.value != null) {
      const av = Number(actual.value) || 0;
      const fv = p.metrics.revenue.value;
      if (av !== 0) { totalErr += Math.abs(av - fv) / Math.abs(av); count++; }
    }
  }
  if (count === 0) return null;
  return Math.max(0, Math.round((1 - totalErr / count) * 1000) / 10);
}

async function computeScenarioPerformance(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  const scenarios = await S.Scenario.filter({ organisation_id: orgId, status: "active" }, "-created_date", 50);
  if (!scenarios.length) return null;
  let best = null;
  for (const sc of scenarios) {
    try {
      const r = await base44.functions.invoke("runScenarioSimulation", { scenario_id: sc.id, horizon: 12 });
      const netImpact = Number(r?.impact?.net_profit_cents) || 0;
      if (best === null || netImpact > best) best = netImpact;
    } catch {}
  }
  return best;
}

// ---- settings ----------------------------------------------------------------

const DEFAULT_SETTINGS = {
  scorecard_metrics: [],
  default_horizon_months: 12,
  roadview_view: "quarterly",
  notify_goal_overdue: true,
  notify_initiative_overdue: true,
  notify_forecast_miss: true,
  notify_risk_escalation: true,
  notify_goal_achieved: true,
  notify_score_milestone: true,
  notify_cash_milestone: true,
  notify_debt_milestone: true,
};

export async function loadSettings(base44, orgId, siteId) {
  const S = base44.asServiceRole.entities;
  const recs = await S.ExecutiveDashboardSetting.filter({ organisation_id: orgId });
  let rec = recs.find((r) => (r.site_id || null) === (siteId || null)) || recs.find((r) => !r.site_id);
  let settings = { ...DEFAULT_SETTINGS };
  if (rec) {
    let sm = [];
    try { sm = JSON.parse(rec.scorecard_metrics || "[]"); } catch {}
    settings = { ...settings, ...rec, scorecard_metrics: sm };
  }
  return settings;
}

// ---- default rules -----------------------------------------------------------

export const DEFAULT_RISK_RULES = [
  { rule_key: "cash_shortage", title: "Cash Shortage", description: "Cash runway below safety threshold.", severity: "critical", affected_metric: "cash_runway", threshold: 4, comparator: "lt", business_impact: "Insufficient operating cash.", recommended_action: "Arrange short-term funding or reduce outflows.", mitigation: "Secure a working-capital facility.", impact_formula: "cash_runway" },
  { rule_key: "debt_increase", title: "Debt Increase", description: "Debt ratio above acceptable level.", severity: "high", affected_metric: "debt_ratio", threshold: 5000, comparator: "gt", business_impact: "Solvency pressure.", recommended_action: "Review debt servicing capacity.", mitigation: "Refinance or reduce debt.", impact_formula: "long_term_debt * 0.08" },
  { rule_key: "gst_exposure", title: "GST Exposure", description: "Net GST position owed to ATO.", severity: "high", affected_metric: "net_gst_position", threshold: 100000, comparator: "gt", business_impact: "BAS payment obligation.", recommended_action: "Set aside GST funds.", mitigation: "Reserve cash for BAS lodgement.", impact_formula: "net_gst_position" },
  { rule_key: "declining_owner_score", title: "Declining Owner Score", description: "Owner Score below healthy band.", severity: "high", affected_metric: "owner_score", threshold: 60, comparator: "lt", business_impact: "Overall health weakening.", recommended_action: "Address lowest component scores.", mitigation: "Targeted operational improvements.", impact_formula: "owner_score * 1000" },
  { rule_key: "labour_overrun", title: "Labour Overrun", description: "Labour cost above target %.", severity: "medium", affected_metric: "labour_cost_pct", threshold: 3500, comparator: "gt", business_impact: "Erodes EBITDA margin.", recommended_action: "Review roster and overtime.", mitigation: "Align labour to revenue.", impact_formula: "revenue * (labour_cost_pct - 3500) / 10000" },
  { rule_key: "food_cost_overrun", title: "Food Cost Overrun", description: "Food cost above target %.", severity: "medium", affected_metric: "food_cost_pct", threshold: 3200, comparator: "gt", business_impact: "Reduces gross margin.", recommended_action: "Review supplier pricing and wastage.", mitigation: "Portion control and waste logs.", impact_formula: "revenue * (food_cost_pct - 3200) / 10000" },
];

export const DEFAULT_OPPORTUNITY_RULES = [
  { rule_key: "improve_labour_efficiency", title: "Improve Labour Efficiency", description: "Labour cost above target — potential saving.", category: "cost", affected_metric: "labour_cost_pct", threshold: 3500, comparator: "gt", impact_formula: "revenue * (labour_cost_pct - 3500) / 10000", owner_score_impact: 3, default_effort: "medium", recommended_action: "Optimise roster to reduce labour %." },
  { rule_key: "increase_pricing", title: "Increase Pricing", description: "Gross margin below target — pricing opportunity.", category: "revenue", affected_metric: "gross_margin", threshold: 4000, comparator: "lt", impact_formula: "revenue * (4000 - gross_margin) / 10000", owner_score_impact: 2, default_effort: "low", recommended_action: "Review menu pricing strategy." },
  { rule_key: "reduce_wastage", title: "Reduce Wastage", description: "Food cost above target — wastage reduction.", category: "cost", affected_metric: "food_cost_pct", threshold: 3200, comparator: "gt", impact_formula: "revenue * (food_cost_pct - 3200) / 10000", owner_score_impact: 2, default_effort: "medium", recommended_action: "Implement waste tracking." },
  { rule_key: "debt_refinancing", title: "Debt Refinancing", description: "Debt ratio high — refinancing potential.", category: "debt", affected_metric: "debt_ratio", threshold: 4000, comparator: "gt", impact_formula: "long_term_debt * 0.02", owner_score_impact: 4, default_effort: "high", recommended_action: "Negotiate lower interest rate." },
  { rule_key: "cash_optimisation", title: "Cash Optimisation", description: "Current ratio low — working capital improvement.", category: "cash", affected_metric: "current_ratio", threshold: 15000, comparator: "lt", impact_formula: "cash * 0.05", owner_score_impact: 1, default_effort: "low", recommended_action: "Optimise receivables cycle." },
  { rule_key: "revenue_growth", title: "Revenue Growth", description: "Flat or declining revenue — growth opportunity.", category: "revenue", affected_metric: "revenue", threshold: 0, comparator: "gt", impact_formula: "revenue * 0.1", owner_score_impact: 5, default_effort: "high", recommended_action: "Invest in marketing / new store." },
  { rule_key: "margin_improvement", title: "Margin Improvement", description: "Gross margin below benchmark.", category: "margin", affected_metric: "gross_margin", threshold: 4500, comparator: "lt", impact_formula: "revenue * (4500 - gross_margin) / 10000", owner_score_impact: 2, default_effort: "medium", recommended_action: "Renegotiate supplier terms." },
  { rule_key: "working_capital_improvement", title: "Working Capital Improvement", description: "Working capital negative — improvement opportunity.", category: "cash", affected_metric: "working_capital", threshold: 0, comparator: "lt", impact_formula: "working_capital * -0.1", owner_score_impact: 2, default_effort: "medium", recommended_action: "Tighten payment terms." },
];

// ---- goal CRUD ---------------------------------------------------------------

export async function listGoals(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  const goals = await S.ExecutiveGoal.filter({ organisation_id: orgId }, "-created_date", 500);
  const scoped = goals.filter((g) => (siteId ? g.site_id === siteId : true));
  const { metrics, historyMap } = await loadMetrics(base44, { orgId, siteId });
  const todayIso = today();
  return scoped.map((g) => {
    const meta = categoryMeta(g.category);
    const dir = g.direction || meta.direction;
    const linkedCode = g.linked_kpi_code || g.linked_figure_code || meta.kpi || null;
    let current = Number(g.current_value) || 0;
    if (linkedCode && metrics[linkedCode] != null) current = Number(metrics[linkedCode]);
    const goal = { ...g, direction: dir, current_value: current };
    const progress = goalProgress(goal);
    const status = goalStatus(goal, todayIso);
    const forecast = forecastGoal(goal, historyMap[linkedCode] || [], todayIso);
    return { ...goal, progress_pct: progress, status, forecast };
  });
}

export async function createGoal(base44, { orgId, siteId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const meta = categoryMeta(body.category);
  const rec = await S.ExecutiveGoal.create({
    organisation_id: orgId, site_id: body.site_id || siteId || null,
    title: body.title || "Untitled goal", description: body.description || "",
    category: body.category || "custom_kpi", owner_user_id: body.owner_user_id || actorUserId || null,
    target_value: Number(body.target_value) || 0, baseline_value: Number(body.baseline_value) || 0,
    current_value: Number(body.current_value) || 0, unit: body.unit || meta.unit,
    direction: body.direction || meta.direction,
    start_date: body.start_date || today(), end_date: body.end_date || null,
    priority: body.priority || "medium", status: body.status || "not_started", progress_pct: 0,
    linked_kpi_code: body.linked_kpi_code || meta.kpi || null,
    linked_figure_code: body.linked_figure_code || null,
    linked_scenario_id: body.linked_scenario_id || null,
    linked_forecast_horizon_months: Number(body.linked_forecast_horizon_months) || null,
    notes: body.notes || null,
  });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "ExecutiveGoal", entityId: rec.id, actorUserId, afterState: JSON.stringify({ title: rec.title, category: rec.category, target: rec.target_value }), reason: "executive goal created" });
  return rec;
}

export async function updateGoal(base44, { orgId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const upd = {};
  for (const f of ["title","description","category","owner_user_id","priority","status","start_date","end_date","unit","direction","linked_kpi_code","linked_figure_code","linked_scenario_id","notes"]) if (body[f] !== undefined) upd[f] = body[f];
  for (const f of ["target_value","baseline_value","current_value","linked_forecast_horizon_months"]) if (body[f] !== undefined) upd[f] = Number(body[f]);
  const rec = await S.ExecutiveGoal.update(body.goal_id, upd);
  await writeAudit(base44, { orgId, actionType: "update", entityType: "ExecutiveGoal", entityId: body.goal_id, actorUserId, afterState: JSON.stringify(upd), reason: "executive goal updated" });
  return rec;
}

export async function deleteGoal(base44, { orgId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  await S.ExecutiveGoal.delete(body.goal_id);
  await writeAudit(base44, { orgId, actionType: "delete", entityType: "ExecutiveGoal", entityId: body.goal_id, actorUserId, reason: "executive goal deleted" });
  return { deleted: true };
}

// ---- initiative CRUD ---------------------------------------------------------

export async function listInitiatives(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  const inits = await S.Initiative.filter({ organisation_id: orgId }, "-created_date", 500);
  return inits.filter((i) => (siteId ? i.site_id === siteId : true)).map(parseInitiative);
}

export async function createInitiative(base44, { orgId, siteId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const rec = await S.Initiative.create({
    organisation_id: orgId, site_id: body.site_id || siteId || null,
    title: body.title || "Untitled initiative", description: body.description || "",
    goal_ids: JSON.stringify(body.goal_ids || []), owner_user_id: body.owner_user_id || actorUserId || null,
    due_date: body.due_date || null, budget_cents: Number(body.budget_cents) || 0,
    expected_roi_bps: Number(body.expected_roi_bps) || 0,
    expected_owner_score_impact: Number(body.expected_owner_score_impact) || 0,
    expected_cash_impact_cents: Number(body.expected_cash_impact_cents) || 0,
    status: body.status || "planned", completion_pct: Number(body.completion_pct) || 0,
    dependencies: JSON.stringify(body.dependencies || []),
    milestones: JSON.stringify(body.milestones || []),
    evidence: body.evidence || null, priority: body.priority || "medium",
    category: body.category || null, notes: body.notes || null,
  });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "Initiative", entityId: rec.id, actorUserId, afterState: rec.title, reason: "initiative created" });
  return rec;
}

export async function updateInitiative(base44, { orgId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const upd = {};
  for (const f of ["title","description","owner_user_id","due_date","status","priority","category","evidence","notes"]) if (body[f] !== undefined) upd[f] = body[f];
  for (const f of ["budget_cents","expected_roi_bps","expected_owner_score_impact","expected_cash_impact_cents","completion_pct"]) if (body[f] !== undefined) upd[f] = Number(body[f]);
  if (body.goal_ids !== undefined) upd.goal_ids = JSON.stringify(body.goal_ids);
  if (body.dependencies !== undefined) upd.dependencies = JSON.stringify(body.dependencies);
  if (body.milestones !== undefined) upd.milestones = JSON.stringify(body.milestones);
  const rec = await S.Initiative.update(body.initiative_id, upd);
  await writeAudit(base44, { orgId, actionType: "update", entityType: "Initiative", entityId: body.initiative_id, actorUserId, afterState: JSON.stringify(upd), reason: "initiative updated" });
  return rec;
}

export async function deleteInitiative(base44, { orgId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  await S.Initiative.delete(body.initiative_id);
  await writeAudit(base44, { orgId, actionType: "delete", entityType: "Initiative", entityId: body.initiative_id, actorUserId, reason: "initiative deleted" });
  return { deleted: true };
}

function parseInitiative(i) {
  let goal_ids = [], dependencies = [], milestones = [];
  try { goal_ids = JSON.parse(i.goal_ids || "[]"); } catch {}
  try { dependencies = JSON.parse(i.dependencies || "[]"); } catch {}
  try { milestones = JSON.parse(i.milestones || "[]"); } catch {}
  return { ...i, goal_ids, dependencies, milestones };
}

// ---- decision CRUD ----------------------------------------------------------

export async function listDecisions(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  const decs = await S.ExecutiveDecision.filter({ organisation_id: orgId }, "-decision_date", 500);
  return decs.filter((d) => (siteId ? d.site_id === siteId : true)).map(parseDecision);
}

export async function createDecision(base44, { orgId, siteId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  let variance = null, variance_pct = null;
  if (body.actual_value != null && body.expected_value != null) {
    variance = Number(body.actual_value) - Number(body.expected_value);
    if (Number(body.expected_value) !== 0) variance_pct = Math.round((variance / Math.abs(Number(body.expected_value))) * 1000) / 10;
  }
  const rec = await S.ExecutiveDecision.create({
    organisation_id: orgId, site_id: body.site_id || siteId || null,
    decision: body.decision || "Untitled decision", reason: body.reason || "",
    decision_date: body.decision_date || today(), owner_user_id: body.owner_user_id || actorUserId || null,
    expected_outcome: body.expected_outcome || "", scenario_id: body.scenario_id || null,
    forecast_ref: body.forecast_ref || null, actual_outcome: body.actual_outcome || "",
    actual_value: Number(body.actual_value) || null, expected_value: Number(body.expected_value) || null,
    variance, variance_pct, lessons_learned: body.lessons_learned || "",
    status: body.status || "pending", review_date: body.review_date || null,
  });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "ExecutiveDecision", entityId: rec.id, actorUserId, afterState: rec.decision, reason: "executive decision logged" });
  return rec;
}

export async function updateDecision(base44, { orgId, body, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const upd = {};
  for (const f of ["decision","reason","owner_user_id","expected_outcome","scenario_id","forecast_ref","actual_outcome","lessons_learned","status","review_date","decision_date"]) if (body[f] !== undefined) upd[f] = body[f];
  for (const f of ["actual_value","expected_value"]) if (body[f] !== undefined) upd[f] = Number(body[f]);
  if (upd.actual_value != null && upd.expected_value != null) {
    upd.variance = upd.actual_value - upd.expected_value;
    if (upd.expected_value !== 0) upd.variance_pct = Math.round((upd.variance / Math.abs(upd.expected_value)) * 1000) / 10;
  }
  const rec = await S.ExecutiveDecision.update(body.decision_id, upd);
  await writeAudit(base44, { orgId, actionType: "update", entityType: "ExecutiveDecision", entityId: body.decision_id, actorUserId, afterState: JSON.stringify(upd), reason: "executive decision updated" });
  return rec;
}

function parseDecision(d) { return { ...d }; }

// ---- risk / opportunity register --------------------------------------------

export async function getRiskRegister(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  let rules = await S.RiskRule.filter({ organisation_id: orgId });
  if (!rules.length) rules = await seedDefaultRules(S, orgId);
  const existing = await S.ExecutiveRisk.filter({ organisation_id: orgId }, "-created_date", 200);
  const { metrics, connector_failures } = await loadMetrics(base44, { orgId, siteId });
  const generated = generateRisks(metrics, rules, { connector_failures, today: today() });
  const persisted = await upsertGenerated(S, "ExecutiveRisk", existing, generated, orgId, siteId);
  return { risks: persisted, rules_count: rules.length, engine_version: PLANNING_ENGINE_VERSION };
}

export async function getOpportunityRegister(base44, { orgId, siteId }) {
  const S = base44.asServiceRole.entities;
  let rules = await S.OpportunityRule.filter({ organisation_id: orgId });
  if (!rules.length) rules = await seedDefaultOppRules(S, orgId);
  const existing = await S.Opportunity.filter({ organisation_id: orgId }, "-created_date", 200);
  const { metrics } = await loadMetrics(base44, { orgId, siteId });
  const generated = generateOpportunities(metrics, rules, {});
  const persisted = await upsertGenerated(S, "Opportunity", existing, generated, orgId, siteId);
  return { opportunities: persisted, rules_count: rules.length, engine_version: PLANNING_ENGINE_VERSION };
}

async function seedDefaultRules(S, orgId) {
  const out = [];
  for (const r of DEFAULT_RISK_RULES) {
    try { out.push(await S.RiskRule.create({ ...r, organisation_id: orgId, sort_order: 0, enabled: true })); } catch {}
  }
  return out;
}
async function seedDefaultOppRules(S, orgId) {
  const out = [];
  for (const r of DEFAULT_OPPORTUNITY_RULES) {
    try { out.push(await S.OpportunityRule.create({ ...r, organisation_id: orgId, sort_order: 0, enabled: true })); } catch {}
  }
  return out;
}

async function upsertGenerated(S, entityName, existing, generated, orgId, siteId) {
  const byKey = new Map();
  for (const e of existing.filter((e) => (e.site_id || null) === (siteId || null))) {
    if (!byKey.has(e.rule_key)) byKey.set(e.rule_key, []);
    byKey.get(e.rule_key).push(e);
  }
  const result = [];
  const fired = new Set();
  for (const g of generated) {
    fired.add(g.rule_key);
    const recs = byKey.get(g.rule_key) || [];
    let rec = recs[0];
    if (rec) {
      const upd = { severity: g.severity, likelihood: g.likelihood, impact_cents: g.impact_cents, description: g.description, evidence: g.evidence, review_date: g.review_date, affected_metric: g.affected_metric };
      await S[entityName].update(rec.id, upd);
      result.push({ ...g, ...rec, ...upd, id: rec.id });
    } else {
      const created = await S[entityName].create({ organisation_id: orgId, site_id: siteId || null, ...g });
      result.push({ ...g, id: created.id });
    }
  }
  for (const [key, recs] of byKey) {
    if (fired.has(key)) continue;
    for (const r of recs) {
      if (r.status === "open" || r.status === "identified") {
        const closedStatus = entityName === "ExecutiveRisk" ? "closed" : "rejected";
        await S[entityName].update(r.id, { status: closedStatus });
      }
    }
  }
  return result.sort((a, b) => (SEV[b.severity] || 0) - (SEV[a.severity] || 0) || (b.impact_cents || 0) - (a.impact_cents || 0));
}
const SEV = { critical: 4, high: 3, medium: 2, low: 1 };

// ---- scorecard / roadmap ----------------------------------------------------

export async function getScorecard(base44, { orgId, siteId, periodStart, periodEnd }) {
  const S = base44.asServiceRole.entities;
  const [{ metrics, historyMap }, settings, goals, initiatives] = await Promise.all([
    loadMetrics(base44, { orgId, siteId, periodStart, periodEnd }),
    loadSettings(base44, orgId, siteId),
    S.ExecutiveGoal.filter({ organisation_id: orgId }, "-created_date", 500),
    S.Initiative.filter({ organisation_id: orgId }, "-created_date", 500),
  ]);
  const scopedGoals = goals.filter((g) => (siteId ? g.site_id === siteId : true));
  const inits = initiatives.filter((i) => (siteId ? i.site_id === siteId : true));
  const initiativeProgressAvg = inits.length ? Math.round(inits.reduce((s, i) => s + (Number(i.completion_pct) || 0), 0) / inits.length * 10) / 10 : 0;
  metrics.initiative_progress = initiativeProgressAvg;
  const rows = buildScorecard(metrics, scopedGoals, historyMap, settings);
  return { rows, period_start: periodStart, period_end: periodEnd, engine_version: PLANNING_ENGINE_VERSION };
}

export async function getRoadmapData(base44, { orgId, siteId, view }) {
  const S = base44.asServiceRole.entities;
  const [goals, initiatives] = await Promise.all([
    S.ExecutiveGoal.filter({ organisation_id: orgId }, "-created_date", 500),
    S.Initiative.filter({ organisation_id: orgId }, "-created_date", 500),
  ]);
  const scopedGoals = goals.filter((g) => (siteId ? g.site_id === siteId : true));
  const inits = initiatives.filter((i) => (siteId ? i.site_id === siteId : true)).map(parseInitiative);
  const blocks = buildRoadmap(scopedGoals, inits, today());
  if (view === "annual") {
    const byYear = new Map();
    for (const b of blocks) {
      const year = b.quarter.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, { quarter: year, goals: [], initiatives: [], milestones: [], summary: { total: 0, completed: 0, upcoming: 0, delayed: 0 }, risk_indicator: "none" });
      const agg = byYear.get(year);
      agg.goals.push(...b.goals); agg.initiatives.push(...b.initiatives); agg.milestones.push(...b.milestones);
      agg.summary.total += b.summary.total; agg.summary.completed += b.summary.completed; agg.summary.upcoming += b.summary.upcoming; agg.summary.delayed += b.summary.delayed;
    }
    for (const agg of byYear.values()) {
      agg.risk_indicator = agg.summary.delayed > 0 ? (agg.summary.delayed >= 2 ? "high" : "medium") : (agg.summary.upcoming > 0 ? "low" : "none");
    }
    return { blocks: [...byYear.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)), view: "annual", engine_version: PLANNING_ENGINE_VERSION };
  }
  return { blocks, view: view || "quarterly", engine_version: PLANNING_ENGINE_VERSION };
}

// ---- notifications ----------------------------------------------------------

export async function generateNotifications(base44, { orgId, siteId, actorUserId }) {
  const S = base44.asServiceRole.entities;
  const [goals, initiatives, settings, { metrics }] = await Promise.all([
    S.ExecutiveGoal.filter({ organisation_id: orgId }, "-created_date", 500),
    S.Initiative.filter({ organisation_id: orgId }, "-created_date", 500),
    loadSettings(base44, orgId, siteId),
    loadMetrics(base44, { orgId, siteId }),
  ]);
  const scopedGoals = goals.filter((g) => (siteId ? g.site_id === siteId : true));
  const inits = initiatives.filter((i) => (siteId ? i.site_id === siteId : true));
  const notifs = generatePlanningNotifications({ goals: scopedGoals, initiatives: inits, metrics, prevMetrics: {}, settings, todayIso: today() });
  const created = [];
  for (const n of notifs) {
    try {
      const rec = await S.Notification.create({
        organisation_id: orgId, user_id: actorUserId || null,
        notification_type: n.notification_type, delivery_channel: "in_app", title: n.title, body: n.body,
        severity: n.severity === "warning" ? "warning" : "info", status: "unread",
        related_entity_type: n.ref?.type || null, related_entity_id: n.ref?.id || null,
      });
      created.push(rec);
    } catch {}
  }
  return { notifications: created, count: created.length };
}

// ---- report ------------------------------------------------------------------

export async function generateReport(base44, { orgId, siteId, periodStart, periodEnd, format }) {
  const S = base44.asServiceRole.entities;
  const [goals, initiatives, decisions, riskReg, oppReg, scorecard, roadmap, { metrics, periodStart: bp, periodEnd: be }] = await Promise.all([
    listGoals(base44, { orgId, siteId }),
    listInitiatives(base44, { orgId, siteId }),
    listDecisions(base44, { orgId, siteId }),
    getRiskRegister(base44, { orgId, siteId }),
    getOpportunityRegister(base44, { orgId, siteId }),
    getScorecard(base44, { orgId, siteId, periodStart, periodEnd }),
    getRoadmapData(base44, { orgId, siteId, view: "quarterly" }),
    loadMetrics(base44, { orgId, siteId, periodStart, periodEnd }),
  ]);
  let forecast = null;
  try { forecast = await base44.functions.invoke("getForecast", { horizon: 12, site_id: siteId || null }).catch(() => null); } catch {}
  let scenario = null;
  try { scenario = await base44.functions.invoke("compareScenarios", { horizon: 12, include_all: true }).catch(() => null); } catch {}

  const achieved = goals.filter((g) => g.status === "achieved").length;
  const onTrack = goals.filter((g) => g.status === "on_track").length;
  const atRisk = goals.filter((g) => g.status === "at_risk" || g.status === "overdue").length;

  return {
    meta: { generated_at: now(), period_start: bp, period_end: be, format: format || "full", engine_version: PLANNING_ENGINE_VERSION },
    executive_summary: {
      organisation_id: orgId, site_id: siteId || null,
      owner_score: metrics.owner_score ?? null,
      revenue: metrics.revenue ?? null, net_profit: metrics.net_profit ?? null, cash: metrics.cash ?? null,
      goals: { total: goals.length, achieved, on_track: onTrack, at_risk: atRisk },
      initiatives: { total: initiatives.length, completed: initiatives.filter((i) => i.status === "completed").length, in_progress: initiatives.filter((i) => i.status === "in_progress").length },
      risks: { total: riskReg.risks.length, critical: riskReg.risks.filter((r) => r.severity === "critical").length, high: riskReg.risks.filter((r) => r.severity === "high").length },
      opportunities: { total: oppReg.opportunities.length, total_impact_cents: oppReg.opportunities.reduce((s, o) => s + (o.financial_impact_cents || 0), 0) },
    },
    financial_performance: ["revenue","gross_profit","ebitda","net_profit","cash","working_capital","long_term_debt","net_gst_position"].map((c) => ({ code: c, value: metrics[c] ?? null, confidence: metrics[`${c}__confidence`] || null })),
    owner_score: { value: metrics.owner_score ?? null, confidence: metrics.owner_score__confidence || null },
    goals: goals.map((g) => ({ id: g.id, title: g.title, category: g.category, status: g.status, progress: g.progress_pct, target: g.target_value, forecast: g.forecast })),
    initiatives: initiatives.map((i) => ({ id: i.id, title: i.title, status: i.status, completion: i.completion_pct, due: i.due_date, goal_ids: i.goal_ids })),
    roadmap: roadmap.blocks,
    risks: riskReg.risks,
    opportunities: oppReg.opportunities,
    forecast_summary: forecast ? { engine_version: forecast.engine_version, periods: (forecast.periods || []).length } : null,
    scenario_summary: scenario ? { scenarios: (scenario.scenarios || []).length, best_scenario: scenario.best_scenario || null } : null,
    decisions: decisions.map((d) => ({ id: d.id, decision: d.decision, date: d.decision_date, status: d.status, variance: d.variance, variance_pct: d.variance_pct })),
  };
}