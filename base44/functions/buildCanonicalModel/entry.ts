import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { today, now, publishEvent, writeAudit } from "../../shared/authEvents.ts";
import {
  extractFields, classify, gstTreatmentFor, buildConfidence, makeLabel,
} from "../../shared/canonical.ts";

// Phase 04 — Canonical transaction builder.
// Converts active immutable SourceRecords (a period) into canonical financial
// transactions stored as CalculationResult (result_type="financial_figure",
// entity_type="source_record"). Each carries account+GST (label), currency (unit),
// transaction date (period_start), posting date (period_end), amount (value) and a
// deterministic confidence score. Full traceability via CalculationLineage.
// Missing mappings / missing source data / currency mismatch -> ReconciliationException.
// Admin-authenticated (manual) or platform-invoked. No financial figures exposed to users.

const EVT = {
  STARTED: "canonical.build.started",
  COMPLETED: "canonical.build.completed",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    let orgId = body.organisation_id || null;
    let actorUserId = "system";
    if (user) {
      const d = user.data || {};
      orgId = orgId || d.organisation_id || user.organisation_id;
      actorUserId = user.id;
      const systemRole = d.system_role || user.system_role;
      const isAdmin = user.role === "admin" || systemRole === "owner" || systemRole === "system";
      if (!orgId || !isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    } else if (!orgId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const S = base44.asServiceRole.entities;
    const t = today();
    const periodStart = body.period_start || t;
    const periodEnd = body.period_end || t;
    const sourceSystem = body.source_system || null;

    const [mappings, accounts] = await Promise.all([
      S.AccountMapping.filter({ organisation_id: orgId }),
      S.Account.filter({ organisation_id: orgId }),
    ]);

    const srFilter = { organisation_id: orgId, record_status: "active" };
    if (sourceSystem) srFilter.source_system = sourceSystem;
    const sourceRecords = await S.SourceRecord.filter(srFilter);
    const inPeriod = sourceRecords.filter((r) => {
      const d = (r.source_created_at || "").slice(0, 10);
      return d && d >= periodStart && d <= periodEnd;
    });

    // Idempotency: skip source records already built (active canonical txn exists).
    const existingTxns = await S.CalculationResult.filter({
      organisation_id: orgId, result_type: "financial_figure", entity_type: "source_record",
    });
    const builtSourceIds = new Set(existingTxns.map((x) => x.entity_id));

    const calcRun = await S.CalculationRun.create({
      organisation_id: orgId, run_type: "financial_figure", methodology_version_id: null,
      period_start: periodStart, period_end: periodEnd, engine_version: "canonical-1.0",
      run_started_at: now(), status: "running", triggered_by: actorUserId,
    });
    const recRun = await S.ReconciliationRun.create({
      organisation_id: orgId, reconciliation_type: "build_validation", dataset_a: "source",
      dataset_b: "canonical", entity_type: "source_record", period_start: periodStart,
      period_end: periodEnd, triggered_by: actorUserId, run_started_at: now(),
      status: "running", engine_version: "canonical-1.0",
    });
    await publishEvent(base44, {
      orgId, eventKey: EVT.STARTED, entityType: "CalculationRun", entityId: calcRun.id,
      message: `Canonical build started for ${inPeriod.length} source records`, actorUserId,
    });

    let built = 0, skipped = 0, exceptions = 0;
    for (const sr of inPeriod) {
      if (builtSourceIds.has(sr.id)) { skipped++; continue; }
      const f = extractFields(sr.raw_payload, sr.source_system, sr.external_entity_type, sr.external_record_id);
      const cls = classify({ category: f.category, sourceSystem: sr.source_system, mappings, accounts, todayStr: t });
      const gst = gstTreatmentFor(cls.accountClass, f.gstTreatment);
      const label = cls.mapped ? makeLabel(cls.accountCode, gst) : makeLabel("UNMAPPED", gst);
      const confidence = buildConfidence({
        mapped: cls.mapped, hasAmount: f.amount !== 0, hasDate: !!f.transactionDate,
      });

      const txn = await S.CalculationResult.create({
        organisation_id: orgId, site_id: sr.site_id, calculation_run_id: calcRun.id,
        result_type: "financial_figure", entity_type: "source_record", entity_id: sr.id,
        value: f.amount, unit: f.currency, confidence,
        period_start: f.transactionDate || periodStart, period_end: f.postingDate || periodStart,
        label,
      });
      await S.CalculationLineage.create({
        organisation_id: orgId, calculation_result_id: txn.id, input_type: "source_record",
        input_record_id: sr.id, input_source_record_id: sr.id, field_path: "raw_payload",
        weight: 1, sort_order: 0,
      });

      if (!cls.mapped) {
        await S.ReconciliationException.create({
          organisation_id: orgId, site_id: sr.site_id, reconciliation_run_id: recRun.id,
          exception_type: "missing", severity: "warning", entity_type: "source_record",
          source_record_id: sr.id, expected_value: "account mapping", actual_value: f.category,
          description: `No AccountMapping for source_system=${sr.source_system} external_category=${f.category}`,
        });
        exceptions++;
      }
      if (f.amount === 0) {
        await S.ReconciliationException.create({
          organisation_id: orgId, site_id: sr.site_id, reconciliation_run_id: recRun.id,
          exception_type: "missing", severity: "critical", entity_type: "source_record",
          source_record_id: sr.id, expected_value: "non-zero amount", actual_value: "0",
          description: "Source record has no parseable amount (missing source data)",
        });
        exceptions++;
      }
      if (f.currency && f.currency !== "AUD") {
        await S.ReconciliationException.create({
          organisation_id: orgId, site_id: sr.site_id, reconciliation_run_id: recRun.id,
          exception_type: "broken_link", severity: "warning", entity_type: "source_record",
          source_record_id: sr.id, expected_value: "AUD", actual_value: f.currency,
          description: "Currency mismatch: non-AUD currency not supported",
        });
        exceptions++;
      }
      built++;
    }

    const finishedAt = now();
    await S.CalculationRun.update(calcRun.id, {
      status: "completed", run_completed_at: finishedAt, result_count: built,
    });
    await S.ReconciliationRun.update(recRun.id, {
      status: exceptions > 0 ? "completed_with_exceptions" : "completed",
      run_completed_at: finishedAt, total_checked: built,
      matched_count: built - exceptions, exception_count: exceptions,
    });
    await publishEvent(base44, {
      orgId, eventKey: EVT.COMPLETED, entityType: "CalculationRun", entityId: calcRun.id,
      message: `Canonical build completed: ${built} built, ${skipped} skipped, ${exceptions} exceptions`,
      actorUserId,
    });
    await writeAudit(base44, {
      orgId, actionType: "create", entityType: "CalculationRun", entityId: calcRun.id,
      actorUserId, afterState: JSON.stringify({ built, skipped, exceptions }),
      reason: "canonical model build",
    });

    return Response.json({
      calculation_run_id: calcRun.id, reconciliation_run_id: recRun.id,
      built, skipped, exceptions,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});