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

    const [orgs, sites, profiles, compliance, weeklyReports, aiSummaries, calcRuns] = await Promise.all([
      base44.asServiceRole.entities.Organisation.list(),
      base44.asServiceRole.entities.Site.list(),
      base44.asServiceRole.entities.UserProfile.list(),
      base44.asServiceRole.entities.ComplianceItem.list(),
      base44.asServiceRole.entities.WeeklyReport.list(),
      base44.asServiceRole.entities.AISummary.list(),
      base44.asServiceRole.entities.CalculationRun.list(),
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