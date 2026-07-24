// Phase 03 — immutable ingestion pipeline. Shared by runConnectorSync and xeroAuth.
// Steps: authenticate -> read -> validate -> detect duplicates/supersede -> store
// immutable raw SourceRecord -> record ImportBatch/ConnectorRun metadata ->
// publish SystemEvents -> write AuditLog. No financial calculations.

import { publishEvent, writeAudit } from "./authEvents.ts";

export const CONN_EVENT = {
  CONNECTED: "connector.connected",
  DISCONNECTED: "connector.disconnected",
  SYNC_STARTED: "connector.sync.started",
  SYNC_COMPLETED: "connector.sync.completed",
  SYNC_FAILED: "connector.sync.failed",
  TOKEN_REFRESHED: "connector.token.refreshed",
};

export function safeParse(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text || "");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function idempotencyKey(sourceSystem, extType, extId) {
  return `${sourceSystem}|${extType}|${extId}`;
}

// Deterministic simulated Xero source. Config flags drive the runtime tests:
// record_count, mutate_index (changed payload -> supersede), invalid_index
// (validation failure -> ImportError -> partial recovery), simulate_auth_failure,
// simulate_token_expired.
export function simulateXeroRecords(config) {
  if (config.simulate_auth_failure) throw new Error("Simulated authentication failure (401 from source)");
  if (config.simulate_token_expired) throw new Error("Simulated expired token (invalid_grant: refresh token expired)");
  const count = config.record_count || 3;
  const recs = [];
  for (let i = 0; i < count; i++) {
    if (i === config.invalid_index) {
      recs.push({ external_entity_type: "invoice", external_record_id: null, raw_payload: JSON.stringify({ bad: true }), source_created_at: new Date().toISOString(), source_updated_at: new Date().toISOString() });
      continue;
    }
    const prefix = config.id_prefix || "XERO-INV-";
    const inv = { InvoiceID: `${prefix}${1000 + i}`, Type: "ACCREC", Contact: "Demo Contact", DateString: "2026-07-24", Status: "AUTHORISED", Total: (100 + i * 10).toFixed(2) };
    if (i === config.mutate_index) inv.Total = "999.99";
    recs.push({ external_entity_type: "invoice", external_record_id: inv.InvoiceID, raw_payload: JSON.stringify(inv), source_created_at: new Date().toISOString(), source_updated_at: new Date().toISOString() });
  }
  return recs;
}

// Real Xero fetch: refresh token, call /Invoices. Requires XERO_CLIENT_ID/SECRET.
export async function xeroFetch(base44, { connector }) {
  const cid = Deno.env.get("XERO_CLIENT_ID");
  const csec = Deno.env.get("XERO_CLIENT_SECRET");
  if (!cid || !csec) throw new Error("Xero credentials not configured");
  if (!connector.auth_ref) throw new Error("Connector not authenticated (no refresh token)");
  const tok = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connector.auth_ref, client_id: cid, client_secret: csec, scope: "offline_access accounting.transactions.read" }),
  });
  if (!tok.ok) { const t = await tok.text(); throw new Error("token refresh failed: " + t.slice(0, 200)); }
  const tokens = await tok.json();
  if (tokens.refresh_token && tokens.refresh_token !== connector.auth_ref) {
    await base44.asServiceRole.entities.Connector.update(connector.id, { auth_ref: tokens.refresh_token });
    await publishEvent(base44, { orgId: connector.organisation_id, eventKey: CONN_EVENT.TOKEN_REFRESHED, entityId: connector.id, message: "Xero token refreshed during sync" });
  }
  const cfg = safeParse(connector.config);
  let tenantId = cfg.tenant_id || null;
  if (!tenantId) {
    const conns = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const cl = await conns.json();
    if (cl && cl[0]) { tenantId = cl[0].tenantId; await base44.asServiceRole.entities.Connector.update(connector.id, { config: JSON.stringify({ ...cfg, tenant_id: tenantId }) }); }
  }
  if (!tenantId) throw new Error("No Xero tenant connected");
  const invRes = await fetch("https://api.xero.com/api.xro/2.0/Invoices", { headers: { Authorization: `Bearer ${tokens.access_token}`, "Xero-tenant-id": tenantId, Accept: "application/json" } });
  if (!invRes.ok) { const t = await invRes.text(); throw new Error("Xero invoices fetch failed: " + t.slice(0, 200)); }
  const data = await invRes.json();
  const invoices = data.Invoices || [];
  return invoices.map((inv) => ({ external_entity_type: "invoice", external_record_id: inv.InvoiceID, raw_payload: JSON.stringify(inv), source_created_at: inv.DateString || inv.CreatedDateUTC, source_updated_at: inv.UpdatedDateUTC }));
}

export function makeFetch(base44, connector) {
  const cfg = safeParse(connector.config);
  if (cfg.simulated) return () => simulateXeroRecords(cfg);
  if (connector.source_system === "xero") return () => xeroFetch(base44, { connector });
  throw new Error("Unsupported connector source_system: " + connector.source_system);
}

// The 8-step pipeline for ONE connector. Returns stats.
export async function runImportPipeline(base44, { connector, trigger, actorUserId, fetchRecords }) {
  const S = base44.asServiceRole.entities;
  const orgId = connector.organisation_id;
  const siteId = connector.site_id || null;
  const startedAt = new Date().toISOString();

  const run = await S.ConnectorRun.create({
    organisation_id: orgId, site_id: siteId, connector_id: connector.id,
    source_system: connector.source_system, run_type: trigger, run_started_at: startedAt,
    status: "running", triggered_by: actorUserId || trigger,
  });
  const batch = await S.ImportBatch.create({
    organisation_id: orgId, site_id: siteId, connector_run_id: run.id,
    idempotency_key: `${connector.id}|${startedAt}`, batch_started_at: startedAt,
    status: "processing", record_count: 0, imported_count: 0, error_count: 0,
  });
  await publishEvent(base44, { orgId, siteId, eventKey: CONN_EVENT.SYNC_STARTED, entityId: connector.id, message: `Sync started (${trigger})`, actorUserId });

  let records = [];
  let fetchError = null;
  try { records = await fetchRecords(); }
  catch (e) { fetchError = e; }

  if (fetchError) {
    const finishedAt = new Date().toISOString();
    await S.ConnectorRun.update(run.id, { status: "failed", run_completed_at: finishedAt, error_summary: fetchError.message });
    await S.ImportBatch.update(batch.id, { status: "rejected", batch_completed_at: finishedAt });
    await S.Connector.update(connector.id, { last_run_at: startedAt, last_run_status: "failed" });
    await publishEvent(base44, { orgId, siteId, eventKey: CONN_EVENT.SYNC_FAILED, entityId: connector.id, message: `Sync failed: ${fetchError.message}`, severity: "critical", actorUserId });
    await writeAudit(base44, { orgId, siteId, actionType: "create", entityType: "ConnectorRun", entityId: run.id, actorUserId, afterState: "failed", reason: fetchError.message });
    return { run_id: run.id, batch_id: batch.id, status: "failed", error: fetchError.message, duration_ms: new Date(finishedAt).getTime() - new Date(startedAt).getTime() };
  }

  let processed = 0, imported = 0, duplicates = 0, failures = 0, superseded = 0;
  for (const rec of records) {
    processed++;
    if (!rec.external_record_id || !rec.external_entity_type) {
      failures++;
      await S.ImportError.create({ organisation_id: orgId, site_id: siteId, import_batch_id: batch.id, external_record_id: rec.external_record_id || null, external_entity_type: rec.external_entity_type || null, error_stage: "validate", error_code: "missing_required", error_message: "external_record_id and external_entity_type required", raw_payload: rec.raw_payload || null, severity: "critical", occurred_at: new Date().toISOString() });
      continue;
    }
    const idemKey = idempotencyKey(connector.source_system, rec.external_entity_type, rec.external_record_id);
    const hash = await sha256Hex(rec.raw_payload || "");
    const existing = await S.SourceRecord.filter({ organisation_id: orgId, idempotency_key: idemKey, record_status: "active" });
    if (existing.length && existing[0].payload_hash === hash) { duplicates++; continue; }
    let supersedesId = null;
    if (existing.length) {
      supersedesId = existing[0].id;
      await S.SourceRecord.update(existing[0].id, { record_status: "superseded" });
      superseded++;
    }
    await S.SourceRecord.create({
      organisation_id: orgId, site_id: siteId, import_batch_id: batch.id, zone: "source",
      source_system: connector.source_system, external_entity_type: rec.external_entity_type,
      external_record_id: rec.external_record_id, idempotency_key: idemKey, raw_payload: rec.raw_payload,
      payload_hash: hash, source_created_at: rec.source_created_at, source_updated_at: rec.source_updated_at,
      ingested_at: startedAt, supersedes_record_id: supersedesId, record_status: "active",
    });
    imported++;
  }

  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const status = failures > 0 && imported === 0 ? "failed" : failures > 0 ? "completed_with_errors" : "completed";
  const batchStatus = status === "failed" ? "rejected" : failures > 0 ? "completed_with_errors" : "completed";
  await S.ImportBatch.update(batch.id, { status: batchStatus, batch_completed_at: finishedAt, record_count: processed, imported_count: imported, error_count: failures });
  await S.ConnectorRun.update(run.id, { status, run_completed_at: finishedAt, records_fetched: processed, records_imported: imported, records_failed: failures });
  await S.Connector.update(connector.id, {
    last_run_at: startedAt,
    last_successful_sync_at: status === "completed" ? finishedAt : connector.last_successful_sync_at,
    last_run_status: status,
  });
  const ok = status !== "failed";
  await publishEvent(base44, { orgId, siteId, eventKey: ok ? CONN_EVENT.SYNC_COMPLETED : CONN_EVENT.SYNC_FAILED, entityId: connector.id, message: `Sync ${status}: ${processed} processed, ${imported} imported, ${duplicates} duplicates, ${failures} failures`, severity: ok ? "info" : "warning", actorUserId });
  await writeAudit(base44, { orgId, siteId, actionType: "create", entityType: "ImportBatch", entityId: batch.id, actorUserId, afterState: JSON.stringify({ processed, imported, duplicates, failures, superseded, duration_ms: durationMs }), reason: `import ${trigger}` });

  return { run_id: run.id, batch_id: batch.id, status, duration_ms: durationMs, stats: { processed, imported, duplicates, failures, superseded } };
}