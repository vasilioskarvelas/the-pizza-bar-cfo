// Phase 06 — Owner Score engine RUNNER (I/O against base44.asServiceRole).
// Imported by every Phase 06 backend function. Pure calc lives in ownerScoreEngine.ts.
// All privileged writes happen here (service role). No AI. Admin/scheduled only.

import {
  ENGINE_VERSION, parseInputConfig, parseMethodologyConfig, validateMethodology,
  evaluateKpi, computeComponent, computeOverall, statusBand, aggregateSiteScores,
  round2, buildOwnerScoreCacheKey,
} from "./ownerScoreEngine.ts";
import { today, now, publishEvent, writeAudit } from "./authEvents.ts";

const EVT = {
  STARTED: "owner_score.started",
  COMPLETED: "owner_score.completed",
  FAILED: "owner_score.failed",
  INVALIDATED: "owner_score.invalidated",
  RECALCULATED: "owner_score.recalculated",
  SUPERSEDED: "owner_score.result.superseded",
  CACHE_REUSED: "owner_score.cache.reused",
  METHOD_INVALID: "owner_score.methodology.invalid",
  CONFIDENCE_REDUCED: "owner_score.confidence.reduced",
};

// latest result per (entity_type, entity_id, site, period) by created_date — duplicate-proof.
function latestPerKey(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${r.result_type}|${r.entity_type}|${r.entity_id}|${r.site_id || ""}|${r.period_start}|${r.period_end}`;
    const prev = map.get(key);
    if (!prev || String(r.created_date || "").localeCompare(String(prev.created_date || "")) > 0) map.set(key, r);
  }
  return [...map.values()];
}
const current = latestPerKey;

// ---- derived inputs (data quality + tax visibility) ----------------------

async function computeDerivedInputs(S, orgId, siteId, periodStart, periodEnd) {
  const scope = (r) => (siteId ? r.site_id === siteId : !r.site_id);
  const [excs, connRuns, figResults, lineage, sources, connectors, taxResults] = await Promise.all([
    S.ReconciliationException.filter({ organisation_id: orgId, resolved: false }),
    S.ConnectorRun.filter({ organisation_id: orgId }),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }),
    S.CalculationLineage.filter({ organisation_id: orgId }),
    S.SourceRecord.filter({ organisation_id: orgId }),
    S.Connector.filter({ organisation_id: orgId }),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure", entity_type: "tax_line" }),
  ]);
  const sExcs = excs.filter(scope);
  const sCritical = sExcs.filter((e) => e.severity === "critical");
  const sFailedRuns = connRuns.filter((r) => r.status === "failed" && r.run_started_at >= periodStart && r.run_started_at <= periodEnd && scope(r));
  const sFig = current(figResults).filter((r) => r.entity_type !== "source_record" && r.period_start === periodStart && r.period_end === periodEnd && scope(r));
  const confirmedCount = sFig.filter((r) => r.confidence === "confirmed").length;
  const calcConfidence = sFig.length ? confirmedCount / sFig.length : 0;
  const linkedResultIds = new Set(lineage.map((l) => l.calculation_result_id));
  const lineageCompleteness = sFig.length ? sFig.filter((r) => linkedResultIds.has(r.id)).length / sFig.length : 1;
  const presentSystems = new Set(sources.filter(scope).map((s) => s.source_system));
  const expectedSystems = new Set((connectors.filter(scope).map((c) => c.source_system)));
  const expectedCount = expectedSystems.size || 1;
  const sourceCompleteness = Math.min(1, presentSystems.size / expectedCount);
  const taxTypes = ["gst", "tax", "payg", "super", "balance_sheet", "cash"];
  const taxExcs = sExcs.filter((e) => taxTypes.some((t) => (e.entity_type || "").toLowerCase().includes(t)));
  const sTax = current(taxResults).filter((r) => r.period_start === periodStart && r.period_end === periodEnd && scope(r));
  const vis = (code) => { const r = sTax.find((x) => x.entity_id === code); return r && (r.confidence === "confirmed" || r.confidence === "estimated") ? 1 : 0; };

  const map = new Map();
  map.set("dq_unresolved_exceptions", { present: true, value: sExcs.length, unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("dq_critical_exceptions", { present: true, value: sCritical.length, unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("dq_failed_connector_runs", { present: true, value: sFailedRuns.length, unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("dq_calc_confidence", { present: true, value: Math.round(calcConfidence * 10000), unit: "ratio_4dp", confidence: "confirmed", na: false, result_id: null });
  map.set("dq_lineage_completeness", { present: true, value: Math.round(lineageCompleteness * 10000), unit: "ratio_4dp", confidence: "confirmed", na: false, result_id: null });
  map.set("dq_source_completeness", { present: true, value: Math.round(sourceCompleteness * 10000), unit: "ratio_4dp", confidence: "confirmed", na: false, result_id: null });
  map.set("tax_gst_visible", { present: true, value: vis("net_gst_position"), unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("tax_payg_visible", { present: true, value: vis("payg_withholding"), unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("tax_super_visible", { present: true, value: vis("superannuation_payable"), unit: "count", confidence: "confirmed", na: false, result_id: null });
  map.set("tax_unresolved_exceptions", { present: true, value: taxExcs.length, unit: "count", confidence: "confirmed", na: false, result_id: null });
  return map;
}

// ---- core run -------------------------------------------------------------

export async function runOwnerScore(base44, opts) {
  const S = base44.asServiceRole.entities;
  const { orgId, siteId = null, periodStart, periodEnd, actorUserId = "system", triggeredBy = "manual", force = false } = opts;

  // 1. Load active methodology + components + inputs + kpi defs + thresholds.
  const [versions, components, inputs, kpiDefs, thresholds] = await Promise.all([
    S.ScoreMethodologyVersion.filter({ organisation_id: orgId }),
    S.ScoreMethodologyComponent.filter({ organisation_id: orgId }),
    S.ScoreMethodologyInput.filter({ organisation_id: orgId }),
    S.KPIDefinition.filter({ organisation_id: orgId, status: "active" }),
    S.KPIThresholdVersion.filter({ organisation_id: orgId }),
  ]);
  const version = (versions || []).filter((v) => v.status === "active" && (!v.effective_to || v.effective_to >= periodStart) && v.effective_from <= periodEnd)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
  if (!version) {
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.METHOD_INVALID, message: "No active methodology version for period", severity: "critical", actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "ScoreMethodologyVersion", actorUserId, success: false, afterState: JSON.stringify({ period: `${periodStart}_${periodEnd}` }), reason: "no active methodology" });
    return { error: "No active methodology version for period" };
  }
  const methodConfig = parseMethodologyConfig(version);
  const compRecords = (components || []).filter((c) => c.methodology_version_id === version.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const thrMap = new Map(); (thresholds || []).forEach((t) => thrMap.set(t.id, t));

  // 2. Validate methodology.
  const validation = validateMethodology(version, compRecords, inputs, kpiDefs, thresholds);
  if (!validation.valid) {
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.METHOD_INVALID, entityType: "ScoreMethodologyVersion", entityId: version.id, message: `Methodology invalid: ${validation.errors.join("; ")}`, severity: "critical", actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "ScoreMethodologyVersion", entityId: version.id, actorUserId, success: false, afterState: JSON.stringify({ errors: validation.errors }), reason: "methodology validation failed" });
    return { error: "Methodology invalid", errors: validation.errors, methodology_version_id: version.id };
  }

  // 3. Load current KPI + financial/tax results for scope+period.
  const allResults = current(await S.CalculationResult.filter({ organisation_id: orgId }))
    .filter((r) => r.result_type !== "score_component" && r.entity_type !== "source_record" &&
      r.period_start === periodStart && r.period_end === periodEnd && (siteId ? r.site_id === siteId : !r.site_id));
  const resIndex = new Map();
  allResults.forEach((r) => { resIndex.set(r.entity_id, r); });

  // 4. Derived inputs.
  const derived = await computeDerivedInputs(S, orgId, siteId, periodStart, periodEnd);

  // 5. Cache key — only this methodology's components/inputs/thresholds feed the score.
  const kpiResultsForCache = allResults.filter((r) => r.result_type === "kpi");
  const compIdsSet = new Set(compRecords.map((c) => c.id));
  const methodInputs = inputs.filter((i) => compIdsSet.has(i.component_id));
  const methodThrIds = new Set();
  for (const i of methodInputs) { const cfg = parseInputConfig(i.description); if (cfg.threshold_version_id) methodThrIds.add(cfg.threshold_version_id); }
  const methodThresholds = [...thrMap.values()].filter((t) => methodThrIds.has(t.id));
  const cacheKey = buildOwnerScoreCacheKey({
    orgId, siteId, period: `${periodStart}_${periodEnd}`, engineVersion: ENGINE_VERSION,
    methodologyVersionId: version.id, kpiResults: kpiResultsForCache, derived: Object.fromEntries([...derived.entries()].map(([k, v]) => [k, v.value])),
    components: compRecords, inputs: methodInputs, thresholds: methodThresholds,
  });

  // 6. Cache reuse.
  if (!force) {
    const priorRuns = (await S.CalculationRun.filter({ organisation_id: orgId, run_type: "owner_score", engine_version: ENGINE_VERSION }));
    const match = current(priorRuns)
      .filter((r) => r.input_snapshot_hash === cacheKey && r.period_start === periodStart && r.period_end === periodEnd &&
        (r.status === "completed" || r.status === "completed_with_errors"))
      .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""))[0];
    if (match) {
      await publishEvent(base44, { orgId, siteId, eventKey: EVT.CACHE_REUSED, entityType: "CalculationRun", entityId: match.id, message: `Owner Score cache reused (key ${cacheKey})`, actorUserId });
      await writeAudit(base44, { orgId, actionType: "read_sensitive", entityType: "CalculationRun", entityId: match.id, actorUserId, afterState: JSON.stringify({ reused: true, cache_key: cacheKey }), reason: "owner score cache reuse" });
      return { reused: true, calculation_run_id: match.id, cache_key: cacheKey };
    }
  }

  // 7. Create run.
  const run = await S.CalculationRun.create({
    organisation_id: orgId, site_id: siteId, run_type: "owner_score", methodology_version_id: version.id,
    period_start: periodStart, period_end: periodEnd, engine_version: ENGINE_VERSION, input_snapshot_hash: cacheKey,
    run_started_at: now(), status: "running", triggered_by: actorUserId,
  });
  await publishEvent(base44, { orgId, siteId, eventKey: EVT.STARTED, entityType: "CalculationRun", entityId: run.id, message: `Owner Score calculation started (${triggeredBy}) ${periodStart}..${periodEnd}`, actorUserId });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, afterState: JSON.stringify({ methodology: version.id, engine: ENGINE_VERSION, cache_key: cacheKey }), reason: "owner score trigger + methodology selection" });

  try {
    // 8. Resolve inputs + compute components.
    const resolveInput = (inp) => {
      const cfg = parseInputConfig(inp.description);
      if (derived.has(inp.input_key)) return derived.get(inp.input_key);
      const r = resIndex.get(inp.input_key);
      if (!r) return { present: false, value: 0, unit: null, confidence: "forecast", na: false, result_id: null };
      return { present: true, value: r.value, unit: r.unit, confidence: r.confidence, na: !!(r.label && r.label.includes("(N/A)")), result_id: r.id };
    };
    const resolvedAll = new Map();
    for (const inp of inputs) resolvedAll.set(inp.input_key, resolveInput(inp));

    const compResults = [];
    let confidenceReduced = false;
    for (const comp of compRecords) {
      const compInputs = inputs.filter((i) => i.component_id === comp.id);
      const cr = computeComponent(comp, compInputs, resolvedAll, thrMap, methodConfig.confidence_factors);
      compResults.push({ code: comp.code, name: comp.name, weight: Number(comp.weight), ...cr });
      if (cr.confidenceNumeric < 1 && cr.used.length) confidenceReduced = true;
      // audit: component weighting + missing-data treatment
      await writeAudit(base44, { orgId, siteId, actionType: "create", entityType: "ScoreMethodologyComponent", entityId: comp.id, actorUserId, afterState: JSON.stringify({ score: round2(cr.score), confidence: cr.confidence, used: cr.used.map((u) => u.input_key), excluded: cr.excluded, unavailable: cr.unavailable, missingRequired: cr.missingRequired }), reason: "component weighting + missing-data treatment" });
      if (cr.confidence !== "confirmed") {
        await publishEvent(base44, { orgId, siteId, eventKey: EVT.CONFIDENCE_REDUCED, entityType: "ScoreMethodologyComponent", entityId: comp.id, message: `Component '${comp.code}' confidence reduced to ${cr.confidence}`, severity: "info", actorUserId });
      }
    }

    // 9. Overall score + status.
    const overall = computeOverall(compResults, methodConfig);
    if (overall.score == null) {
      await S.CalculationRun.update(run.id, { status: "completed_with_errors", run_completed_at: now(), result_count: 0 }).catch(() => {});
      await publishEvent(base44, { orgId, siteId, eventKey: EVT.FAILED, entityType: "CalculationRun", entityId: run.id, message: `Owner Score unavailable: components ${overall.unavailableComponents?.join(",")}`, severity: "critical", actorUserId });
      return { error: "Owner Score unavailable", unavailableComponents: overall.unavailableComponents, calculation_run_id: run.id };
    }
    const statusLabel = statusBand(overall.score, methodConfig.status_bands);
    const statusIndex = methodConfig.status_bands.findIndex((b) => b.label === statusLabel);

    // 10. Trend (previous period owner score).
    const prevScores = current(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component", entity_id: "owner_score" }))
      .filter((r) => (siteId ? r.site_id === siteId : !r.site_id) && r.period_end < periodStart)
      .sort((a, b) => (b.period_end || "").localeCompare(a.period_end || ""));
    const prevScore = prevScores[0] || null;
    let movement = null, trendCode = 0, trendLabel = "no_prior";
    if (prevScore) {
      const prevRun = await S.CalculationRun.get(prevScore.calculation_run_id).catch(() => null);
      if (prevRun && prevRun.methodology_version_id !== version.id) {
        trendCode = -2; trendLabel = "methodology_changed";
      } else {
        movement = round2(overall.score - prevScore.value);
        trendCode = movement > 0.5 ? 1 : movement < -0.5 ? -1 : 0;
        trendLabel = trendCode === 1 ? "improving" : trendCode === -1 ? "declining" : "stable";
      }
    }

    // 11. Persist results + lineage + supersession.
    const priorScopeResults = current(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" }))
      .filter((r) => (siteId ? r.site_id === siteId : !r.site_id) && r.period_start === periodStart && r.period_end === periodEnd);
    const priorById = {}; priorScopeResults.forEach((r) => { priorById[r.entity_id] = r; });
    const created = {}; let supersededCount = 0;

    const persist = async (entityId, value, unit, confidence, label, extra = {}) => {
      const supersedes = priorById[entityId] ? priorById[entityId].id : null;
      const res = await S.CalculationResult.create({
        organisation_id: orgId, site_id: siteId, calculation_run_id: run.id, result_type: "score_component",
        entity_type: "owner_score", entity_id: entityId, value, unit, confidence, methodology_component_id: extra.component_id || null,
        period_start: periodStart, period_end: periodEnd, label, supersedes_result_id: supersedes, kpi_definition_id: extra.kpi_definition_id || null,
      });
      if (supersedes) supersededCount++;
      created[entityId] = res;
      return res;
    };

    // overall + companions
    await persist("owner_score", Math.round(overall.score * 100), "score", overall.confidence, `Owner Score — ${statusLabel}`);
    await persist("owner_score_confidence", Math.round(overall.confidenceNumeric * 10000), "ratio_4dp", overall.confidence, "Owner Score Confidence");
    await persist("owner_score_status", statusIndex, "band_index", overall.confidence, `Owner Score Status — ${statusLabel}`);
    if (movement != null) await persist("owner_score_movement", Math.round(movement * 100), "score_delta", overall.confidence, `Owner Score Movement (${trendLabel})`);
    await persist("owner_score_trend", trendCode, "trend", overall.confidence, `Owner Score Trend — ${trendLabel}`);

    // per component
    for (const cr of compResults) {
      await persist(cr.code, Math.round(cr.score * 100), "score", cr.confidence, cr.name, { component_id: cr.code });
      await persist(`${cr.code}_confidence`, Math.round(cr.confidenceNumeric * 10000), "ratio_4dp", cr.confidence, `${cr.name} Confidence`, { component_id: cr.code });
    }

    // 12. Lineage.
    const linkCalc = async (toId, fromId, fieldPath, sortOrder) => {
      if (!fromId) return;
      await S.CalculationLineage.create({ organisation_id: orgId, calculation_result_id: toId, input_type: "calculation_result", input_record_id: fromId, input_calculation_result_id: fromId, field_path: fieldPath, weight: 1, sort_order: sortOrder });
    };
    const linkConfig = async (toId, recordId, fieldPath, sortOrder) => {
      await S.CalculationLineage.create({ organisation_id: orgId, calculation_result_id: toId, input_type: "configuration", input_record_id: recordId, field_path: fieldPath, weight: 1, sort_order: sortOrder });
    };

    // overall -> components
    let ord = 0;
    for (const cr of compResults) { const compRes = created[cr.code]; if (compRes) await linkCalc(created.owner_score.id, compRes.id, "score", ord++); }
    // overall -> methodology version
    await linkConfig(created.owner_score.id, version.id, "methodology_version", ord++);
    // owner_score_confidence/status/movement/trend -> owner_score
    await linkCalc(created.owner_score_confidence.id, created.owner_score.id, "overall", 0);
    await linkCalc(created.owner_score_status.id, created.owner_score.id, "overall", 0);
    if (created.owner_score_movement) await linkCalc(created.owner_score_movement.id, created.owner_score.id, "current", 0);
    if (prevScore) await linkCalc(created.owner_score_movement.id, prevScore.id, "previous", 1);
    if (created.owner_score_trend) await linkCalc(created.owner_score_trend.id, created.owner_score.id, "score", 0);

    // component -> KPI/financial inputs + component config + threshold config
    for (const cr of compResults) {
      const compRes = created[cr.code];
      if (!compRes) continue;
      const compRecord = compRecords.find((c) => c.code === cr.code);
      let o = 0;
      for (const u of cr.used) { if (u.result_id) await linkCalc(compRes.id, u.result_id, u.input_key, o++); }
      if (compRecord) await linkConfig(compRes.id, compRecord.id, "component_config", o++);
      const compInputs = inputs.filter((i) => i.component_id === compRecord?.id);
      for (const inp of compInputs) {
        await linkConfig(compRes.id, inp.id, `input:${inp.input_key}`, o++);
        const cfg = parseInputConfig(inp.description);
        if (cfg.threshold_version_id) await linkConfig(compRes.id, cfg.threshold_version_id, `threshold:${inp.input_key}`, o++);
      }
      // component confidence -> component
      const confRes = created[`${cr.code}_confidence`];
      if (confRes) await linkCalc(confRes.id, compRes.id, "component", 0);
    }

    // 13. Finalise.
    const resultCount = Object.keys(created).length;
    await S.CalculationRun.update(run.id, { status: "completed", run_completed_at: now(), result_count: resultCount });
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.COMPLETED, entityType: "CalculationRun", entityId: run.id, message: `Owner Score completed: ${overall.score} (${statusLabel}), ${compResults.length} components, ${supersededCount} superseded`, actorUserId });
    if (supersededCount) await publishEvent(base44, { orgId, siteId, eventKey: EVT.SUPERSEDED, entityType: "CalculationRun", entityId: run.id, message: `${supersededCount} prior score results superseded`, actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, afterState: JSON.stringify({ score: overall.score, status: statusLabel, confidence: overall.confidence, confidenceNumeric: overall.confidenceNumeric, components: compResults.map((c) => ({ code: c.code, score: round2(c.score), confidence: c.confidence, unavailable: c.unavailable })), trend: trendLabel, movement, superseded: supersededCount, methodology: version.id, cache_key: cacheKey }), reason: "owner score completion + threshold selection + weighting" });

    return {
      reused: false, calculation_run_id: run.id, cache_key: cacheKey,
      score: overall.score, status: statusLabel, confidence: overall.confidence, confidence_numeric: overall.confidenceNumeric,
      components: compResults.map((c) => ({ code: c.code, name: c.name, score: round2(c.score), confidence: c.confidence, confidence_numeric: c.confidenceNumeric, weight: c.weight, unavailable: c.unavailable, excluded: c.excluded, used: c.used.map((u) => u.input_key) })),
      trend: trendLabel, movement, superseded: supersededCount, result_count: resultCount, methodology_version_id: version.id,
    };
  } catch (err) {
    await S.CalculationRun.update(run.id, { status: "failed", run_completed_at: now() }).catch(() => {});
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.FAILED, entityType: "CalculationRun", entityId: run.id, message: `Owner Score failed: ${err.message}`, severity: "critical", actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, success: false, afterState: JSON.stringify({ error: err.message }), reason: "owner score failure" });
    throw err;
  }
}

// ---- invalidate / recalc --------------------------------------------------

export async function invalidateOwnerScores(base44, { orgId, siteId = null, periodStart, periodEnd, actorUserId = "system" }) {
  const S = base44.asServiceRole.entities;
  const cur = current(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" }))
    .filter((r) => (siteId ? r.site_id === siteId : !r.site_id) && r.period_start === periodStart && r.period_end === periodEnd);
  await publishEvent(base44, { orgId, siteId, eventKey: EVT.INVALIDATED, entityType: "CalculationRun", message: `${cur.length} owner score results marked stale`, severity: "warning", actorUserId });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationResult", actorUserId, afterState: JSON.stringify({ stale_ids: cur.map((r) => r.id), period: `${periodStart}_${periodEnd}` }), reason: "owner score invalidation (inputs changed)" });
  return { invalidated: cur.length };
}

// ---- reads ----------------------------------------------------------------

export async function getCurrentOwnerScore(base44, { orgId, siteId = null, periodStart = null, periodEnd = null }) {
  const S = base44.asServiceRole.entities;
  let results = current(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" }))
    .filter((r) => (siteId ? r.site_id === siteId : !r.site_id));
  if (periodStart) results = results.filter((r) => r.period_start >= periodStart);
  if (periodEnd) results = results.filter((r) => r.period_end <= periodEnd);
  const latest = results.filter((r) => r.entity_id === "owner_score").sort((a, b) => (b.period_end || "").localeCompare(a.period_end || ""))[0] || null;
  const comps = results.filter((r) => !r.entity_id.startsWith("owner_score_") && r.entity_id !== "owner_score" && !r.entity_id.endsWith("_confidence"));
  const conf = results.filter((r) => r.entity_id.endsWith("_confidence"));
  const companions = results.filter((r) => ["owner_score_confidence", "owner_score_status", "owner_score_movement", "owner_score_trend"].includes(r.entity_id));
  const runs = await S.CalculationRun.filter({ organisation_id: orgId, run_type: "owner_score" });
  const runById = {}; runs.forEach((r) => { runById[r.id] = r; });
  return {
    score: latest ? { value: latest.value / 100, confidence: latest.confidence, period: { start: latest.period_start, end: latest.period_end }, run: runById[latest.calculation_run_id] || null, label: latest.label } : null,
    components: comps.map((c) => ({ code: c.entity_id, name: c.label, score: c.value / 100, confidence: c.confidence })),
    companions: companions, confidence: conf, runs: runs.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")),
  };
}

export async function getOwnerScoreComponents(base44, { orgId, periodStart, periodEnd, siteId = null }) {
  const S = base44.asServiceRole.entities;
  const results = current(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" }))
    .filter((r) => (siteId ? r.site_id === siteId : !r.site_id) && r.period_start === periodStart && r.period_end === periodEnd
      && !r.entity_id.startsWith("owner_score_") && r.entity_id !== "owner_score" && !r.entity_id.endsWith("_confidence"));
  return results.map((r) => ({ code: r.entity_id, name: r.label, score: r.value / 100, confidence: r.confidence, methodology_component_id: r.methodology_component_id }));
}

export async function getOwnerScoreLineage(base44, { resultId, depth = 6 }) {
  const S = base44.asServiceRole.entities;
  const root = await S.CalculationResult.get(resultId);
  async function walk(resId, d) {
    const links = await S.CalculationLineage.filter({ calculation_result_id: resId });
    const out = [];
    for (const l of links) {
      const node = { link: l };
      if (l.input_type === "calculation_result" && l.input_calculation_result_id) {
        const input = await S.CalculationResult.get(l.input_calculation_result_id).catch(() => null);
        node.input = input;
        if (input && input.entity_type === "source_record") {
          node.source = await S.SourceRecord.get(input.entity_id).catch(() => null);
        } else if (input && d > 0 && input.result_type !== "financial_figure") {
          node.children = await walk(input.id, d - 1);
        }
      } else if (l.input_type === "configuration") {
        node.config_id = l.input_record_id; node.config_field = l.field_path;
      }
      out.push(node);
    }
    return out;
  }
  return { result: root, lineage: await walk(resultId, depth) };
}

export async function getOwnerScoreEngineStatus(base44, { orgId }) {
  const S = base44.asServiceRole.entities;
  const runs = (await S.CalculationRun.filter({ organisation_id: orgId, run_type: "owner_score" })).sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
  const all = await S.CalculationResult.filter({ organisation_id: orgId, result_type: "score_component" });
  const cur = current(all);
  const superseded = all.length - cur.length;
  const methods = await S.ScoreMethodologyVersion.filter({ organisation_id: orgId });
  const latestMethod = methods.filter((m) => m.status === "active").sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
  return {
    engine_version: ENGINE_VERSION,
    latest_run: runs[0] || null,
    total_runs: runs.length,
    current_results: cur.length,
    superseded_results: superseded,
    active_methodology: latestMethod,
    methodology_versions: methods.length,
  };
}

export async function validateOwnerScoreMethodology(base44, { orgId, methodologyVersionId }) {
  const S = base44.asServiceRole.entities;
  const [versions, components, inputs, kpiDefs, thresholds] = await Promise.all([
    S.ScoreMethodologyVersion.filter({ organisation_id: orgId }),
    S.ScoreMethodologyComponent.filter({ organisation_id: orgId }),
    S.ScoreMethodologyInput.filter({ organisation_id: orgId }),
    S.KPIDefinition.filter({ organisation_id: orgId, status: "active" }),
    S.KPIThresholdVersion.filter({ organisation_id: orgId }),
  ]);
  const version = methodologyVersionId ? versions.find((v) => v.id === methodologyVersionId) : versions.find((v) => v.status === "active");
  const result = validateMethodology(version, components, inputs, kpiDefs, thresholds);
  return { valid: result.valid, errors: result.errors, methodology_version: version };
}