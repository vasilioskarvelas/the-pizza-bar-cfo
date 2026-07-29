import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent, writeAudit, now, today } from "../../shared/authEvents.ts";
import { loadMetrics } from "../../shared/executivePlanningRunner.ts";
import { getCurrentOwnerScore } from "../../shared/ownerScoreRunner.ts";
import {
  WEEKLY_ENGINE_VERSION, WEEKLY_METRIC_CODES, METRIC_META,
  isoWeekRange, previousWeekRange, reportKey, computeDeltas,
  latestTwoPeriods, metricsAtPeriod, buildSummary, formatEmailBody,
} from "../../shared/weeklyReportEngine.ts";
import { loadWeeklyActivity, loadOrgName } from "../../shared/weeklyActivity.ts";

// Phase 10 — generateWeeklyReport: deterministic weekly executive snapshot.
// Manual (single org) OR scheduled/platform (all orgs × active sites).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const S = base44.asServiceRole.entities;

    // Phase 14H (H1): authenticate BEFORE any work. The all-orgs (cross-tenant)
    // path is restricted to a verified platform/scheduled invocation; no such
    // mechanism is configured, so it is fail-closed. The authenticated single-org
    // path is unchanged for admins/owners.
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    // Platform / scheduled invocation: iterate every organisation.
    if (body.all_orgs) {
      if (!actor.isScheduled) return Response.json({ error: "Forbidden: all_orgs requires a verified platform invocation" }, { status: 403 });
      const orgs = await S.Organisation.filter({}, "-created_date", 1000);
      const results = [];
      for (const org of orgs) {
        try { results.push({ organisation_id: org.id, ...(await generateForOrg(base44, org.id, org.name || "HFOS", body)) }); }
        catch (e) { results.push({ organisation_id: org.id, error: e.message }); }
      }
      return Response.json({ generated: results, engine_version: WEEKLY_ENGINE_VERSION });
    }

    const orgName = await loadOrgName(base44, actor.orgId);
    const out = await generateForOrg(base44, actor.orgId, orgName, { ...body, actor_user_id: actor.actorUserId, is_scheduled: actor.isScheduled });
    return Response.json({ ...out, engine_version: WEEKLY_ENGINE_VERSION });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Generate reports for one organisation: org-level + each active site.
async function generateForOrg(base44: any, orgId: string, orgName: string, opts: any) {
  const S = base44.asServiceRole.entities;
  const sites = await S.Site.filter({ organisation_id: orgId, status: "active" }).catch(() => []);
  const reports = [];
  // org-consolidated
  reports.push({ scope: "organisation", ...(await generateForScope(base44, orgId, null, orgName, opts)) });
  for (const site of sites) {
    try { reports.push({ scope: "site", site_id: site.id, site_name: site.name, ...(await generateForScope(base44, orgId, site.id, orgName, opts)) }); }
    catch (e: any) { reports.push({ scope: "site", site_id: site.id, error: e.message }); }
  }
  return { organisation_id: orgId, reports };
}

async function generateForScope(base44: any, orgId: string, siteId: string | null, orgName: string, opts: any) {
  const S = base44.asServiceRole.entities;
  const actorUserId = opts.actor_user_id || "system";
  const isScheduled = !!opts.is_scheduled;

  // Determine the report week. Default = most recently COMPLETED ISO week.
  // use_current_week (setting or body) → current week. Explicit week_start/week_end override.
  let weekStart = opts.week_start, weekEnd = opts.week_end;
  if (!weekStart || !weekEnd) {
    const todayRange = isoWeekRange(today());
    const wantCurrent = opts.use_current_week;
    if (wantCurrent) { weekStart = todayRange.weekStart; weekEnd = todayRange.weekEnd; }
    else { const prev = previousWeekRange(todayRange.weekStart); weekStart = prev.weekStart; weekEnd = prev.weekEnd; }
  }

  // Load current (latest-period) metrics + full history.
  const { metrics: currentMetrics, historyMap, periodStart, periodEnd } = await loadMetrics(base44, { orgId, siteId });

  // Derive prior period from history.
  const { prior: prevP } = latestTwoPeriods(historyMap);
  let prevMetrics = metricsAtPeriod(historyMap, prevP);
  if (prevP) {
    try {
      const priorEnd = (historyMap.revenue || []).find((r) => r.period === prevP);
      const priorScore = await getCurrentOwnerScore(base44, { orgId, siteId, periodStart: prevP, periodEnd: priorEnd?.period_end || prevP });
      if (priorScore?.score?.value != null) prevMetrics.owner_score = priorScore.score.value;
    } catch {}
  }
  // Ensure current owner_score present.
  if (currentMetrics.owner_score == null) {
    try {
      const os = await getCurrentOwnerScore(base44, { orgId, siteId, periodStart, periodEnd });
      if (os?.score?.value != null) currentMetrics.owner_score = os.score.value;
    } catch {}
  }

  const deltas = computeDeltas(currentMetrics, prevMetrics);

  // Activity within the report week (shared loader).
  const act = await loadWeeklyActivity(base44, { orgId, siteId, weekStart, weekEnd });
  const { activity, goalsInWeek, initsInWeek, decsInWeek, alertsInWeek, oppsInWeek } = act;

  const summary = buildSummary({ weekStart, weekEnd, deltas, activity });

  // Settings (for delivery behaviour).
  let settings: any = { send_email: false, enabled: true, recipient_user_id: null, use_current_week: false };
  try {
    const srecs = await S.WeeklyReportSetting.filter({ organisation_id: orgId });
    const srec = srecs.find((r: any) => (r.site_id || null) === (siteId || null)) || srecs.find((r: any) => !r.site_id);
    if (srec) settings = srec;
  } catch {}

  const report: any = {
    week_start: weekStart, week_end: weekEnd,
    period_start: periodStart, period_end: periodEnd,
    generated_at: now(), engine_version: WEEKLY_ENGINE_VERSION,
    organisation_id: orgId, site_id: siteId,
    metrics: currentMetrics, deltas, activity, summary,
    goals: goalsInWeek.map((g: any) => ({ id: g.id, title: g.title, status: g.status, progress: g.progress_pct })),
    initiatives: initsInWeek.map((i: any) => ({ id: i.id, title: i.title, status: i.status, completion: i.completion_pct })),
    decisions: decsInWeek.map((d: any) => ({ id: d.id, decision: d.decision, date: d.decision_date, status: d.status, variance_pct: d.variance_pct })),
    alerts: alertsInWeek.map((a: any) => ({ id: a.id, title: a.title, severity: a.severity, status: a.status })),
    opportunities: oppsInWeek.map((o: any) => ({ id: o.id, title: o.title, status: o.status, priority: o.priority })),
  };

  // Persist (idempotent by report_key).
  const key = reportKey(orgId, siteId, weekStart);
  const summaryText = summary.headline + " · " + (summary.narrative || []).join(" ");
  const common = {
    payload: JSON.stringify(report), summary_text: summaryText,
    owner_score: currentMetrics.owner_score ?? null, revenue: currentMetrics.revenue ?? null,
    net_profit: currentMetrics.net_profit ?? null, cash: currentMetrics.cash ?? null,
    alerts_count: activity.alerts, goals_updated: activity.goals_updated,
    initiatives_updated: activity.initiatives_updated, decisions_count: activity.decisions,
    status: "published", generated_at: now(), engine_version: WEEKLY_ENGINE_VERSION,
  };
  const existing = await S.WeeklyReport.filter({ organisation_id: orgId, report_key: key });
  let rec;
  if (existing.length) {
    rec = await S.WeeklyReport.update(existing[0].id, { ...common, delivered_via_email: false });
  } else {
    rec = await S.WeeklyReport.create({ organisation_id: orgId, site_id: siteId, report_key: key, week_start: weekStart, week_end: weekEnd, ...common, delivered_via_email: false });
  }

  await publishEvent(base44, { orgId, siteId, eventKey: "weekly_report.generated", entityType: "WeeklyReport", entityId: rec.id, message: `Weekly report ${weekStart}→${weekEnd} generated`, actorUserId, details: JSON.stringify({ activity }) });
  await writeAudit(base44, { orgId, siteId, actionType: "create", entityType: "WeeklyReport", entityId: rec.id, actorUserId, afterState: summaryText, reason: "weekly report generated" });

  // Email delivery to a registered admin (if enabled or explicitly requested).
  let delivered = false;
  const wantEmail = opts.send_email || (settings.send_email && isScheduled);
  if (wantEmail) {
    try {
      let toEmail: string | null = null;
      if (settings.recipient_user_id) {
        const u = await base44.asServiceRole.entities.User.get(settings.recipient_user_id).catch(() => null);
        if (u?.email) toEmail = u.email;
      }
      if (!toEmail) {
        const users = await base44.asServiceRole.entities.User.filter({}, "-created_date", 1000);
        const admin = users.find((u: any) => u.role === "admin" || (u.data || {}).system_role === "owner");
        if (admin?.email) toEmail = admin.email;
      }
      if (toEmail) {
        await base44.integrations.Core.SendEmail({ to: toEmail, subject: `${orgName} — Weekly Report ${weekStart} → ${weekEnd}`, body: formatEmailBody(report, orgName) });
        await S.WeeklyReport.update(rec.id, { delivered_via_email: true });
        delivered = true;
      }
    } catch {}
  }

  // In-app notification for the acting user (manual) or first admin (scheduled).
  try {
    let notifUserId = actorUserId !== "system" ? actorUserId : null;
    await S.Notification.create({
      organisation_id: orgId, user_id: notifUserId,
      notification_type: "weekly_report", delivery_channel: "in_app",
      title: `Weekly report ${weekStart}→${weekEnd}`, body: summaryText,
      severity: "info", status: "unread",
      related_entity_type: "WeeklyReport", related_entity_id: rec.id,
    });
  } catch {}

  return { report_id: rec.id, week_start: weekStart, week_end: weekEnd, delivered_via_email: delivered, report };
}