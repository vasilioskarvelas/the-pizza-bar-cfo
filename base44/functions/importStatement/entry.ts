import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runImportPipeline } from "../../shared/ingestion.ts";

// Manual CSV / statement import (Bite, OrderMate, DoorDash, POS, bank).
// Admin-only. Uploads a file (client obtains file_url via UploadFile), extracts
// canonical transaction rows via the LLM extractor, then runs them through the
// existing immutable ingestion pipeline (duplicate detection, supersession,
// ImportBatch/ConnectorRun metadata, events, audit). No financial calc here —
// run Build Canonical Model + Financial Calculations afterwards to surface data.

const SOURCE_SYSTEMS = ["pos", "delivery", "banking", "manual"];

// Canonical row schema — field names align with canonical.ts extractFields()
// (amount, transaction_date, category, reference, currency) so buildCanonicalModel
// can classify + map them without platform-specific column knowledge.
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          transaction_date: { type: "string", description: "ISO date the sale/transaction occurred" },
          reference: { type: "string", description: "Order/invoice/transaction reference id" },
          description: { type: "string" },
          category: { type: "string", description: "e.g. sales, food, beverages, fees, refund" },
          amount: { type: "number", description: "Net amount in dollars (negative for refunds/fees)" },
          currency: { type: "string", description: "ISO code, default AUD" }
        }
      }
    }
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const d = caller.data || {};
    const orgId = d.organisation_id || caller.organisation_id;
    const isAdmin = caller.role === "admin" || d.system_role === "owner" || d.system_role === "system";
    if (!orgId || !isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const sourceSystem = body.source_system;
    const siteId = body.site_id || null;
    const fileUrl = body.file_url;
    const platform = (body.platform || sourceSystem || "manual").toString();
    if (!SOURCE_SYSTEMS.includes(sourceSystem)) return Response.json({ error: "source_system required (pos|delivery|banking|manual)" }, { status: 400 });
    if (!fileUrl) return Response.json({ error: "file_url required (upload the file first via UploadFile)" }, { status: 400 });

    const S = base44.asServiceRole.entities;

    // Find or create a manual connector for (org, source_system, site) so the
    // import reuses the standard ConnectorRun/ImportBatch metadata path.
    let connector = (await S.Connector.filter({ organisation_id: orgId, source_system: sourceSystem, connector_type: "manual" }))
      .find((c) => (c.site_id || null) === (siteId || null));
    if (!connector) {
      connector = await S.Connector.create({
        organisation_id: orgId, site_id: siteId, source_system: sourceSystem,
        name: `Manual import — ${platform}`, connector_type: "manual", status: "active",
        config: JSON.stringify({ platform, manual: true }),
      });
    }

    // Extract structured rows from the uploaded file (csv/xlsx/pdf supported).
    const extracted: any = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: fileUrl, json_schema: EXTRACT_SCHEMA,
    });
    if (extracted.status === "error") return Response.json({ error: "Extraction failed: " + (extracted.details || "unknown"), status: "error" }, { status: 500 });
    const out = extracted.output;
    const rows: any[] = Array.isArray(out) ? out : (out && Array.isArray(out.transactions) ? out.transactions : []);
    if (!rows.length) return Response.json({ error: "No transactions could be extracted from the file", rows_extracted: 0 }, { status: 400 });

    // Map to ingestion-pipeline records. external_record_id is prefixed with the
    // platform so Bite/OrderMate/DoorDash rows never collide on idempotency even
    // when they share the source_system bucket.
    const fetchRecords = () => rows.map((r, i) => {
      const ref = r.reference ? `${platform}:${r.reference}` : `${platform}:${r.transaction_date || "noref"}:${i}`;
      const amount = Number(r.amount ?? 0);
      return {
        external_entity_type: "sales_transaction",
        external_record_id: ref,
        raw_payload: JSON.stringify({
          amount: isFinite(amount) ? amount : 0,
          transaction_date: r.transaction_date || null,
          category: r.category || platform,
          reference: r.reference || null,
          description: r.description || null,
          currency: r.currency || "AUD",
        }),
        source_created_at: r.transaction_date || new Date().toISOString(),
        source_updated_at: new Date().toISOString(),
      };
    });

    const result = await runImportPipeline(base44, { connector, trigger: "manual_upload", actorUserId: caller.id, fetchRecords });
    return Response.json({ ...result, platform, source_system: sourceSystem, rows_extracted: rows.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});