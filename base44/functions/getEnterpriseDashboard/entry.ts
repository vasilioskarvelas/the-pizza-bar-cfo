import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor, extractOrgMetrics } from "../../shared/enterpriseShared.ts";
import { aggregateDashboard, ENTERPRISE_ENGINE_VERSION } from "../../shared/enterpriseEngine.ts";

// Phase 13 — getEnterpriseDashboard: platform-wide totals + per-org rows.
// Per-org financial metrics are read from existing CalculationResult snapshots
// (deterministic — no recalculation, no AI).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });

    // Bounded reads (limit 1000) — unbounded .list() silently truncates at the SDK
    // default page cap, undercounting platform-wide totals at scale. NOTE: a single
    // bounded call cannot page beyond the platform max; full-scale counts (>1000 per
    // entity) require platform skip-pagination support and remain a documented limit.
    const [orgs, sites, profiles, compliance, weeklyReports, aiSummaries, calcRuns] = await Promise.all([
      base44.asServiceRole.entities.Organisation.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.Site.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.UserProfile.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.ComplianceItem.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.WeeklyReport.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.AISummary.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.CalculationRun.filter({}, "-created_date", 1000),
    ]);

    const scopedOrgs = actor.isPlatformAdmin ? orgs : orgs.filter((o: any) => o.id === actor.orgId);
    const scopedSites = actor.isPlatformAdmin ? sites : sites.filter((s: any) => s.organisation_id === actor.orgId);
    const scopedCompliance = actor.isPlatformAdmin ? compliance : compliance.filter((c: any) => c.organisation_id === actor.orgId);

    const perOrgMetrics: Record<string, any> = {};
    await Promise.all(scopedOrgs.map(async (org: any) => {
      perOrgMetrics[org.id] = await extractOrgMetrics(base44, org.id, calcRuns);
    }));

    const dashboard = aggregateDashboard({
      orgs: scopedOrgs, sites: scopedSites, users: profiles, compliance: scopedCompliance,
      perOrgMetrics, weeklyReports: weeklyReports.length, aiSummaries: aiSummaries.length,
    });
    return Response.json({ engine_version: ENTERPRISE_ENGINE_VERSION, generated_at: new Date().toISOString(), dashboard });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});