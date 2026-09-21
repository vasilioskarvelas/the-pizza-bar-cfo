import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { sitePerformance, trend, weeksAvailable, totalsOf, pctChange } from "../../shared/weeklyPerformance.ts";

// Last-week performance per site from WeeklyChannelKPI (imported KPI sheet).
// body: { week_ending?: "YYYY-MM-DD" } — defaults to the latest week with data.
// Site-restricted users only see their assigned sites.

const PAGE = 5000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });

    const S = base44.asServiceRole.entities;
    let sites = await S.Site.filter({ organisation_id: actor.orgId }, "name", 500);
    if (actor.isSiteRestricted) sites = sites.filter((s: any) => (actor.siteIds || []).includes(s.id));

    const records: any[] = [];
    for (let skip = 0; ; skip += PAGE) {
      const page = await S.WeeklyChannelKPI.filter({ organisation_id: actor.orgId }, "-week_ending", PAGE, skip);
      records.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }
    const siteIds = new Set(sites.map((s: any) => s.id));
    const visible = records.filter((r) => siteIds.has(r.site_id));

    const weeks = weeksAvailable(visible);
    const weekEnding = body.week_ending && weeks.includes(body.week_ending) ? body.week_ending : weeks[0];
    if (!weekEnding) return Response.json({ weeks_available: [], sites: [], week_ending: null });

    const siteViews = sites
      .map((s: any) => {
        const own = visible.filter((r) => r.site_id === s.id);
        if (!own.length) return null;
        return { site_id: s.id, site_name: s.name, ...sitePerformance(own, weekEnding), trend: trend(own, weekEnding, 12) };
      })
      .filter(Boolean);

    const cur = visible.filter((r) => r.week_ending === weekEnding);
    const prevWeek = weeks.find((w) => w < weekEnding);
    const combined = totalsOf(cur);
    const combinedPrev = prevWeek ? totalsOf(visible.filter((r) => r.week_ending === prevWeek)) : null;
    const lastImport = records.reduce((a, r) => (r.updated_date && r.updated_date > a ? r.updated_date : a), "");

    return Response.json({
      week_ending: weekEnding,
      weeks_available: weeks.slice(0, 104),
      combined: { ...combined, prev: combinedPrev, vs_prev_pct: pctChange(combined.gross, combinedPrev?.gross) },
      sites: siteViews,
      last_import_at: lastImport || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
