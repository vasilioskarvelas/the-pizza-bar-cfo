// Phase 06 — Deterministic Owner Score calculation engine (PURE, no I/O).
// Converts verified Phase-05 KPIs + financial/tax figures into a transparent,
// versioned, fully-traceable 0-100 business-health score. No AI anywhere.
//
// Locked-ERD field conventions (NO schema change — documented conventions only):
//  - ScoreMethodologyVersion: name->label, version->version, effective date->effective_from,
//    expiry->effective_to, status->status, org scope->organisation_id, description->description.
//    ENGINE VERSION + APPROVAL STATE are not separate fields: engine_version is captured on
//    CalculationRun.engine_version at run time; approval state == status:"active".
//    Methodology-level config (org aggregation, site weighting, status bands, confidence
//    factors, unavailable treatment) is stored as JSON in ScoreMethodologyVersion.description.
//  - ScoreMethodologyComponent: code->code, name->name, weight->weight, calculation order->
//    sort_order, component category->component_type. MIN/MAX SCORE are a documented fixed
//    convention (0..100) for every component; ACTIVE STATE is derived (a component is active
//    iff its methodology version is active). UNAVAILABLE components are simply excluded from
//    the methodology (Operational Stability has no operational inputs yet -> excluded).
//  - ScoreMethodologyInput: component->component_id, KPI->kpi_definition_id, code->input_key.
//    input weight, direction, threshold version, required/optional, missing-data treatment and
//    confidence adjustment are NOT separate fields -> encoded as JSON in `description`
//    (parseInputConfig). Derived inputs (data-quality / tax-visibility) set kpi_definition_id
//    null and use an input_key prefixed dq_ / tax_ / op_; the runner resolves their values.
//  - KPIThresholdVersion: provides 3 numeric points (target, warning, critical) -> 4 evaluation
//    bands. Mapped to 4 of the 5 labels (excellent/good/watch/critical); "poor" is reserved for a
//    future 4-threshold schema extension and is not currently emitted (documented convention).
//    Band->score mapping is read from the input config (band_scores) -> config-driven, not hardcoded.
//  - CalculationRun.run_type "owner_score" (existing enum). CalculationResult.result_type
//    "score_component" (existing enum). CalculationLineage.input_type "configuration" (existing
//    enum) links methodology/threshold config into the score lineage.
//
// Score range: 0..100. Component weights total exactly 100. Money/percent/ratio comparisons are
// done in the native integer minor units of each KPI result (bps / ratio_4dp / cents / days /
// weeks) so no binary float aggregation occurs. The final overall score is rounded half-up to 2dp
// only at the documented final stage; component scores keep full precision internally.

export const ENGINE_VERSION = "owner-score-engine-1.0";

export const DEFAULT_CONFIDENCE_FACTORS = { confirmed: 1.0, estimated: 0.8, forecast: 0.6 };
export const DEFAULT_BAND_SCORES = { excellent: 100, good: 80, watch: 60, poor: 35, critical: 0 };
export const DEFAULT_STATUS_BANDS = [
  { min: 85, label: "Strong" },
  { min: 70, label: "Stable" },
  { min: 50, label: "Watch" },
  { min: 30, label: "At Risk" },
  { min: 0, label: "Critical" },
];
export const DEFAULT_NEUTRAL_SCORE = 60;
export const DEFAULT_UNAVAILABLE_TREATMENT = "score_zero"; // score_zero | reweight | fail_overall

// ---- config parsing --------------------------------------------------------

export function parseInputConfig(description) {
  let cfg = {};
  if (description) {
    try { cfg = JSON.parse(description); } catch { cfg = {}; }
  }
  return {
    weight: Number(cfg.weight) || 0,
    direction: cfg.direction || null,            // higher_is_better|lower_is_better|target_range|binary|absolute_distance|presence
    threshold_version_id: cfg.threshold_version_id || null,
    required: cfg.required !== false,            // default required
    missing_data: cfg.missing_data || "score_zero", // exclude_reweight|score_zero|neutral|fail_component|unavailable
    neutral_score: cfg.neutral_score != null ? Number(cfg.neutral_score) : DEFAULT_NEUTRAL_SCORE,
    confidence_factor: cfg.confidence_factor != null ? Number(cfg.confidence_factor) : null,
    band_scores: cfg.band_scores || null,
    threshold: cfg.threshold || null,                // inline {target, warning, critical} for derived inputs
    description: cfg.description || null,
  };
}

export function parseMethodologyConfig(version) {
  let cfg = {};
  if (version?.description) {
    try { cfg = JSON.parse(version.description); } catch { cfg = {}; }
  }
  return {
    org_aggregation: cfg.org_aggregation || "consolidated",   // consolidated | site_weighted
    site_weighting: cfg.site_weighting || "equal",            // revenue | ebitda | site_weight | equal
    status_bands: cfg.status_bands || DEFAULT_STATUS_BANDS,
    confidence_factors: cfg.confidence_factors || DEFAULT_CONFIDENCE_FACTORS,
    unavailable_treatment: cfg.unavailable_treatment || DEFAULT_UNAVAILABLE_TREATMENT,
    is_test: cfg.is_test !== false,
  };
}

// ---- methodology validation ----------------------------------------------

// Returns { valid: boolean, errors: string[] }.
export function validateMethodology(version, components, inputs, kpiDefs, thresholds) {
  const errors = [];
  if (!version) { errors.push("Methodology version missing."); return { valid: false, errors }; }
  if (!version.effective_from) errors.push("Methodology effective_from is required.");
  if (version.effective_to && version.effective_to < version.effective_from)
    errors.push("Methodology effective_to precedes effective_from (invalid dates).");
  if (version.status !== "active") errors.push(`Methodology status is '${version.status}', not 'active'.`);

  const activeComps = (components || []).filter((c) => c.methodology_version_id === version.id);
  if (activeComps.length === 0) errors.push("Methodology has no components.");

  // 1. Component weights total exactly 100.
  const weightSum = activeComps.reduce((s, c) => s + round2(Number(c.weight) || 0), 0);
  if (Math.abs(weightSum - 100) > 0.001) errors.push(`Component weights total ${weightSum}, must total exactly 100.`);

  const kpiById = {}; (kpiDefs || []).forEach((k) => { kpiById[k.id] = k; });
  const kpiByCode = {}; (kpiDefs || []).forEach((k) => { kpiByCode[k.code] = k; });
  const thrById = {}; (thresholds || []).forEach((t) => { thrById[t.id] = t; });

  // 2. Each active component has valid inputs.
  for (const c of activeComps) {
    const compInputs = (inputs || []).filter((i) => i.component_id === c.id);
    if (compInputs.length === 0) errors.push(`Component '${c.code}' has no inputs.`);
    for (const inp of compInputs) {
      const cfg = parseInputConfig(inp.description);
      if (cfg.weight <= 0) errors.push(`Input '${inp.input_key}' (${c.code}) has non-positive weight.`);
      // input references a missing KPI (only when kpi_definition_id is set)
      if (inp.kpi_definition_id && !kpiById[inp.kpi_definition_id]) {
        errors.push(`Input '${inp.input_key}' (${c.code}) references a missing KPIDefinition.`);
      }
      // derived inputs (no kpi_definition_id) are allowed only with a recognised prefix
      if (!inp.kpi_definition_id) {
        const key = inp.input_key || "";
        if (!/^(dq_|tax_|op_)/.test(key)) {
          errors.push(`Input '${key}' (${c.code}) has no kpi_definition_id and is not a recognised derived input.`);
        }
      }
      // threshold ordering checks
      const dir = cfg.direction || kpiById[inp.kpi_definition_id]?.direction;
      const thr = cfg.threshold_version_id ? thrById[cfg.threshold_version_id] : (cfg.threshold || null);
      if (thr && dir) {
        const t = thr.target, w = thr.warning, cr = thr.critical;
        if (t == null || w == null || cr == null) {
          errors.push(`Threshold gap for '${inp.input_key}': target/warning/critical must all be set (got ${t},${w},${cr}).`);
        } else if (dir === "higher_is_better") {
          if (!(cr <= w && w <= t)) errors.push(`Threshold overlap/gap for '${inp.input_key}' (higher_is_better): critical<=warning<=target required (got ${cr},${w},${t}).`);
        } else if (dir === "lower_is_better") {
          if (!(t <= w && w <= cr)) errors.push(`Threshold overlap/gap for '${inp.input_key}' (lower_is_better): target<=warning<=critical required (got ${t},${w},${cr}).`);
        } else if (dir === "target_range") {
          if (!(0 <= w && w <= cr)) errors.push(`Threshold overlap/gap for '${inp.input_key}' (target_range): 0<=warning<=critical required (got ${w},${cr}).`);
        }
      }
    }
  }

  // 3. Circular dependency: components have no inter-component dependencies by construction
  //    (inputs reference KPIs / derived metrics only, never other component results).
  // Nothing to check beyond the above; documented as structurally impossible.

  return { valid: errors.length === 0, errors };
}

// ---- threshold evaluation -------------------------------------------------

export function evaluateKpi(resolved, direction, threshold, config) {
  const band = { ...DEFAULT_BAND_SCORES, ...(config.band_scores || {}) };
  // resolved: { present, value, unit, confidence, na }
  // Missing / N/A -> caller handles missing-data; here we only score present values.
  if (!resolved || !resolved.present || resolved.na) {
    return { score: null, band: "missing" };
  }
  const v = Number(resolved.value) || 0;
  const t = threshold ? Number(threshold.target) : null;
  const w = threshold ? Number(threshold.warning) : null;
  const cr = threshold ? Number(threshold.critical) : null;

  const interp = (lo, hi, loScore, hiScore) => {
    if (hi === lo) return hiScore;
    const frac = (v - lo) / (hi - lo);
    return loScore + frac * (hiScore - loScore);
  };
  const clamp = (x) => Math.max(0, Math.min(100, x));

  switch (direction) {
    case "presence": {
      // recorded & visible (confirmed/estimated) -> 100; recorded but forecast -> 60; absent -> 0
      if (resolved.confidence === "confirmed" || resolved.confidence === "estimated") return { score: band.excellent, band: "excellent" };
      return { score: band.watch, band: "watch" };
    }
    case "binary": {
      if (t == null) return { score: band.excellent, band: "excellent" };
      return v >= t ? { score: band.excellent, band: "excellent" } : { score: band.critical, band: "critical" };
    }
    case "higher_is_better": {
      if (t == null || w == null || cr == null) return { score: band.watch, band: "watch" };
      if (v >= t) return { score: band.excellent, band: "excellent" };
      if (v >= w) return { score: clamp(interp(w, t, band.good, band.excellent)), band: "good" };
      if (v >= cr) return { score: clamp(interp(cr, w, band.watch, band.good)), band: "watch" };
      return { score: band.critical, band: "critical" };
    }
    case "lower_is_better": {
      if (t == null || w == null || cr == null) return { score: band.watch, band: "watch" };
      if (v <= t) return { score: band.excellent, band: "excellent" };
      if (v <= w) return { score: clamp(interp(t, w, band.excellent, band.good)), band: "good" };
      if (v <= cr) return { score: clamp(interp(w, cr, band.good, band.watch)), band: "watch" };
      return { score: band.critical, band: "critical" };
    }
    case "target_range": {
      if (t == null || w == null || cr == null) return { score: band.watch, band: "watch" };
      const d = Math.abs(v - t);
      if (d <= w) { const frac = w > 0 ? d / w : 0; return { score: clamp(band.excellent + frac * (band.good - band.excellent)), band: "excellent" }; }
      if (d <= cr) { const frac = (cr - w) > 0 ? (d - w) / (cr - w) : 0; return { score: clamp(band.good + frac * (band.watch - band.good)), band: "watch" }; }
      return { score: band.critical, band: "critical" };
    }
    case "absolute_distance": {
      if (t == null || w == null || !w) return { score: band.watch, band: "watch" };
      const d = Math.abs(v - t);
      return { score: clamp(band.excellent - (d / w) * band.excellent), band: d <= w ? "good" : "critical" };
    }
    default:
      return { score: null, band: "unknown_direction" };
  }
}

// ---- component + overall calculation --------------------------------------

// resolved: Map input_key -> { present, value, unit, confidence, na, result_id }
// compInputs: ScoreMethodologyInput[] for this component
// thresholds: Map threshold_version_id -> threshold record
// factors: { confirmed, estimated, forecast }
export function computeComponent(component, compInputs, resolved, thresholds, factors) {
  const used = []; const excluded = []; let missingRequired = false; let allExcluded = true;
  let num = 0, den = 0, weightNominal = 0, weightExcluded = 0;
  const confTiers = [];

  for (const inp of compInputs) {
    const cfg = parseInputConfig(inp.description);
    const r = resolved.get(inp.input_key);
    const present = r && r.present && !r.na;
    weightNominal += cfg.weight;

    if (!present) {
      // missing-data treatment
      if (cfg.required) missingRequired = true;
      switch (cfg.missing_data) {
        case "fail_component":
          return { score: 0, confidence: "forecast", confidenceNumeric: 0, used: [], excluded: [inp.input_key], unavailable: false, missingRequired: true, failed: true };
        case "unavailable":
          return { score: 0, confidence: "forecast", confidenceNumeric: 0, used: [], excluded: [inp.input_key], unavailable: true, missingRequired: cfg.required };
        case "score_zero":
          {
            const f = factorFor("forecast", factors, cfg);
            num += 0 * cfg.weight * f; den += cfg.weight * f; allExcluded = false;
            excluded.push(inp.input_key); confTiers.push("forecast");
          }
          break;
        case "neutral":
          {
            const f = factorFor("forecast", factors, cfg);
            num += cfg.neutral_score * cfg.weight * f; den += cfg.weight * f; allExcluded = false;
            excluded.push(inp.input_key); confTiers.push("forecast");
          }
          break;
        case "exclude_reweight":
        default:
          weightExcluded += cfg.weight;
          excluded.push(inp.input_key);
          break;
      }
      continue;
    }

    // present -> evaluate threshold
    const dir = cfg.direction || null;
    const thr = cfg.threshold_version_id ? thresholds.get(cfg.threshold_version_id) : (cfg.threshold || null);
    const ev = evaluateKpi(r, dir, thr, cfg);
    if (ev.score == null) {
      // unresolved direction/threshold -> treat as neutral
      const f = factorFor(r.confidence, factors, cfg);
      num += cfg.neutral_score * cfg.weight * f; den += cfg.weight * f; allExcluded = false;
      used.push({ input_key: inp.input_key, score: cfg.neutral_score, band: ev.band, confidence: r.confidence, weight: cfg.weight, result_id: r.result_id });
      confTiers.push(r.confidence);
      continue;
    }
    const f = factorFor(r.confidence, factors, cfg);
    num += ev.score * cfg.weight * f; den += cfg.weight * f; allExcluded = false;
    used.push({ input_key: inp.input_key, score: ev.score, band: ev.band, confidence: r.confidence, weight: cfg.weight, result_id: r.result_id });
    confTiers.push(r.confidence);
  }

  if (allExcluded || den === 0) {
    return { score: 0, confidence: "forecast", confidenceNumeric: 0, used, excluded, unavailable: true, missingRequired };
  }

  const score = num / den;
  const confidenceNumeric = den / (weightNominal - weightExcluded > 0 ? (weightNominal - weightExcluded) : weightNominal);
  const confidence = worstConfidence(confTiers);
  return { score, confidence, confidenceNumeric: clampRatio(confidenceNumeric), used, excluded, unavailable: false, missingRequired };
}

function factorFor(confidence, factors, cfg) {
  if (cfg.confidence_factor != null) return Number(cfg.confidence_factor);
  const f = factors || DEFAULT_CONFIDENCE_FACTORS;
  return f[confidence] != null ? f[confidence] : 0.6;
}
function clampRatio(x) { return Math.max(0, Math.min(1, x)); }
function worstConfidence(tiers) {
  if (!tiers.length) return "forecast";
  const rank = { confirmed: 3, estimated: 2, forecast: 1 };
  let min = 3;
  for (const t of tiers) { const r = rank[t] ?? 1; if (r < min) min = r; }
  return min >= 3 ? "confirmed" : min === 2 ? "estimated" : "forecast";
}
export function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

// compResults: [{ code, score, confidence, confidenceNumeric, weight, unavailable, missingRequired }]
export function computeOverall(compResults, methodConfig) {
  const available = compResults.filter((c) => !c.unavailable);
  const unavailable = compResults.filter((c) => c.unavailable);
  const treatment = methodConfig.unavailable_treatment || DEFAULT_UNAVAILABLE_TREATMENT;

  if (unavailable.length && treatment === "fail_overall") {
    return { score: null, confidence: "forecast", confidenceNumeric: 0, unavailable: true, unavailableComponents: unavailable.map((c) => c.code) };
  }

  let num = 0, den = 0, cNum = 0, cDen = 0;
  const confTiers = [];
  for (const c of compResults) {
    if (c.unavailable) {
      if (treatment === "score_zero") { num += 0 * c.weight; den += c.weight; confTiers.push("forecast"); }
      // reweight: skip (denominator only counts available)
    } else {
      num += c.score * c.weight; den += c.weight;
      cNum += c.confidenceNumeric * c.weight; cDen += c.weight;
      confTiers.push(c.confidence);
    }
  }
  if (den === 0) return { score: null, confidence: "forecast", confidenceNumeric: 0, unavailable: true, unavailableComponents: compResults.map((c) => c.code) };
  const score = round2(num / den);
  const confidenceNumeric = cDen > 0 ? clampRatio(cNum / cDen) : 0;
  const confidence = worstConfidence(confTiers);
  return { score, confidence, confidenceNumeric, unavailable: false, unavailableComponents: unavailable.map((c) => c.code) };
}

export function statusBand(score, bands) {
  const bs = bands || DEFAULT_STATUS_BANDS;
  for (const b of bs) { if (score >= b.min) return b.label; }
  return bs[bs.length - 1].label;
}

// ---- site aggregation -----------------------------------------------------

// siteScores: [{ siteId, score, confidenceNumeric, weight }]  (weight from revenue/ebitda/site_weight/equal)
export function aggregateSiteScores(siteScores, methodConfig) {
  if (!siteScores.length) return { score: null, confidence: "forecast", confidenceNumeric: 0, coverage: 0 };
  let num = 0, den = 0, cNum = 0;
  for (const s of siteScores) { num += s.score * s.weight; den += s.weight; cNum += s.confidenceNumeric * s.weight; }
  if (den === 0) return { score: null, confidence: "forecast", confidenceNumeric: 0, coverage: 0 };
  return { score: round2(num / den), confidence: "estimated", confidenceNumeric: clampRatio(cNum / den), coverage: siteScores.length };
}

// ---- deterministic cache key --------------------------------------------

export function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h = h & 0xffffffff; }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildOwnerScoreCacheKey(parts) {
  const kpiKey = (parts.kpiResults || []).map((k) => `${k.id}:${k.value}:${k.confidence}`).sort().join("|");
  const derivedKey = Object.entries(parts.derived || {}).map(([k, v]) => `${k}=${v}`).sort().join("|");
  const compKey = (parts.components || []).map((c) => `${c.id}:${c.weight}:${c.updated_date || ""}`).sort().join("|");
  const inputKey = (parts.inputs || []).map((i) => `${i.id}:${i.input_key}:${i.updated_date || ""}`).sort().join("|");
  const thrKey = (parts.thresholds || []).map((t) => `${t.id}:${t.target}:${t.warning}:${t.critical}:${t.updated_date || ""}`).sort().join("|");
  const blob = `${parts.orgId}|${parts.siteId || "org"}|${parts.period}|${parts.engineVersion}|${parts.methodologyVersionId}|${kpiKey}|${derivedKey}|${compKey}|${inputKey}|${thrKey}`;
  return djb2(blob);
}