// Phase 09 — Executive Planning Engine (PURE, no I/O).
// Deterministic strategic-planning logic driven entirely by metrics already
// produced by the LOCKED Phase 05 (financial), Phase 06 (owner score) and
// Phase 08 (forecast) engines. No AI. No new financial calculation. Every
// recommendation references a stored deterministic figure. Identical inputs
// produce identical outputs (reproducible).

export const PLANNING_ENGINE_VERSION = "executive-planning-1.0";

// ---- goal category catalogue (mirrors ExecutiveGoal.category enum) ------------
export const GOAL_CATEGORIES = [
  { key: "revenue",        label: "Revenue",            direction: "maximize", unit: "cents",   kpi: "revenue" },
  { key: "profit",         label: "Profit",             direction: "maximize", unit: "cents",   kpi: "net_profit" },
  { key: "cash",           label: "Cash",               direction: "maximize", unit: "cents",   kpi: "cash",          alt: ["closing_cash"] },
  { key: "owner_score",    label: "Owner Score",       direction: "maximize", unit: "score",   kpi: "owner_score" },
  { key: "debt_reduction", label: "Debt Reduction",    direction: "minimize", unit: "cents",   kpi: "long_term_debt" },
  { key: "food_cost",      label: "Food Cost %",        direction: "minimize", unit: "bps",     kpi: "food_cost_pct" },
  { key: "labour",         label: "Labour %",          direction: "minimize", unit: "bps",     kpi: "labour_cost_pct" },
  { key: "gst",            label: "GST Position",       direction: "minimize", unit: "cents",   kpi: "net_gst_position" },
  { key: "working_capital",label: "Working Capital",   direction: "maximize", unit: "cents",   kpi: "working_capital" },
  { key: "custom_kpi",     label: "Custom KPI",         direction: "maximize", unit: "count" },
];

export function categoryMeta(key) {
  return GOAL_CATEGORIES.find((c) => c.key === key) || GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1];
}

// ---- progress -----------------------------------------------------------------

export function goalProgress(goal) {
  const base = Number(goal.baseline_value) || 0;
  const target = Number(goal.target_value) || 0;
  const current = Number(goal.current_value) || 0;
  const span = target - base;
  if (span === 0) return current >= target ? 100 : 0;
  let p;
  if (goal.direction === "minimize") {
    const s2 = base - target;
    if (s2 === 0) return current <= target ? 100 : 0;
    p = ((base - current) / s2) * 100;
  } else {
    p = ((current - base) / span) * 100;
  }
  if (!isFinite(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p * 10) / 10));
}

export function goalPace(goal, todayIso) {
  const s = goal.start_date, e = goal.end_date;
  if (!s || !e) return 0;
  const now = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00Z").getTime();
  const st = new Date(s + "T00:00:00Z").getTime();
  const et = new Date(e + "T00:00:00Z").getTime();
  if (et <= st) return 0;
  const elapsed = (now - st) / (et - st);
  return Math.max(0, Math.min(1, elapsed)) * 100;
}

export function monthsRemaining(goal, todayIso) {
  if (!goal.end_date) return 0;
  const now = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  const e = new Date(goal.end_date + "T00:00:00Z");
  if (e <= now) return 0;
  return Math.max(0, (e.getUTCFullYear() - now.getUTCFullYear()) * 12 + (e.getUTCMonth() - now.getUTCMonth()));
}

export function monthsElapsed(goal, todayIso) {
  if (!goal.start_date) return 0;
  const now = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  const s = new Date(goal.start_date + "T00:00:00Z");
  if (now < s) return 0;
  return Math.max(0, (now.getUTCFullYear() - s.getUTCFullYear()) * 12 + (now.getUTCMonth() - s.getUTCMonth()));
}

export function goalStatus(goal, todayIso) {
  const progress = goalProgress(goal);
  if (progress >= 100) return "achieved";
  if (goal.end_date && new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00Z") > new Date(goal.end_date + "T00:00:00Z")) return "overdue";
  const pace = goalPace(goal, todayIso);
  if (progress < 5 && pace < 5) return "not_started";
  return progress >= pace - 10 ? "on_track" : "at_risk";
}

// ---- goal forecasting ---------------------------------------------------------

export function forecastGoal(goal, history, todayIso) {
  const progress = goalProgress(goal);
  const current = Number(goal.current_value) || 0;
  const target = Number(goal.target_value) || 0;
  const base = Number(goal.baseline_value) || 0;
  const remaining = monthsRemaining(goal, todayIso);
  const elapsed = Math.max(1, monthsElapsed(goal, todayIso));

  let slope = 0;
  if (history && history.length >= 2) {
    const pts = history.slice(-12).map((h, i) => ({ x: i, y: Number(h.value) || 0 }));
    const n = pts.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
    const denom = n * sxx - sx * sx;
    slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  }

  const needed = target - current;
  const improvementPerMonth = goal.direction === "minimize" ? -slope : slope;
  const requiredRate = remaining > 0 ? Math.abs(needed) / remaining : Math.abs(needed);

  let expectedCompletion = null;
  if (improvementPerMonth > 0) {
    const monthsToTarget = Math.abs(needed) / improvementPerMonth;
    if (isFinite(monthsToTarget) && monthsToTarget < 600) {
      const base2 = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
      expectedCompletion = new Date(Date.UTC(base2.getUTCFullYear(), base2.getUTCMonth() + Math.ceil(monthsToTarget), 1)).toISOString().slice(0, 10);
    }
  }

  const willAchieve = improvementPerMonth > 0 && remaining > 0 && Math.abs(needed) <= improvementPerMonth * remaining;
  const confidence = computeConfidence(history, progress, willAchieve);

  return {
    progress,
    current,
    target,
    baseline: base,
    remaining_months: remaining,
    elapsed_months: elapsed,
    improvement_per_month: Math.round(improvementPerMonth),
    required_rate_per_month: Math.round(requiredRate),
    expected_completion_date: expectedCompletion,
    will_achieve: willAchieve,
    confidence,
    pace_pct: Math.round(goalPace(goal, todayIso) * 10) / 10,
    needs_acceleration: !willAchieve && remaining > 0 && requiredRate > Math.max(1, improvementPerMonth),
  };
}

function computeConfidence(history, progress, willAchieve) {
  let c = 0.5;
  if (history && history.length >= 3) c = 0.8;
  else if (history && history.length >= 2) c = 0.6;
  else if (history && history.length >= 1) c = 0.45;
  if (progress >= 80) c = Math.min(1, c + 0.1);
  if (!willAchieve) c = Math.max(0.2, c - 0.15);
  return Math.round(c * 100) / 100;
}

// ---- risk generation ----------------------------------------------------------

export function generateRisks(metrics, rules, ctx = {}) {
  const out = [];
  const todayIso = ctx.today || new Date().toISOString().slice(0, 10);
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const v = metrics[rule.affected_metric];
    if (v == null) continue;
    const fired = compare(Number(v), Number(rule.threshold), rule.comparator);
    if (!fired) continue;
    const likelihood = riskLikelihood(v, rule);
    const impact = evalFormula(rule.impact_formula, metrics);
    out.push({
      rule_key: rule.rule_key,
      title: rule.title,
      description: rule.description || rule.title,
      severity: rule.severity,
      likelihood,
      impact_cents: Math.round(impact),
      affected_metric: rule.affected_metric,
      recommended_action: rule.recommended_action,
      mitigation: rule.mitigation || rule.recommended_action,
      business_impact: rule.business_impact,
      evidence: JSON.stringify({ metric: rule.affected_metric, value: v, threshold: rule.threshold, comparator: rule.comparator }),
      status: "open",
      review_date: addMonths(todayIso, 1),
      acknowledged: false,
    });
  }
  if (ctx.connector_failures > 0) {
    out.push({
      rule_key: "connector_instability",
      title: "Connector Instability",
      description: `${ctx.connector_failures} connector sync failure(s) recorded.`,
      severity: ctx.connector_failures >= 3 ? "high" : "medium",
      likelihood: "likely",
      impact_cents: 0,
      affected_metric: "connector",
      recommended_action: "Review connector logs and re-authorise.",
      mitigation: "Restore sync before relying on downstream figures.",
      business_impact: "Data freshness at risk.",
      evidence: JSON.stringify({ failures: ctx.connector_failures }),
      status: "open",
      review_date: addMonths(todayIso, 1),
      acknowledged: false,
    });
  }
  return out.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
}

function compare(value, threshold, comparator) {
  switch (comparator) {
    case "lt": return value < threshold;
    case "lte": return value <= threshold;
    case "gt": return value > threshold;
    case "gte": return value >= threshold;
    case "eq": return value === threshold;
    default: return value < threshold;
  }
}

function riskLikelihood(value, rule) {
  const t = Number(rule.threshold) || 0;
  if (t === 0) return "possible";
  const ratio = Math.abs(Number(value) - t) / Math.abs(t);
  if (ratio >= 0.5) return "almost_certain";
  if (ratio >= 0.25) return "likely";
  if (ratio >= 0.1) return "possible";
  return "unlikely";
}

// ---- opportunity generation ---------------------------------------------------

export function generateOpportunities(metrics, rules, ctx = {}) {
  const out = [];
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const v = metrics[rule.affected_metric];
    if (v == null) continue;
    const fired = compare(Number(v), Number(rule.threshold), rule.comparator);
    if (!fired) continue;
    const impact = evalFormula(rule.impact_formula, metrics);
    out.push({
      rule_key: rule.rule_key,
      title: rule.title,
      description: rule.description || rule.title,
      category: rule.category || rule.affected_metric,
      financial_impact_cents: Math.round(Math.abs(impact)),
      owner_score_impact: Number(rule.owner_score_impact) || 0,
      implementation_effort: rule.default_effort || "medium",
      priority: priorityFromImpact(Math.abs(impact), rule.default_effort),
      affected_metric: rule.affected_metric,
      recommended_action: rule.recommended_action,
      evidence: JSON.stringify({ metric: rule.affected_metric, value: v, threshold: rule.threshold }),
      status: "identified",
    });
  }
  return out.sort((a, b) => b.financial_impact_cents - a.financial_impact_cents);
}

function priorityFromImpact(impact, effort) {
  const e = effort === "low" ? 1.3 : effort === "high" ? 0.7 : 1;
  const score = (impact / 100000) * e;
  if (score >= 5) return "critical";
  if (score >= 2) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

// ---- scorecard ---------------------------------------------------------------

export function buildScorecard(metrics, goals, historyMap, settings = {}) {
  const codes = settings.scorecard_metrics && settings.scorecard_metrics.length
    ? settings.scorecard_metrics
    : ["revenue","net_profit","cash","owner_score","long_term_debt","net_gst_position","labour_cost_pct","food_cost_pct","working_capital","forecast_accuracy","scenario_performance","goal_progress","initiative_progress"];
  const rows = [];
  for (const code of codes) {
    const meta = SCORECARD_META[code] || { label: code, unit: "count", direction: "maximize" };
    const current = metrics[code];
    const goal = goals.find((g) => linkedMetric(g) === code);
    const target = goal ? Number(goal.target_value) : null;
    const history = historyMap[code] || [];
    const trend = historyTrend(history);
    const variance = (current != null && target != null) ? current - target : null;
    rows.push({
      code, label: meta.label, unit: meta.unit, current, target, variance,
      variance_pct: (variance != null && target && target !== 0) ? Math.round((variance / Math.abs(target)) * 1000) / 10 : null,
      trend, confidence: metrics[`${code}__confidence`] || null,
      status: scorecardStatus(current, target, meta.direction),
    });
  }
  const goalProgressAvg = goals.length ? Math.round(goals.reduce((s, g) => s + goalProgress(g), 0) / goals.length * 10) / 10 : 0;
  rows.push({ code: "goal_progress", label: "Goal Progress", unit: "pct", current: goalProgressAvg, target: 100, variance: goalProgressAvg - 100, trend: "flat", confidence: null, status: goalProgressAvg >= 75 ? "on_track" : "watch" });
  return rows;
}

function scorecardStatus(current, target, direction) {
  if (current == null || target == null) return "no_data";
  if (direction === "minimize") return current <= target ? "on_track" : current <= target * 1.1 ? "watch" : "risk";
  return current >= target ? "on_track" : current >= target * 0.9 ? "watch" : "risk";
}

const SCORECARD_META = {
  revenue: { label: "Revenue", unit: "cents", direction: "maximize" },
  net_profit: { label: "Net Profit", unit: "cents", direction: "maximize" },
  cash: { label: "Cash Position", unit: "cents", direction: "maximize" },
  owner_score: { label: "Owner Score", unit: "score", direction: "maximize" },
  long_term_debt: { label: "Debt", unit: "cents", direction: "minimize" },
  net_gst_position: { label: "GST Position", unit: "cents", direction: "minimize" },
  labour_cost_pct: { label: "Labour %", unit: "bps", direction: "minimize" },
  food_cost_pct: { label: "Food Cost %", unit: "bps", direction: "minimize" },
  working_capital: { label: "Working Capital", unit: "cents", direction: "maximize" },
  forecast_accuracy: { label: "Forecast Accuracy", unit: "pct", direction: "maximize" },
  scenario_performance: { label: "Scenario Performance", unit: "pct", direction: "maximize" },
  goal_progress: { label: "Goal Progress", unit: "pct", direction: "maximize" },
  initiative_progress: { label: "Initiative Progress", unit: "pct", direction: "maximize" },
};

function linkedMetric(goal) {
  return goal.linked_kpi_code || goal.linked_figure_code || categoryMeta(goal.category).kpi || null;
}

function historyTrend(history) {
  if (!history || history.length < 2) return "no_prior";
  const a = Number(history[history.length - 2].value) || 0;
  const b = Number(history[history.length - 1].value) || 0;
  if (b > a) return "up";
  if (b < a) return "down";
  return "flat";
}

// ---- roadmap -----------------------------------------------------------------

export function buildRoadmap(goals, initiatives, todayIso) {
  const t = todayIso || new Date().toISOString().slice(0, 10);
  const quarters = new Map();
  const bucket = (date) => {
    if (!date) return null;
    const d = new Date(date + "T00:00:00Z");
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${d.getUTCFullYear()}-Q${q}`;
  };
  for (const g of goals) {
    const q = bucket(g.end_date) || "unscheduled";
    if (!quarters.has(q)) quarters.set(q, { quarter: q, goals: [], initiatives: [], milestones: [] });
    const status = goalStatus(g, t);
    quarters.get(q).goals.push({ id: g.id, title: g.title, type: "goal", status, progress: goalProgress(g), priority: g.priority, due: g.end_date, dependencies: parseList(g.notes) });
  }
  for (const i of initiatives) {
    const q = bucket(i.due_date) || "unscheduled";
    if (!quarters.has(q)) quarters.set(q, { quarter: q, goals: [], initiatives: [], milestones: [] });
    const delayed = i.due_date && new Date(i.due_date + "T00:00:00Z") < new Date(t + "T00:00:00Z") && i.status !== "completed";
    quarters.get(q).initiatives.push({ id: i.id, title: i.title, type: "initiative", status: delayed ? "delayed" : i.status, progress: i.completion_pct, priority: i.priority, due: i.due_date, dependencies: parseList(i.dependencies) });
    for (const m of parseMilestones(i.milestones)) {
      const mq = bucket(m.due) || q;
      if (!quarters.has(mq)) quarters.set(mq, { quarter: mq, goals: [], initiatives: [], milestones: [] });
      quarters.get(mq).milestones.push({ id: `${i.id}-${m.name}`, title: m.name, type: "milestone", status: m.done ? "completed" : (m.due && new Date(m.due + "T00:00:00Z") < new Date(t + "T00:00:00Z") ? "delayed" : "upcoming"), due: m.due, parent: i.title });
    }
  }
  const sorted = [...quarters.keys()].sort();
  return sorted.map((q) => {
    const block = quarters.get(q);
    const delayed = [...block.goals, ...block.initiatives].filter((x) => x.status === "delayed" || x.status === "overdue").length;
    const completed = [...block.goals, ...block.initiatives].filter((x) => x.status === "achieved" || x.status === "completed").length;
    const upcoming = [...block.goals, ...block.initiatives].filter((x) => x.status === "on_track" || x.status === "in_progress" || x.status === "planned").length;
    return {
      quarter: q, goals: block.goals, initiatives: block.initiatives, milestones: block.milestones,
      summary: { total: block.goals.length + block.initiatives.length, completed, upcoming, delayed },
      risk_indicator: delayed > 0 ? (delayed >= 2 ? "high" : "medium") : (upcoming > 0 ? "low" : "none"),
    };
  });
}

function parseList(s) {
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return String(s).split(/[,\n]/).map((x) => x.trim()).filter(Boolean); }
}

function parseMilestones(s) {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    if (Array.isArray(a)) return a.map((m) => ({ name: m.name || m.title || "Milestone", due: m.due || m.date || null, done: !!m.done || m.status === "completed" }));
  } catch {}
  return [];
}

// ---- notifications (deterministic) ------------------------------------------

export function generatePlanningNotifications({ goals, initiatives, metrics, prevMetrics, settings, todayIso }) {
  const t = todayIso || new Date().toISOString().slice(0, 10);
  const out = [];
  const send = (type, title, body, severity = "info", ref = null) => out.push({ notification_type: type, title, body, severity, ref });

  for (const g of goals) {
    const status = goalStatus(g, t);
    if (settings.notify_goal_overdue && status === "overdue") send("task", `Goal overdue: ${g.title}`, `Passed its end date at ${goalProgress(g).toFixed(0)}% progress.`, "warning", { type: "ExecutiveGoal", id: g.id });
    if (settings.notify_goal_achieved && status === "achieved") send("alert", `Goal achieved: ${g.title}`, `Target reached — ${g.title}.`, "info", { type: "ExecutiveGoal", id: g.id });
  }
  for (const i of initiatives) {
    const delayed = i.due_date && new Date(i.due_date + "T00:00:00Z") < new Date(t + "T00:00:00Z") && i.status !== "completed";
    if (settings.notify_initiative_overdue && delayed) send("task", `Initiative overdue: ${i.title}`, `Passed its due date at ${i.completion_pct}% complete.`, "warning", { type: "Initiative", id: i.id });
    if (settings.notify_goal_achieved && i.status === "completed") send("alert", `Initiative completed: ${i.title}`, `Marked complete.`, "info", { type: "Initiative", id: i.id });
  }
  const cash = metrics.cash, prevCash = prevMetrics?.cash;
  if (settings.notify_cash_milestone && cash != null && prevCash != null) {
    if (prevCash < 5000000 && cash >= 5000000) send("reminder", "Cash milestone", "Cash position crossed $50,000.", "info");
  }
  const debt = metrics.long_term_debt, prevDebt = prevMetrics?.long_term_debt;
  if (settings.notify_debt_milestone && debt != null && prevDebt != null) {
    if (prevDebt > 0 && debt <= 0) send("reminder", "Debt milestone", "Long-term debt fully repaid.", "info");
  }
  const score = metrics.owner_score, prevScore = prevMetrics?.owner_score;
  if (settings.notify_score_milestone && score != null && prevScore != null) {
    const bands = [50, 70, 85];
    for (const b of bands) if (prevScore < b && score >= b) send("reminder", "Owner Score milestone", `Owner Score crossed ${b}.`, "info");
  }
  if (settings.notify_forecast_miss && metrics.forecast_accuracy != null && metrics.forecast_accuracy < 85) {
    send("anomaly", "Forecast miss", `Forecast accuracy dropped to ${metrics.forecast_accuracy.toFixed(0)}%.`, "warning");
  }
  return out;
}

// ---- helpers -----------------------------------------------------------------

const SEV = { critical: 4, high: 3, medium: 2, low: 1 };

function addMonths(iso, m) {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1)).toISOString().slice(0, 10);
}

// Deterministic recursive-descent arithmetic evaluator (no eval / no Function).
// Supports + - * / ^ parentheses and metric-code identifiers. Returns a number.
export function evalFormula(formula, metrics) {
  if (!formula) return 0;
  try {
    const tokens = tokenize(String(formula));
    const parser = new Parser(tokens, metrics || {});
    const result = parser.parseExpr();
    return Number(result) || 0;
  } catch { return 0; }
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "(" || ch === ")") { tokens.push({ t: ch }); i++; continue; }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let num = "";
      while (i < src.length && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) { num += src[i]; i++; }
      tokens.push({ t: "num", v: Number(num) });
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let id = "";
      while (i < src.length && ((src[i] >= "a" && src[i] <= "z") || (src[i] >= "A" && src[i] <= "Z") || src[i] === "_" || (src[i] >= "0" && src[i] <= "9"))) { id += src[i]; i++; }
      tokens.push({ t: "id", v: id });
      continue;
    }
    // unknown char -> skip
    i++;
  }
  return tokens;
}

class Parser {
  constructor(tokens, metrics) { this.tokens = tokens; this.pos = 0; this.metrics = metrics; }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  parseExpr() {
    let v = this.parseTerm();
    while (this.peek() && (this.peek().t === "+" || this.peek().t === "-")) {
      const op = this.next().t;
      const r = this.parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  parseTerm() {
    let v = this.parseFactor();
    while (this.peek() && (this.peek().t === "*" || this.peek().t === "/")) {
      const op = this.next().t;
      const r = this.parseFactor();
      v = op === "*" ? v * r : (r === 0 ? 0 : v / r);
    }
    return v;
  }
  parseFactor() {
    let v = this.parseAtom();
    while (this.peek() && this.peek().t === "^") {
      this.next();
      const r = this.parseAtom();
      v = Math.pow(v, r);
    }
    return v;
  }
  parseAtom() {
    const tok = this.peek();
    if (!tok) return 0;
    if (tok.t === "-") { this.next(); return -this.parseAtom(); }
    if (tok.t === "+") { this.next(); return this.parseAtom(); }
    if (tok.t === "(") { this.next(); const v = this.parseExpr(); if (this.peek() && this.peek().t === ")") this.next(); return v; }
    if (tok.t === "num") { this.next(); return tok.v; }
    if (tok.t === "id") { this.next(); return Number(this.metrics[tok.v]) || 0; }
    this.next();
    return 0;
  }
}