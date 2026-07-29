import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { today, now, publishEvent, writeAudit, resolveActor } from "../../shared/authEvents.ts";
import {
  reconcileSets, findDuplicates, reconcileConfidence,
} from "../../shared/canonical.ts";

// Phase 04 — Deterministic reconciliation engine.
// Compares two datasets of canonical transactions (CalculationResult financial_figure)
// and classifies each as matched | partially_matched | unmatched | duplicate | exception,
// using source identifiers, account (label), transaction date, amount and currency with
// configurable tolerances. No AI participates. Writes ReconciliationRun + ReconciliationException
// (immutable history). Confidence elevation creates superseding CalculationResult (immutable
// chain via supersedes_result_id) with fresh CalculationLineage. Every action audited.

const EVT = {
  STARTED: "reconciliation.run.started",
  COMPLETED: "reconciliation.run.completed",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // Phase 14H: authoritative identity via the shared resolver. The client cannot
    // select the tenant (own org is enforced for non-platform callers), and the
    // null-user (scheduled) path is fail-closed until a verified platform-auth
    // mechanism exists — see resolveActor / isTrustedPlatformCall.
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const orgId = actor.orgId;
    const actorUserId = actor.actorUserId;

    const S = base44.asServiceRole.entities;
    const periodStart = body.period_start || today();
    const periodEnd = body.period_end || today();
    const datasetA = body.dataset_a || "all";
    const datasetB = body.dataset_b || "all";
    const tolerance = body.tolerance || {};

    // Current canonical transactions = not superseded, in period.
    const allTxns = await S.CalculationResult.filter({
      organisation_id: orgId, result_type: "financial_figure", entity_type: "source_record",
    });
    const supersededIds = new Set(
      allTxns.filter((t) => t.supersedes_result_id).map((t) => t.supersedes_result_id)
    );
    const current = allTxns.filter(
      (t) => !supersededIds.has(t.id) && t.period_start >= periodStart && t.period_start <= periodEnd
    );

    // Join source_system via SourceRecord for dataset filtering.
    const sourceRecords = await S.SourceRecord.filter({ organisation_id: orgId, record_status: "active" });
    const srById = {}; for (const sr of sourceRecords) srById[sr.id] = sr;
    const withSource = current.map((t) => ({
      ...t, source_system: srById[t.entity_id]?.source_system || "unknown",
    }));

    const txsA = datasetA === "all" ? withSource : withSource.filter((t) => t.source_system === datasetA);
    const txsB = datasetB === "all" ? withSource : withSource.filter((t) => t.source_system === datasetB);

    const recRun = await S.ReconciliationRun.create({
      organisation_id: orgId, reconciliation_type: `${datasetA}_vs_${datasetB}`,
      dataset_a: datasetA, dataset_b: datasetB, entity_type: "canonical_transaction",
      period_start: periodStart, period_end: periodEnd, triggered_by: actorUserId,
      run_started_at: now(), status: "running", engine_version: "recon-1.0",
    });
    await publishEvent(base44, {
      orgId, eventKey: EVT.STARTED, entityType: "ReconciliationRun", entityId: recRun.id,
      message: `Reconciliation started: ${txsA.length} vs ${txsB.length}`, actorUserId,
    });

    let matched = 0, partial = 0, unmatched = 0, duplicates = 0, excCount = 0, superseded = 0;

    const makeException = async (a, type, severity, description, expected, actual, difference) => {
      await S.ReconciliationException.create({
        organisation_id: orgId, site_id: a.site_id, reconciliation_run_id: recRun.id,
        exception_type: type, severity, entity_type: "source_record",
        source_record_id: a.entity_id, expected_value: expected ?? null, actual_value: actual ?? null,
        difference: difference ?? null, description,
      });
      excCount++;
    };

    const maybeSupersede = async (a, newConf, fieldPath) => {
      if (a.confidence === newConf) return;
      const sup = await S.CalculationResult.create({
        organisation_id: orgId, site_id: a.site_id, calculation_run_id: a.calculation_run_id,
        result_type: "financial_figure", entity_type: "source_record", entity_id: a.entity_id,
        value: a.value, unit: a.unit, confidence: newConf,
        period_start: a.period_start, period_end: a.period_end, label: a.label,
        supersedes_result_id: a.id,
      });
      await S.CalculationLineage.create({
        organisation_id: orgId, calculation_result_id: sup.id, input_type: "source_record",
        input_record_id: a.entity_id, input_source_record_id: a.entity_id,
        field_path: fieldPath, weight: 1, sort_order: 0,
      });
      superseded++;
    };

    for (const c of reconcileSets(txsA, txsB, tolerance)) {
      const a = c.a;
      if (c.status === "matched") {
        matched++;
        await maybeSupersede(a, reconcileConfidence("matched"), "reconciliation.matched");
      } else if (c.status === "partially_matched") {
        partial++;
        const type = c.reason === "amount_mismatch" ? "amount_mismatch" : "stale";
        const diff = c.match ? Math.abs((a.value || 0) - (c.match.value || 0)) : null;
        await makeException(a, type, "warning", `Partially matched: ${c.reason}`,
          c.match ? String(c.match.value) : null, String(a.value), diff);
        await maybeSupersede(a, reconcileConfidence("partially_matched"), "reconciliation.partial");
      } else if (c.status === "duplicate") {
        duplicates++;
        await makeException(a, "duplicate", "critical", `Duplicate: ${c.reason}`, null, null, null);
      } else if (c.status === "exception") {
        unmatched++;
        await makeException(a, "broken_link", "warning", "Currency mismatch", a.unit, c.match?.unit, null);
      } else {
        unmatched++;
        await makeException(a, "unmatched", "warning", "No matching counterpart in dataset B", null, null, null);
      }
    }

    // Intra-set duplicates (same account+amount+date+currency within A).
    for (const d of findDuplicates(txsA)) {
      duplicates++;
      await makeException(d.duplicate, "duplicate", "critical",
        "Intra-set duplicate (same account+amount+date+currency)", null, null, null);
    }

    const finishedAt = now();
    const status = excCount > 0 ? "completed_with_exceptions" : "completed";
    await S.ReconciliationRun.update(recRun.id, {
      status, run_completed_at: finishedAt, total_checked: txsA.length,
      matched_count: matched, exception_count: excCount,
    });
    await publishEvent(base44, {
      orgId, eventKey: EVT.COMPLETED, entityType: "ReconciliationRun", entityId: recRun.id,
      message: `Reconciliation ${status}: ${matched} matched, ${partial} partial, ${unmatched} unmatched, ${duplicates} duplicate, ${superseded} superseded`,
      severity: excCount ? "warning" : "info", actorUserId,
    });
    await writeAudit(base44, {
      orgId, actionType: "create", entityType: "ReconciliationRun", entityId: recRun.id,
      actorUserId, afterState: JSON.stringify({ matched, partial, unmatched, duplicates, exceptions: excCount, superseded }),
      reason: `reconciliation ${datasetA}_vs_${datasetB}`,
    });

    return Response.json({
      reconciliation_run_id: recRun.id, matched, partial, unmatched, duplicates,
      exceptions: excCount, superseded,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});