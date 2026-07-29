// Phase 05 — Financial engine RUNNER (I/O against base44.asServiceRole).
// Imported by every Phase 05 backend function. Pure calc lives in financialEngine.ts.
// All privileged writes happen here (service role). No financial figures exposed
// to non-admin callers — the function wrappers enforce admin auth before calling.

import {
  ENGINE_VERSION, toCents, classifyAccount, gstComponentInclusive, worstConfidence,
  computeAll, KPI_FORMULAS, LINES, buildCacheKey,
} from "./financialEngine.ts";
import { today, now, publishEvent, writeAudit } from "./authEvents.ts";

const EVT = {
  STARTED: "calculation.started",
  COMPLETED: "calculation.completed",
  FAILED: "calculation.failed",
  INVALIDATED: "calculation.invalidated",
  RECALCULATED: "calculation.recalculated",
  SUPERSEDED: "calculation.result.superseded",
  CACHE_REUSED: "calculation.cache.reused",
  TAX_COMPLETED: "tax.calculation.completed",
  BALANCE_FAIL: "balance_sheet.out_of_balance",
};

const GROUP_ETYPE = { pl: "pl_line", bs: "balance_sheet_line", cf: "cash_flow_line", tax: "tax_line" };
const BALANCE_TOLERANCE_CENTS = 100; // $1.00

// commitment_class -> { plLine, bsLine }
const COMMITMENT_ROUTE = {
  rent: { pl: "operating_expenses", bs: "accounts_payable" },
  utilities: { pl: "operating_expenses", bs: "accounts_payable" },
  insurance: { pl: "operating_expenses", bs: "accounts_payable" },
  supplier_payment: { pl: "operating_expenses", bs: "accounts_payable" },
  other: { pl: "operating_expenses", bs: "accounts_payable" },
  wages: { pl: "labour_cost", bs: "other_current_liabilities" },
  tax: { pl: "tax_expense", bs: "payg_withholding" },
  loan_repayment: { pl: null, bs: "long_term_debt", cf: "financing_cash_flow", sign: -1 },
  capital: { pl: null, bs: "fixed_assets", cf: "investing_cash_flow", sign: -1 },
};

// ---- helpers ---------------------------------------------------------------

function labelAccount(label) { return (label || "").split("|")[0] || "UNMAPPED"; }
function labelGst(label) { return (label || "").split("|")[1] || "GST_FREE"; }

// "Current" = the latest result per (entity_type, entity_id, site, period) by created_date.
// Supersession (supersedes_result_id) still records history, but because records are
// immutable (update/delete denied) and supersession is 1:1, prior runs could leave
// duplicate current results. "Latest per key" is deterministic and duplicate-proof.
function latestPerKey(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${r.entity_type}|${r.entity_id}|${r.site_id || ""}|${r.period_start}|${r.period_end}`;
    const prev = map.get(key);
    if (!prev || String(r.created_date || "").localeCompare(String(prev.created_date || "")) > 0) map.set(key, r);
  }
  return [...map.values()];
}
const notSuperseded = latestPerKey;

// ---- core run --------------------------------------------------------------

export async function runEngine(base44, opts) {
  const S = base44.asServiceRole.entities;
  const { orgId, siteId = null, periodStart, periodEnd, actorUserId = "system", triggeredBy = "manual", force = false } = opts;

  // 1. Load canonical txns (not superseded) in period & scope.
  const allCanon = await S.CalculationResult.filter({
    organisation_id: orgId, result_type: "financial_figure", entity_type: "source_record",
  });
  let canon = notSuperseded(allCanon).filter(
    (t) => t.period_start >= periodStart && t.period_start <= periodEnd &&
      (siteId ? t.site_id === siteId : true)
  );

  // 2. Load config.
  const [accounts, mappings, taxRates, methodologies, commitments, versions, kpiDefs, org] = await Promise.all([
    S.Account.filter({ organisation_id: orgId }),
    S.AccountMapping.filter({ organisation_id: orgId }),
    S.TaxRate.filter({ organisation_id: orgId }),
    S.ScoreMethodologyVersion.filter({ organisation_id: orgId }),
    S.ManualCommitment.filter({ organisation_id: orgId }),
    S.CommitmentVersion.filter({ organisation_id: orgId }),
    S.KPIDefinition.filter({ organisation_id: orgId, status: "active" }),
    S.Organisation.get(orgId).catch(() => null),
  ]);
  const acctByCode = {}; accounts.forEach((a) => { acctByCode[a.code] = a; });
  const gstRate = (taxRates.find((t) => t.tax_type === "GST" && (!t.effective_to || t.effective_to >= periodStart)) || {}).rate || 0.10;
  const companyTaxRate = (taxRates.find((t) => t.tax_type === "company_tax" && (!t.effective_to || t.effective_to >= periodStart)) || {}).rate || null;
  const methodology = methodologies.filter((m) => m.status === "active" && (!m.effective_to || m.effective_to >= periodStart))
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;

  // 3. Exclude canonical txns with unresolved CRITICAL reconciliation exceptions.
  const excs = await S.ReconciliationException.filter({ organisation_id: orgId, resolved: false });
  const excludedSrc = new Set(excs.filter((e) => e.severity === "critical" && e.source_record_id).map((e) => e.source_record_id));
  const excludedTxns = canon.filter((t) => excludedSrc.has(t.entity_id));
  canon = canon.filter((t) => !excludedSrc.has(t.entity_id));

  // 4. Cache key.
  const cacheKey = buildCacheKey({
    orgId, siteId, period: `${periodStart}_${periodEnd}`, engineVersion: ENGINE_VERSION,
    methodologyVersionId: methodology?.id || null,
    txns: canon, configs: { accounts, mappings, taxRates, commitments },
  });

  // 5. Cache reuse check (whole-run).
  if (!force) {
    const priorRuns = await S.CalculationRun.filter({
      organisation_id: orgId, run_type: "financial_figure", engine_version: ENGINE_VERSION,
    });
    const match = notSuperseded(priorRuns) // (runs aren't superseded, but keep filter consistent)
      .filter((r) => r.input_snapshot_hash === cacheKey && r.period_start === periodStart && r.period_end === periodEnd &&
        (r.status === "completed" || r.status === "completed_with_errors"))
      .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""))[0];
    if (match) {
      await publishEvent(base44, { orgId, eventKey: EVT.CACHE_REUSED, entityType: "CalculationRun", entityId: match.id, message: `Calculation cache reused (key ${cacheKey})`, actorUserId });
      await writeAudit(base44, { orgId, actionType: "read_sensitive", entityType: "CalculationRun", entityId: match.id, actorUserId, afterState: JSON.stringify({ reused: true, cache_key: cacheKey }), reason: "cache reuse" });
      return { reused: true, calculation_run_id: match.id, result_count: match.result_count, cache_key: cacheKey };
    }
  }

  // 6. Create the run.
  const run = await S.CalculationRun.create({
    organisation_id: orgId, site_id: siteId, run_type: "financial_figure",
    methodology_version_id: methodology?.id || null, period_start: periodStart, period_end: periodEnd,
    engine_version: ENGINE_VERSION, input_snapshot_hash: cacheKey, run_started_at: now(),
    status: "running", triggered_by: actorUserId,
  });
  await publishEvent(base44, { orgId, siteId, eventKey: EVT.STARTED, entityType: "CalculationRun", entityId: run.id, message: `Financial calculation started (${triggeredBy}) for ${periodStart}..${periodEnd}`, actorUserId });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, afterState: JSON.stringify({ period: `${periodStart}_${periodEnd}`, site: siteId || "org", methodology: methodology?.id || null, cache_key: cacheKey }), reason: `calculation trigger (${triggeredBy})` });

  try {
    // 7. Classify canonical txns -> raw lines + GST.
    const raw = {}; // lineCode -> { cents, confidence, txnIds:[], confs:[] }
    const ensure = (code) => { if (!raw[code]) raw[code] = { cents: 0, confs: [], txnIds: [] }; return raw[code]; };
    let gstCollected = 0, gstPaid = 0, gstFreeSales = 0, gstFreePurchases = 0, inputTaxed = 0;

    for (const t of canon) {
      const acct = acctByCode[labelAccount(t.label)] || null;
      const cls = classifyAccount(acct?.account_type, acct?.class);
      if (!cls.line) continue;
      const cents = toCents(t.value);
      const r = ensure(cls.line);
      r.cents += cents; r.confs.push(t.confidence); r.txnIds.push(t.id);
      // route financing/investing cash-flow proxies from equity/debt/asset movements
      if (cls.line === "equity" || cls.line === "long_term_debt") { const f = ensure("financing_cash_flow"); f.cents += cents; f.confs.push("estimated"); }
      if (cls.line === "fixed_assets") { const inv = ensure("investing_cash_flow"); inv.cents += -cents; inv.confs.push("estimated"); }
      // GST: gst-account legs carry the GST directly (collected/output or input credit).
      // Revenue/expense legs are ex-GST (final P&L amount); their treatment only
      // classifies GST-free vs taxable sales/purchases. No GST is re-extracted here.
      const g = labelGst(t.label);
      if (cls.line === "gst_payable") {
        if (cents > 0) gstCollected += cents;
        else gstPaid += -cents;
      } else if (g === "GST_FREE") {
        if (cls.line === "revenue") gstFreeSales += Math.abs(cents);
        else if (["cogs", "labour_cost", "operating_expenses"].includes(cls.line)) gstFreePurchases += Math.abs(cents);
      } else if (g === "INPUT_TAXED") {
        inputTaxed += Math.abs(cents);
      }
    }
    // raw confidence per line = worst of contributing txn confidences (forecast if none)
    for (const code of Object.keys(raw)) raw[code].confidence = raw[code].confs.length ? worstConfidence(raw[code].confs) : "forecast";

    // 8. Include active approved commitments (exclude pending/cancelled).
    const activeCommitments = [];
    const includedCommitmentIds = [];
    for (const c of commitments) {
      if (c.status !== "active") continue; // exclude unapproved
      if (siteId && c.site_id && c.site_id !== siteId) continue;
      if (c.scope === "shared" && siteId && c.site_id && c.site_id !== siteId) continue;
      if (c.due_date && (c.due_date < periodStart || c.due_date > periodEnd)) continue;
      const ver = versions.find((v) => v.commitment_id === c.id && v.version === c.current_version && (v.status === "active" || v.status === "approved"));
      if (!ver) continue; // no approved version -> excluded
      activeCommitments.push({ c, ver });
      includedCommitmentIds.push(c.id);
      const route = COMMITMENT_ROUTE[c.commitment_class] || COMMITMENT_ROUTE.other;
      const amtCents = toCents(ver.amount);
      const conf = ver.confidence || c.confidence || "estimated";
      if (route.pl) { const r = ensure(route.pl); r.cents += amtCents; r.confs.push(conf); }
      if (route.bs) { const r = ensure(route.bs); r.cents += amtCents; r.confs.push(conf); }
      if (route.cf) { const r = ensure(route.cf); r.cents += amtCents * (route.sign || 1); r.confs.push(conf); }
    }
    // re-aggregate confidence after commitments
    for (const code of Object.keys(raw)) if (raw[code].confs.length) raw[code].confidence = worstConfidence(raw[code].confs);

    // Seed tax raw lines + gst_payable (net) + opening_cash.
    ensure("gst_collected").cents += gstCollected; raw["gst_collected"].confs.push("confirmed");
    ensure("gst_paid").cents += gstPaid; raw["gst_paid"].confs.push("confirmed");
    ensure("gst_free_sales").cents += gstFreeSales; raw["gst_free_sales"].confs.push("confirmed");
    ensure("gst_free_purchases").cents += gstFreePurchases; raw["gst_free_purchases"].confs.push("confirmed");
    ensure("input_taxed").cents += inputTaxed; raw["input_taxed"].confs.push("confirmed");
    // NOTE: BS gst_payable is populated solely from gst-account canonical legs above;
    // the tax-line net_gst_position mirrors it for reporting. Do not double-seed.
    for (const code of Object.keys(raw)) if (raw[code].confs.length) raw[code].confidence = worstConfidence(raw[code].confs);

    // 9. Prior period (revenue growth, opening cash, ΔWC for operating cash flow — H6).
    const PRIOR_CODES = ["revenue", "closing_cash", "total_current_liabilities", "accounts_receivable", "inventory", "other_current_assets"];
    const priorResults = notSuperseded(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }))
      .filter((r) => PRIOR_CODES.includes(r.entity_id) && r.period_end < periodStart &&
        (siteId ? r.site_id === siteId : true));
    const latestPrior = (code) => priorResults.filter((r) => r.entity_id === code).sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""))[0];
    const priorRev = latestPrior("revenue");
    const priorCash = latestPrior("closing_cash");
    ensure("opening_cash").cents += priorCash ? priorCash.value : 0; raw["opening_cash"].confs.push(priorCash ? priorCash.confidence : "forecast");
    // H6: supply prior working capital so operating_cash_flow uses the
    // period-over-period delta (ΔWC), not the entire current balance each period.
    const priorTcl = latestPrior("total_current_liabilities")?.value || 0;
    const priorNoncashCA = (latestPrior("accounts_receivable")?.value || 0) + (latestPrior("inventory")?.value || 0) + (latestPrior("other_current_assets")?.value || 0);
    const prior = { revenueCents: priorRev?.value || 0, closingCashCents: priorCash?.value || 0, tcl: priorTcl, noncashCA: priorNoncashCA };

    // 10. Compute.
    const V = computeAll(raw, prior, companyTaxRate);

    // 11. Persist results + lineage + supersession.
    const allScope = notSuperseded(await S.CalculationResult.filter({ organisation_id: orgId }))
      .filter((r) => r.entity_type !== "source_record" && r.period_start === periodStart && r.period_end === periodEnd &&
        (siteId ? r.site_id === siteId : !r.site_id));
    const figScope = allScope.filter((r) => r.result_type === "financial_figure");
    const kpiScope = allScope.filter((r) => r.result_type === "kpi");
    const priorByCode = {}; figScope.forEach((r) => { priorByCode[r.entity_id] = r; });

    const created = []; let supersededCount = 0;
    const persistLine = async (code) => {
      const meta = LINES[code]; const v = V[code]; if (!meta || !v) return null;
      const etype = GROUP_ETYPE[meta.group];
      const supersedes = priorByCode[code] ? priorByCode[code].id : null;
      const res = await S.CalculationResult.create({
        organisation_id: orgId, site_id: siteId, calculation_run_id: run.id,
        result_type: "financial_figure", entity_type: etype, entity_id: code,
        value: v.value, unit: meta.unit, confidence: v.confidence,
        period_start: periodStart, period_end: periodEnd, label: meta.label + (v.na ? " (N/A)" : ""),
        supersedes_result_id: supersedes,
      });
      if (supersedes) supersededCount++;
      // lineage: derived -> dep results (resolved after all created); raw -> canonical txns
      if (meta.level === 0) {
        const txnIds = (raw[code]?.txnIds || []);
        let ord = 0;
        for (const tid of txnIds) {
          await S.CalculationLineage.create({
            organisation_id: orgId, calculation_result_id: res.id, input_type: "calculation_result",
            input_record_id: tid, input_calculation_result_id: tid, field_path: "value", weight: 1, sort_order: ord++,
          });
        }
        // commitment lineage for commitment-fed lines
        for (const ac of activeCommitments) {
          const route = COMMITMENT_ROUTE[ac.c.commitment_class] || COMMITMENT_ROUTE.other;
          if (route.pl === code || route.bs === code || route.cf === code) {
            await S.CalculationLineage.create({
              organisation_id: orgId, calculation_result_id: res.id, input_type: "manual_commitment",
              input_record_id: ac.c.id, input_commitment_id: ac.c.id, field_path: "amount", weight: 1, sort_order: ord++,
            });
          }
        }
      } else {
        let ord = 0;
        for (const dep of meta.deps) {
          const depRes = created.find((x) => x.code === dep)?.res;
          await S.CalculationLineage.create({
            organisation_id: orgId, calculation_result_id: res.id, input_type: "calculation_result",
            input_record_id: depRes?.id || dep, input_calculation_result_id: depRes?.id || null, field_path: dep, weight: 1, sort_order: ord++,
          });
        }
      }
      return res;
    };

    // persist in topological order (raw then derived)
    const order = Object.keys(LINES).sort((a, b) => (LINES[a].level - LINES[b].level) || a.localeCompare(b));
    for (const code of order) {
      const res = await persistLine(code);
      if (res) created.push({ code, res });
    }

    // 12. KPIs.
    let kpiCount = 0;
    for (const kpi of kpiDefs) {
      const f = KPI_FORMULAS[kpi.code];
      if (!f) continue;
      const r = f(V, prior);
      const priorKpi = kpiScope.find((x) => x.entity_id === kpi.code);
      const res = await S.CalculationResult.create({
        organisation_id: orgId, site_id: siteId, calculation_run_id: run.id,
        result_type: "kpi", kpi_definition_id: kpi.id, entity_type: "kpi", entity_id: kpi.code,
        value: r.value, unit: r.unit, confidence: r.confidence,
        period_start: periodStart, period_end: periodEnd, label: kpi.name + (r.na ? " (N/A)" : ""),
        supersedes_result_id: priorKpi?.id || null,
      });
      if (priorKpi) supersededCount++;
      // KPI lineage to its input result lines
      let ord = 0;
      for (const dep of r.inputs) {
        const depRes = created.find((x) => x.code === dep)?.res;
        await S.CalculationLineage.create({
          organisation_id: orgId, calculation_result_id: res.id, input_type: "calculation_result",
          input_record_id: depRes?.id || dep, input_calculation_result_id: depRes?.id || null, field_path: dep, weight: 1, sort_order: ord++,
        });
      }
      kpiCount++;
    }

    // 13. Balance sheet verification + cash flow reconciliation.
    const balCheck = V.balance_check?.value || 0;
    const cashBs = V.cash?.value || 0;
    const cashCf = V.closing_cash?.value || 0;
    const exceptions = [];
    let status = "completed";
    if (Math.abs(balCheck) > BALANCE_TOLERANCE_CENTS) {
      status = "completed_with_errors";
      const verRun = await S.ReconciliationRun.create({
        organisation_id: orgId, site_id: siteId, reconciliation_type: "balance_sheet_verification",
        dataset_a: "balance_sheet", dataset_b: "balance_sheet", entity_type: "balance_sheet",
        period_start: periodStart, period_end: periodEnd, triggered_by: actorUserId, run_started_at: now(),
        status: "completed_with_exceptions", run_completed_at: now(), engine_version: ENGINE_VERSION,
        total_checked: 1, matched_count: 0, exception_count: 1,
      });
      const ex = await S.ReconciliationException.create({
        organisation_id: orgId, site_id: siteId, reconciliation_run_id: verRun.id,
        exception_type: "amount_mismatch", severity: "critical", entity_type: "balance_sheet",
        expected_value: "0", actual_value: String(balCheck), difference: balCheck,
        description: `Balance sheet out of balance by ${balCheck} cents (tolerance ${BALANCE_TOLERANCE_CENTS}).`,
      });
      exceptions.push(ex.id);
      await publishEvent(base44, { orgId, siteId, eventKey: EVT.BALANCE_FAIL, entityType: "CalculationRun", entityId: run.id, message: `Balance sheet out of balance by ${balCheck} cents`, severity: "critical", actorUserId });
      await writeAudit(base44, { orgId, actionType: "create", entityType: "ReconciliationException", entityId: ex.id, actorUserId, afterState: JSON.stringify({ balance_check: balCheck }), reason: "balance sheet verification failure" });
    }
    if (Math.abs(cashBs - cashCf) > BALANCE_TOLERANCE_CENTS) {
      const verRun = await S.ReconciliationRun.create({
        organisation_id: orgId, site_id: siteId, reconciliation_type: "cash_flow_verification",
        dataset_a: "balance_sheet", dataset_b: "cash_flow", entity_type: "cash",
        period_start: periodStart, period_end: periodEnd, triggered_by: actorUserId, run_started_at: now(),
        status: "completed_with_exceptions", run_completed_at: now(), engine_version: ENGINE_VERSION,
        total_checked: 1, matched_count: 0, exception_count: 1,
      });
      const ex = await S.ReconciliationException.create({
        organisation_id: orgId, site_id: siteId, reconciliation_run_id: verRun.id,
        exception_type: "amount_mismatch", severity: "warning", entity_type: "cash",
        expected_value: String(cashBs), actual_value: String(cashCf), difference: cashBs - cashCf,
        description: `Cash flow closing (${cashCf}) does not reconcile to balance sheet cash (${cashBs}).`,
      });
      exceptions.push(ex.id);
    }

    // 14. Finalise run.
    const resultCount = created.length + kpiCount;
    await S.CalculationRun.update(run.id, { status, run_completed_at: now(), result_count: resultCount });
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.COMPLETED, entityType: "CalculationRun", entityId: run.id, message: `Calculation ${status}: ${created.length} figures, ${kpiCount} KPIs, ${supersededCount} superseded, ${exceptions.length} exceptions`, severity: status === "completed" ? "info" : "warning", actorUserId });
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.TAX_COMPLETED, entityType: "CalculationRun", entityId: run.id, message: `Tax outputs computed: GST collected ${gstCollected}, paid ${gstPaid}, net ${gstCollected - gstPaid}`, actorUserId });
    if (supersededCount) await publishEvent(base44, { orgId, siteId, eventKey: EVT.SUPERSEDED, entityType: "CalculationRun", entityId: run.id, message: `${supersededCount} prior results superseded`, actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, afterState: JSON.stringify({ status, results: created.length, kpis: kpiCount, superseded: supersededCount, exceptions: exceptions.length, balance_check: balCheck, gst: { collected: gstCollected, paid: gstPaid, net: gstCollected - gstPaid }, excluded_critical: excludedTxns.length, commitments_included: includedCommitmentIds.length }), reason: "calculation completion" });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, afterState: JSON.stringify({ methodology: methodology?.id || null, engine: ENGINE_VERSION, cache_key: cacheKey, commitments: includedCommitmentIds, excluded_critical_src: excludedTxns.map((t) => t.entity_id) }), reason: "input + methodology + configuration version selection" });

    return {
      reused: false, calculation_run_id: run.id, cache_key: cacheKey,
      results: created.length, kpis: kpiCount, superseded: supersededCount,
      exceptions: exceptions.length, balance_check_cents: balCheck, status,
      gst: { collected: gstCollected, paid: gstPaid, net: gstCollected - gstPaid, free_sales: gstFreeSales, free_purchases: gstFreePurchases, input_taxed: inputTaxed },
      excluded_critical: excludedTxns.length, commitments_included: includedCommitmentIds,
    };
  } catch (err) {
    await S.CalculationRun.update(run.id, { status: "failed", run_completed_at: now() }).catch(() => {});
    await publishEvent(base44, { orgId, siteId, eventKey: EVT.FAILED, entityType: "CalculationRun", entityId: run.id, message: `Calculation failed: ${err.message}`, severity: "critical", actorUserId });
    await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationRun", entityId: run.id, actorUserId, success: false, afterState: JSON.stringify({ error: err.message }), reason: "calculation failure" });
    throw err;
  }
}

// ---- invalidate (no mutation; staleness is derived from supersession) ------

export async function invalidateResults(base44, { orgId, siteId = null, periodStart, periodEnd, actorUserId = "system" }) {
  const S = base44.asServiceRole.entities;
  const current = notSuperseded(await S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" }))
    .filter((r) => r.entity_type !== "source_record" && r.period_start === periodStart && r.period_end === periodEnd &&
      (siteId ? r.site_id === siteId : !r.site_id));
  await publishEvent(base44, { orgId, siteId, eventKey: EVT.INVALIDATED, entityType: "CalculationRun", message: `${current.length} financial results marked stale (awaiting recalculation)`, severity: "warning", actorUserId });
  await writeAudit(base44, { orgId, actionType: "create", entityType: "CalculationResult", actorUserId, afterState: JSON.stringify({ stale_result_ids: current.map((r) => r.id), period: `${periodStart}_${periodEnd}` }), reason: "invalidation (inputs changed)" });
  return { invalidated: current.length, stale_ids: current.map((r) => r.id) };
}

// ---- read: current results -------------------------------------------------

export async function getCurrentResults(base44, { orgId, siteId = null, periodStart = null, periodEnd = null, includeSuperseded = false }) {
  const S = base44.asServiceRole.entities;
  let results = await S.CalculationResult.filter({ organisation_id: orgId });
  results = results.filter((r) => r.entity_type !== "source_record" && (siteId ? r.site_id === siteId : true));
  if (periodStart) results = results.filter((r) => r.period_start >= periodStart);
  if (periodEnd) results = results.filter((r) => r.period_end <= periodEnd);
  if (!includeSuperseded) results = notSuperseded(results);
  const runs = await S.CalculationRun.filter({ organisation_id: orgId, run_type: "financial_figure" });
  const runById = {}; runs.forEach((r) => { runById[r.id] = r; });
  return results.map((r) => ({ ...r, run: runById[r.calculation_run_id] || null }));
}

// ---- read: lineage (transitive to source records) -------------------------

export async function getLineage(base44, { resultId }) {
  const S = base44.asServiceRole.entities;
  const root = await S.CalculationResult.get(resultId);
  const links = await S.CalculationLineage.filter({ calculation_result_id: resultId });
  const out = [];
  for (const l of links) {
    let input = null;
    if (l.input_type === "calculation_result" && l.input_calculation_result_id) {
      input = await S.CalculationResult.get(l.input_calculation_result_id).catch(() => null);
      // recurse one level to source if the input is itself a derived/canonical result
      let source = null;
      if (input && input.entity_type === "source_record") {
        source = await S.SourceRecord.get(input.entity_id).catch(() => null);
      }
      out.push({ link: l, input, source });
    } else if (l.input_type === "manual_commitment" && l.input_commitment_id) {
      const c = await S.ManualCommitment.get(l.input_commitment_id).catch(() => null);
      out.push({ link: l, commitment: c });
    } else {
      out.push({ link: l });
    }
  }
  return { result: root, lineage: out };
}

// ---- read: engine status ---------------------------------------------------

export async function getEngineStatus(base44, { orgId }) {
  const S = base44.asServiceRole.entities;
  const runs = (await S.CalculationRun.filter({ organisation_id: orgId, run_type: "financial_figure" }))
    .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
  const latest = runs[0] || null;
  const allFig = await S.CalculationResult.filter({ organisation_id: orgId, result_type: "financial_figure" });
  const current = notSuperseded(allFig).filter((r) => r.entity_type !== "source_record");
  const supersededCount = allFig.filter((r) => r.entity_type !== "source_record").length - current.length;
  const verRuns = await S.ReconciliationRun.filter({ organisation_id: orgId, reconciliation_type: { $in: ["balance_sheet_verification", "cash_flow_verification"] } });
  const balanceExceptions = verRuns.length;
  return {
    engine_version: ENGINE_VERSION,
    latest_run: latest,
    total_runs: runs.length,
    current_results: current.length,
    superseded_results: supersededCount,
    balance_verification_runs: verRuns.length,
    balance_exceptions: balanceExceptions,
  };
}