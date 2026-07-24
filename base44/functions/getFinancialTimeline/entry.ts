import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast } from "../../shared/forecastRunner.ts";
import { FORECAST_METRICS, GRANULARITIES } from "../../shared/forecastEngine.ts";
import { buildTimeline } from "../../shared/dashboardShared.ts";

// Phase 08 — Financial Timeline: merges deterministic financial metric series
// (actual + forecast) with activity events, bucketed by granularity, with filters.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const orgId = actor.orgId, siteId = body.site_id || null;
    const granularity = GRANULARITIES.includes(body.granularity) ? body.granularity : "monthly";
    const from = body.from || null, to = body.to || null;
    const metricFilter = body.metric || null, category = body.category || null, eventType = body.event_type || null;
    const includeForecast = body.include_forecast !== false;
    const horizon = Number(body.horizon) || 12;

    const inp = await loadForecastInputs(base44, { orgId, siteId, periodStart: body.period_start, period_end: body.period_end });
    const forecast = includeForecast ? await buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId }) : null;

    // metric series (actual + forecast), filtered + bucketed
    const metrics = FORECAST_METRICS.filter((m) => {
      if (metricFilter && m.code !== metricFilter) return false;
      if (category && groupOf(m.code) !== category) return false;
      return true;
    }).map((m) => {
      const series = forecast?.series.find((s) => s.code === m.code);
      let actuals = series?.actuals || [];
      let fc = includeForecast ? (series?.forecast || []) : [];
      if (from) actuals = actuals.filter((p) => p.period >= from);
      if (to) actuals = actuals.filter((p) => p.period <= to);
      if (from) fc = fc.filter((p) => p.period >= from);
      if (to) fc = fc.filter((p) => p.period <= to);
      const bucketedActuals = bucket(actuals, granularity, m);
      const bucketedForecast = bucket(fc, granularity, m);
      return { code: m.code, label: m.label, unit: m.unit, kind: m.kind, actuals: bucketedActuals, forecast: bucketedForecast };
    });

    // activity events (reuse Phase 07 timeline builder)
    const events = await buildTimeline(base44.asServiceRole.entities, orgId, siteId, 200, eventType);

    return Response.json({
      granularity, range: { from, to }, site_id: siteId,
      baseline_period: { start: inp.baselinePeriod, end: inp.baselinePeriodEnd },
      metrics, events,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function groupOf(code) {
  const profitability = ["revenue", "gross_profit", "ebitda", "net_profit", "gross_margin", "operating_expense_pct", "food_cost_pct", "labour_cost_pct"];
  const liquidity = ["cash", "working_capital", "current_ratio", "quick_ratio", "cash_runway"];
  const debt = ["long_term_debt", "debt_ratio"];
  const tax = ["net_gst_position"];
  const score = ["owner_score"];
  if (profitability.includes(code)) return "profitability";
  if (liquidity.includes(code)) return "liquidity";
  if (debt.includes(code)) return "debt";
  if (tax.includes(code)) return "tax";
  if (score.includes(code)) return "score";
  return "other";
}

function bucket(points, granularity, m) {
  if (!points.length) return [];
  if (granularity === "monthly" || granularity === "daily" || granularity === "weekly") return points;
  // quarterly / yearly aggregate
  const groups = new Map();
  for (const p of points) {
    const key = granularity === "quarterly" ? p.period.slice(0, 5) + (Math.floor((Number(p.period.slice(5, 7)) - 1) / 3) + 1) : p.period.slice(0, 4);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.entries()].map(([key, pts]) => {
    const vals = pts.map((p) => Number(p.value) || 0);
    const agg = (m.kind === "flow") ? vals.reduce((s, v) => s + v, 0) : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    return { period: key, value: agg, unit: pts[0].unit, confidence: pts[0].confidence, kind: pts[0].kind };
  }).sort((a, b) => a.period.localeCompare(b.period));
}