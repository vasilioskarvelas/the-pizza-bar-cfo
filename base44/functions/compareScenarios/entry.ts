import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast } from "../../shared/forecastRunner.ts";
import { compareScenarioSets } from "../../shared/forecastEngine.ts";

// Phase 08 — compareScenarios: baseline vs up to N scenarios, deterministic.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const horizon = Number(body.horizon) || 12;
    const siteId = body.site_id || null;
    const inp = await loadForecastInputs(base44, { orgId: actor.orgId, siteId, periodStart: body.period_start, period_end: body.period_end });
    const baseline = await buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId, useCache: true });

    // resolve scenario definitions: explicit ids, or all active scenarios
    const S = base44.asServiceRole.entities;
    let scenarioRecs = [];
    if (body.scenario_ids && body.scenario_ids.length) {
      const all = await S.Scenario.filter({ organisation_id: actor.orgId });
      scenarioRecs = all.filter((s) => body.scenario_ids.includes(s.id) && s.status !== "archived");
    } else if (body.include_all !== false) {
      scenarioRecs = (await S.Scenario.filter({ organisation_id: actor.orgId, status: "active" })).slice(0, 3);
    }
    const scenarios = [];
    for (const rec of scenarioRecs) {
      let adj = [];
      try { adj = JSON.parse(rec.adjustments || "[]"); } catch {}
      const fc = await buildForecast(base44, { inputs: inp, horizon, scenarioAdjustments: adj, scenarioId: rec.id, actorUserId: actor.actorUserId, useCache: true });
      scenarios.push({ name: rec.name, id: rec.id, periods: fc.periods });
    }
    const comparison = compareScenarioSets(baseline.periods, scenarios);
    return Response.json({
      baseline_period: baseline.baseline_period, horizon_months: horizon,
      baseline: { periods: baseline.periods },
      scenarios: scenarios.map((s) => ({ name: s.name, id: s.id, periods: s.periods })),
      comparison, best_scenario: comparison.best_scenario, generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});