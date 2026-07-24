import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast } from "../../shared/forecastRunner.ts";
import { FORECAST_METRICS, pmetric } from "../../shared/forecastEngine.ts";

// Phase 08 — runScenarioSimulation: deterministic "what-if" without persisting
// a scenario. Returns impact vs baseline across financial/profit/cash/score/tax/runway.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const horizon = Number(body.horizon) || 12;
    const adjustments = body.adjustments || [];
    const inp = await loadForecastInputs(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start, period_end: body.period_end });
    const [baseline, scenario] = await Promise.all([
      buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId, useCache: true }),
      buildForecast(base44, { inputs: inp, horizon, scenarioAdjustments: adjustments, actorUserId: actor.actorUserId, useCache: true }),
    ]);
    const last = (p) => p[p.length - 1] || null;
    const sumFlow = (p, code) => p.reduce((s, x) => s + (Number(pmetric(x, code)) || 0), 0);
    const pickLast = (p, code) => { const lp = last(p); return lp ? pmetric(lp, code) : null; };
    const metrics = ["revenue", "net_profit", "ebitda", "cash", "long_term_debt", "net_gst_position", "cash_runway", "owner_score"];
    const impact = metrics.map((code) => {
      const m = FORECAST_METRICS.find((x) => x.code === code);
      const base = m.kind === "flow" ? sumFlow(baseline.periods, code) : pickLast(baseline.periods, code);
      const scen = m.kind === "flow" ? sumFlow(scenario.periods, code) : pickLast(scenario.periods, code);
      let variance = null, pct = null;
      if (base != null && scen != null) { variance = scen - base; pct = base !== 0 ? (variance / Math.abs(base)) * 100 : null; }
      return { code, label: m.label, unit: m.unit, baseline: base, scenario: scen, variance, pct };
    });
    return Response.json({
      adjustments, horizon_months: horizon, baseline_period: baseline.baseline_period,
      impact,
      baseline_score: last(baseline.periods)?.owner_score?.score ?? null,
      scenario_score: last(scenario.periods)?.owner_score?.score ?? null,
      baseline_periods: baseline.periods, scenario_periods: scenario.periods,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});