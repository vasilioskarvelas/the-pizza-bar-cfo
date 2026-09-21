import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import * as XLSX from 'npm:xlsx@0.18.5';
import { resolveActor, publishEvent, writeAudit } from "../../shared/authEvents.ts";
import {
  parseKpiSheet, shopNameFromSheet, matchSite, toEntity, figuresChanged,
} from "../../shared/kpiSheet.ts";

// Import the owner's weekly KPI spreadsheet into WeeklyChannelKPI.
//
// Deterministic (no AI extraction): columns are located by header text, weeks by
// week number. Idempotent — each (site, week, channel) is one record keyed by
// dedup_key; re-importing updates changed figures and leaves the rest untouched.
// Admin-only, or a verified scheduled call (service token + organisation_id).
//
// body: { file_url: string, dry_run?: boolean }

const PAGE = 5000;
const CHUNK = 200;

async function listAll(entity: any, query: any) {
  const out: any[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await entity.filter(query, "-week_ending", PAGE, skip);
    out.push(...(page || []));
    if (!page || page.length < PAGE) return out;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const orgId = actor.orgId;
    const dryRun = body.dry_run === true;
    if (!body.file_url) return Response.json({ error: "file_url required (upload the workbook first)" }, { status: 400 });

    const res = await fetch(body.file_url);
    if (!res.ok) return Response.json({ error: `Could not download file (${res.status})` }, { status: 400 });
    // cellDates:false keeps dates as Excel serials — avoids timezone day-shifts.
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array", cellDates: false });

    const S = base44.asServiceRole.entities;
    const sites: any[] = await S.Site.filter({ organisation_id: orgId }, "name", 500);
    const importRef = `kpi_sheet:${new Date().toISOString()}`;
    const warnings: string[] = [];
    const perSite: Record<string, { site_id: string; site_name: string; weeks: Set<string>; rows: number }> = {};
    const incoming: any[] = [];

    for (const sheetName of wb.SheetNames) {
      const shop = shopNameFromSheet(sheetName);
      if (!shop) continue;
      const site: any = matchSite(shop, sites);
      if (!site) {
        warnings.push(`Tab "${sheetName.trim()}" doesn't match exactly one site (sites: ${sites.map((s: any) => s.name).join(", ") || "none"}) — skipped`);
        continue;
      }
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null }) as unknown[][];
      const parsed = parseKpiSheet(sheetName.trim(), grid);
      warnings.push(...parsed.warnings);
      const bucket = perSite[site.id] ||= { site_id: site.id, site_name: site.name, weeks: new Set(), rows: 0 };
      for (const row of parsed.rows) {
        incoming.push(toEntity(row, orgId, site.id, importRef));
        bucket.weeks.add(row.week_ending);
        bucket.rows++;
      }
    }
    if (!incoming.length) {
      return Response.json({ error: "No KPI data found. Expected tabs named \"KPI <shop>\" with Week / channel headers.", warnings }, { status: 400 });
    }

    const existing = await listAll(S.WeeklyChannelKPI, { organisation_id: orgId, source: "kpi_sheet" });
    const byKey = new Map(existing.map((e: any) => [e.dedup_key, e]));
    const toCreate = incoming.filter((r) => !byKey.has(r.dedup_key));
    const toUpdate = incoming.filter((r) => byKey.has(r.dedup_key) && figuresChanged(byKey.get(r.dedup_key), r));
    const unchanged = incoming.length - toCreate.length - toUpdate.length;

    if (!dryRun) {
      for (let i = 0; i < toCreate.length; i += CHUNK) await S.WeeklyChannelKPI.bulkCreate(toCreate.slice(i, i + CHUNK));
      for (const r of toUpdate) await S.WeeklyChannelKPI.update(byKey.get(r.dedup_key).id, r);
      const summary = `KPI sheet import: ${toCreate.length} new, ${toUpdate.length} updated, ${unchanged} unchanged`;
      await publishEvent(base44, { orgId, eventKey: "kpi_sheet.imported", entityType: "WeeklyChannelKPI", message: summary, actorUserId: actor.actorUserId });
      await writeAudit(base44, { orgId, actionType: "create", entityType: "WeeklyChannelKPI", entityId: importRef, actorUserId: actor.actorUserId, reason: summary });
    }

    const sitesOut = Object.values(perSite).map((s) => {
      const weeks = [...s.weeks].sort();
      return { site_id: s.site_id, site_name: s.site_name, rows: s.rows, first_week: weeks[0], latest_week: weeks[weeks.length - 1] };
    });
    return Response.json({
      status: dryRun ? "dry_run" : "completed",
      import_ref: importRef,
      created: toCreate.length, updated: toUpdate.length, unchanged,
      sites: sitesOut, warnings,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
