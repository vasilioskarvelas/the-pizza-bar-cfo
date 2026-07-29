// Phase 08 — Forecast & Scenario RUNNER (I/O against base44.asServiceRole).
// Loads deterministic Phase 05/06 outputs, builds histories, and drives the pure
// forecastEngine. Caches results in ForecastResult for reproducibility. No AI.

import {
  FORECAST_ENGINE_VERSION, FORECAST_METRICS, forecastPeriods, forecastOwnerScore,
  forecastHash, extractMetric, compareScenarioSets, generateForecastAlerts,
} from "./forecastEngine.ts";
import { computeAll, KPI_FORMULAS, LINES } from "./financialEngine.ts";
import { parseMethodologyConfig, parseInputConfig } from "./ownerScoreEngine.ts";
import { publishEvent, writeAudit, now, today, listAll } from "./authEvents.ts";

// latest result per (entity_id, period) by created_date
function latestPerKey(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${r.result_type}|${r.entity_id}|${r.site_id || ""}|${r.period_start}|${r.period_end}`;
    const prev = map.get(key);
    if (!prev || String(r.created_date || "").localeCompare(String(prev.created_date || "")) > 0) map.set(key, r);
  }
  return [...map.values()];
}

const RAW_LINE_CODES = Object.keys(LINES).filter((c) => LINES[c].level === 0);

// Load everything the forecast needs. periodStart/periodEnd = baseline actual period.
export async function loadForecastInputs(base44, { orgId, siteId, periodStart, periodEnd }) {
  const S = base44.asServiceRole.entities;
  const scope = (r) => (siteId ? r.site_id === siteId : !r.site_id);
  const [allFig, allKpi, taxRates, versions, components, inputs, thresholds, excs, connRuns, sources, connectors, commitments, versions2] = await Promise.all([
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }, "-period_start", 1000),
    S.CalculationResult.filter({ organisation_id: orgId, result_type: "kpi" }, "-period_start", 1000),
    S.TaxRate.filter({ organisation_id: orgId }),
    S.ScoreMethodologyVersion.filter({ organisation_id: orgId }),
    S.ScoreMethodologyComponent.filter({ organisation_id: orgId }),
    S.ScoreMethodologyInput.filter({ organisation_id: orgId }),
    S.KPIThresholdVersion.filter({ organisation_id: orgId }),
    S.ReconciliationException.filter({ organisation_id: orgId, resolved: false }),
    S.ConnectorRun.filter({ organisation_id: orgId }),
    S.SourceRecord.filter({ organisation_id: orgId }),
    S.Connector.filter({ organisation_id: orgId }),
    S.ManualCommitment.filter({ organisation_id: orgId }),
    S.CommitmentVersion.filter({ organisation_id: orgId }),
  ]);

  // scope + dedupe
  const figs = latestPerKey(allFig).filter((r) => r.entity_type !== "source_record" && scope(r));
  const kpis = latestPerKey(allKpi).filter(scope);

  // determine baseline period
  const periods = [...new Set(figs.map((r) => r.period_start))].sort();
  let bp = periodStart, be = periodEnd;
  if (!bp || !be) {
    const last = periods[periods.length - 1];
    if (last) { bp = last; be = figs.find((r) => r.period_start === last).period_end; }
    else { bp = today().slice(0, 7) + "-01"; be = bp; }
  }

  // histories per raw code (chronological actuals)
  const byPeriod = new Map();
  for (const r of figs) {
    if (!byPeriod.has(r.period_start)) byPeriod.set(r.period_start, {});
    byPeriod.get(r.period_start)[r.entity_id] = Number(r.value) || 0;
  }
  const sortedPeriods = [...byPeriod.keys()].sort();
  const histories = {};
  for (const code of RAW_LINE_CODES) {
    histories[code] = sortedPeriods.map((p) => byPeriod.get(p)[code] || 0);
  }
  // also histories for derived forecast metrics (revenue, ebitda, etc.) via stored figures
  const figHistories = {};
  for (const code of [...new Set(figs.map((r) => r.entity_id))]) {
    figHistories[code] = figs.filter((r) => r.entity_id === code).sort((a, b) => a.period_start.localeCompare(b.period_start)).map((r) => Number(r.value) || 0);
  }

  // baseline raw (latest period)
  const baselinePeriod = sortedPeriods[sortedPeriods.length - 1] || bp;
  const baselineFig = byPeriod.get(baselinePeriod) || {};
  const baselineRaw = {};
  for (const code of RAW_LINE_CODES) baselineRaw[code] = baselineFig[code] || 0;

  // rates
  const gstRate = (taxRates.find((t) => t.tax_type === "GST" && (!t.effective_to || t.effective_to >= bp)) || {}).rate || 0.10;
  const companyTaxRate = (taxRates.find((t) => t.tax_type === "company_tax" && (!t.effective_to || t.effective_to >= bp)) || {}).rate || null;

  // opening cash + prior tcl/noncashCA (from baseline period figures)
  const openingCash = baselineFig.closing_cash || baselineFig.cash || 0;
  const priorTcl = (baselineFig.accounts_payable || 0) + (baselineFig.gst_payable || 0) + (baselineFig.payg_withholding || 0) + (baselineFig.superannuation_payable || 0) + (baselineFig.other_current_liabilities || 0);
  const priorNoncashCA = (baselineFig.accounts_receivable || 0) + (baselineFig.inventory || 0) + (baselineFig.other_current_assets || 0);

  // methodology (for owner score forecast)
  const version = (versions || []).filter((v) => v.status === "active" && (!v.effective_to || v.effective_to >= bp) && v.effective_from <= be)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
  let methodology = null;
  if (version) {
    const methodConfig = parseMethodologyConfig(version);
    const compRecords = (components || []).filter((c) => c.methodology_version_id === version.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const thrMap = new Map(); (thresholds || []).forEach((t) => thrMap.set(t.id, t));
    // derived inputs (carried from latest actual, deterministic)
    const sExcs = excs.filter(scope);
    const derived = new Map();
    const sFig = figs.filter((r) => r.period_start === bp && r.period_end === be);
    const calcConfidence = sFig.length ? sFig.filter((r) => r.confidence === "confirmed").length / sFig.length : 0;
    derived.set("dq_unresolved_exceptions", { present: true, value: sExcs.length, unit: "count", confidence: "confirmed", na: false });
    derived.set("dq_critical_exceptions", { present: true, value: sExcs.filter((e) => e.severity === "critical").length, unit: "count", confidence: "confirmed", na: false });
    derived.set("dq_failed_connector_runs", { present: true, value: connRuns.filter((r) => r.status === "failed" && scope(r)).length, unit: "count", confidence: "confirmed", na: false });
    derived.set("dq_calc_confidence", { present: true, value: Math.round(calcConfidence * 10000), unit: "ratio_4dp", confidence: "confirmed", na: false });
    derived.set("dq_lineage_completeness", { present: true, value: 10000, unit: "ratio_4dp", confidence: "confirmed", na: false });
    const presentSystems = new Set(sources.filter(scope).map((s) => s.source_system));
    const expectedCount = new Set(connectors.filter(scope).map((c) => c.source_system)).size || 1;
    derived.set("dq_source_completeness", { present: true, value: Math.round(Math.min(1, presentSystems.size / expectedCount) * 10000), unit: "ratio_4dp", confidence: "confirmed", na: false });
    derived.set("tax_gst_visible", { present: true, value: 1, unit: "count", confidence: "confirmed", na: false });
    derived.set("tax_payg_visible", { present: true, value: 1, unit: "count", confidence: "confirmed", na: false });
    derived.set("tax_super_visible", { present: true, value: 1, unit: "count", confidence: "confirmed", na: false });
    derived.set("tax_unresolved_exceptions", { present: true, value: sExcs.filter((e) => /gst|tax|payg|super/.test((e.entity_type || "").toLowerCase())).length, unit: "count", confidence: "confirmed", na: false });
    methodology = { version, components: compRecords, inputs: inputs || [], thresholds: thrMap, methodConfig, derived };
  }

  // assumptions
  const assumptions = {};
  const assumptionRecs = await S.ForecastAssumption.filter({ organisation_id: orgId, enabled: true });
  for (const a of assumptionRecs) assumptions[a.metric_code] = { growth_bps: a.growth_bps, method: a.method };

  // obligations sources
  const obSources = { commitments, versions: versions2, payruns: [], taxRates };

  return { orgId, siteId, baselinePeriod: bp, baselinePeriodEnd: be, histories, figHistories, baselineRaw, gstRate, companyTaxRate, openingCash, priorTcl, priorNoncashCA, methodology, assumptions, sortedPeriods, figs, kpis, obSources };
}

// Build the full forecast payload (baseline + optional scenario).
export async function buildForecast(base44, opts) {
  const { scenarioAdjustments = null, scenarioId = null, horizon = 12, actorUserId = "system", useCache = true } = opts;
  const inp = opts.inputs || await loadForecastInputs(base44, opts);

  const hash = forecastHash({
    orgId: inp.orgId, siteId: inp.siteId, scenarioId, baselinePeriod: inp.baselinePeriod, horizon,
    historiesKey: inp.sortedPeriods.join(","), adjustments: scenarioAdjustments || [],
    gstRate: inp.gstRate, taxRate: inp.companyTaxRate, assumptionsKey: JSON.stringify(inp.assumptions),
    methodologyVersionId: inp.methodology?.version?.id || null,
  });

  // cache
  if (useCache) {
    const S = base44.asServiceRole.entities;
    const cached = await S.ForecastResult.filter({ organisation_id: inp.orgId, forecast_hash: hash }, "-generated_at", 1);
    if (cached[0]) {
      try {
        const payload = JSON.parse(cached[0].payload);
        return { ...payload, cache: { reused: true, hash, forecast_result_id: cached[0].id } };
      } catch {}
    }
  }

  const periods = forecastPeriods({
    histories: inp.histories, baselineRaw: inp.baselineRaw, horizon,
    assumptions: inp.assumptions, adjustments: scenarioAdjustments,
    gstRate: inp.gstRate, companyTaxRate: inp.companyTaxRate,
    openingCash: inp.openingCash, priorTcl: inp.priorTcl, priorNoncashCA: inp.priorNoncashCA,
    baselinePeriodStart: inp.baselinePeriod,
  });

  // forecast owner score per period
  if (inp.methodology) {
    for (const p of periods) {
      p.owner_score = forecastOwnerScore(p.kpis, inp.methodology);
    }
  }

  // metric series (actuals + forecast)
  const series = FORECAST_METRICS.map((m) => {
    const actuals = (inp.figHistories[m.raw || m.code] || (m.kpi ? inp.kpis.filter((r) => r.entity_id === m.code).sort((a, b) => a.period_start.localeCompare(b.period_start)).map((r) => ({ period: r.period_start, value: Number(r.value), unit: r.unit, confidence: r.confidence })) : []))
      .map((v, i) => (typeof v === "number" ? { period: inp.sortedPeriods[i], value: v, unit: m.unit, confidence: "confirmed" } : v));
    const forecast = periods.map((p) => {
      const ex = extractMetric(p, m.code);
      return ex ? { period: p.period_start, value: ex.value, unit: ex.unit, confidence: ex.confidence, kind: "forecast" } : null;
    }).filter(Boolean);
    return { code: m.code, label: m.label, unit: m.unit, actuals, forecast };
  });

  const payload = {
    baseline_period: { start: inp.baselinePeriod, end: inp.baselinePeriodEnd },
    horizon_months: horizon,
    scenario_id: scenarioId,
    periods: periods.map((p) => ({
      period_start: p.period_start, period_end: p.period_end, period_index: p.period_index,
      metrics: FORECAST_METRICS.reduce((acc, m) => {
        const ex = extractMetric(p, m.code);
        acc[m.code] = ex ? { value: ex.value, unit: ex.unit, confidence: ex.confidence } : null;
        return acc;
      }, {}),
      owner_score: p.owner_score,
    })),
    series,
    generated_at: now(),
    engine_version: FORECAST_ENGINE_VERSION,
    cache: { reused: false, hash },
  };

  // persist cache
  if (useCache) {
    const S = base44.asServiceRole.entities;
    try {
      const created = await S.ForecastResult.create({
        organisation_id: inp.orgId, site_id: inp.siteId || null, scenario_id: scenarioId,
        horizon_months: horizon, baseline_period_start: inp.baselinePeriod, baseline_period_end: inp.baselinePeriodEnd,
        forecast_hash: hash, payload: JSON.stringify(payload), engine_version: FORECAST_ENGINE_VERSION, generated_at: now(),
      });
      payload.cache.forecast_result_id = created.id;
    } catch (e) { /* cache write failure non-fatal */ }
  }

  await writeAudit(base44, { orgId: inp.orgId, actionType: "read_sensitive", entityType: "ForecastResult", actorUserId, afterState: JSON.stringify({ hash, horizon, scenarioId }), reason: "forecast generation" });
  return payload;
}

// ---- Future obligations (deterministic) -------------------------------------
export async function buildObligations(base44, { orgId, siteId, forecast }) {
  const S = base44.asServiceRole.entities;
  const scope = (r) => (siteId ? r.site_id === siteId || !r.site_id : true);
  // Phase 14H (C3): PayRun has no organisation_id field, so scope payruns to this
  // org's own sites to close the cross-tenant payroll leak. (Note: PayRun.list()
  // remains unbounded — pagination/truncation hardening is tracked separately.)
  const orgSites = await S.Site.filter({ organisation_id: orgId });
  const orgSiteIds = new Set((orgSites || []).map((s) => s.id));
  const [commitments, versions, payruns] = await Promise.all([
    S.ManualCommitment.filter({ organisation_id: orgId }),
    S.CommitmentVersion.filter({ organisation_id: orgId }),
    // M3: page through PayRun completely (it has no organisation_id to query on,
    // so we scope by orgSiteIds below) instead of a single truncated .list().
    listAll(S.PayRun, {}, "-period_end", 500),
  ]);
  const todayStr = today();
  const out = [];

  // active commitments → scheduled obligations
  for (const c of commitments) {
    if (c.status !== "active") continue;
    if (siteId && c.site_id && c.site_id !== siteId) continue;
    const ver = versions.find((v) => v.commitment_id === c.id && v.version === c.current_version && (v.status === "active" || v.status === "approved"));
    if (!ver) continue;
    const amt = Math.round((Number(ver.amount) || 0) * 100);
    const type = mapCommitmentType(c.commitment_class);
    out.push({
      obligation_type: type, name: `${c.commitment_class} — ${c.name || c.commitment_class}`,
      due_date: c.due_date || todayStr, amount_cents: amt, frequency: c.frequency || "one_off",
      priority: c.commitment_class === "tax" || c.commitment_class === "loan_repayment" ? "high" : "medium",
      source_ref: c.id, forecast_cash_impact_cents: -amt, status: c.due_date && c.due_date < todayStr ? "overdue" : "scheduled",
    });
  }

  // payruns → payroll obligations (next expected)
  for (const p of payruns) {
    if (!orgSiteIds.has(p.site_id)) continue; // C3: only this org's sites
    if (siteId && p.site_id !== siteId) continue;
    out.push({
      obligation_type: "payroll", name: `Payroll — ${p.site_name || "site"}`,
      due_date: p.payment_date || p.period_end, amount_cents: Math.round((Number(p.net_pay) || 0) * 100),
      frequency: "fortnightly", priority: "high", source_ref: p.id,
      forecast_cash_impact_cents: -Math.round((Number(p.net_pay) || 0) * 100), status: "scheduled",
    });
  }

  // forecast GST obligations (quarterly BAS) from forecast net_gst_position
  if (forecast && forecast.periods) {
    const byQuarter = new Map();
    for (const p of forecast.periods) {
      const gst = p.metrics.net_gst_position?.value || 0;
      const month = Number(p.period_start.slice(5, 7));
      const year = p.period_start.slice(0, 4);
      const qNum = Math.floor((month - 1) / 3) + 1;
      const qKey = `${year}-Q${qNum}`;
      byQuarter.set(qKey, (byQuarter.get(qKey) || 0) + gst);
    }
    for (const [qKey, amt] of [...byQuarter.entries()].sort()) {
      const qNum = Number(qKey.slice(-1));
      const year = qKey.slice(0, 4);
      const qEndMonth = qNum * 3;
      const dueDate = `${year}-${String(qEndMonth).padStart(2, "0")}-28`;
      out.push({
        obligation_type: "gst", name: `BAS — GST ${qKey}`,
        due_date: dueDate, amount_cents: amt, frequency: "quarterly",
        priority: amt > 100000 ? "high" : "medium", source_ref: `forecast:${qKey}`,
        forecast_cash_impact_cents: -amt, status: "scheduled",
      });
    }
  }

  // tax provision from forecast net profit (quarterly PAYG instalments)
  if (forecast && forecast.periods) {
    const profitSum = forecast.periods.reduce((s, p) => s + (p.metrics.net_profit?.value || 0), 0);
    const taxProvision = Math.round(profitSum * 0.25);
    if (taxProvision > 0) {
      out.push({
        obligation_type: "tax", name: "Income tax provision (forecast)",
        due_date: forecast.periods[forecast.periods.length - 1]?.period_end || todayStr,
        amount_cents: taxProvision, frequency: "quarterly", priority: "medium", source_ref: "forecast:tax",
        forecast_cash_impact_cents: -taxProvision, status: "scheduled",
      });
    }
  }

  return out.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
}

function mapCommitmentType(cls) {
  const map = { rent: "lease", utilities: "subscription", insurance: "insurance", supplier_payment: "manual_commitment", wages: "payroll", tax: "tax", loan_repayment: "loan_repayment", capital: "capital", other: "manual_commitment" };
  return map[cls] || "manual_commitment";
}

// ---- Invalidate forecast cache ---------------------------------------------
export async function invalidateForecastCache(base44, { orgId, actorUserId = "system" }) {
  const S = base44.asServiceRole.entities;
  const cached = await S.ForecastResult.filter({ organisation_id: orgId });
  let n = 0;
  for (const c of cached) { await S.ForecastResult.delete(c.id).catch(() => {}); n++; }
  await publishEvent(base44, { orgId, eventKey: "forecast.cache.invalidated", entityType: "ForecastResult", message: `${n} forecast cache record(s) cleared`, severity: "info", actorUserId });
  await writeAudit(base44, { orgId, actionType: "delete", entityType: "ForecastResult", actorUserId, afterState: JSON.stringify({ cleared: n }), reason: "forecast cache invalidation" });
  return { invalidated: n };
}