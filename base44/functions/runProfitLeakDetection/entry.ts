import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { runAllRules, DEFAULT_CONFIG } from "../../shared/profitLeakEngine.ts";

// runProfitLeakDetection — deterministic profit leak detection. No AI.
// Loads source data for a business, runs all rules, and upserts ProfitLeak
// records (dedup by leak_key). Admin-only. Service role used for reads/writes
// after the admin check so detection works across the org's businesses.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const businessId = body.business_id || "pizza-bar-strathmore";
    const orgId = body.organisation_id || "demo-pizza-bar";
    const cfg = { ...DEFAULT_CONFIG, ...(body.config || {}) };

    const S = base44.asServiceRole.entities;
    const [snapshots, supplierInvoiceLines, expenses, channelSales, receivables, menuItems, existing] = await Promise.all([
      S.MetricSnapshot.filter({ business_id: businessId }, "-period_start", 400),
      S.SupplierInvoiceLine.filter({ business_id: businessId }, "invoice_date", 500),
      S.ExpenseTransaction.filter({ business_id: businessId }, "date", 500),
      S.ChannelSale.filter({ business_id: businessId }, "date", 1000),
      S.ReceivableInvoice.filter({ business_id: businessId }, "due_date", 200),
      S.MenuItem.filter({ business_id: businessId }, "-sales_quantity", 200),
      S.ProfitLeak.filter({ business_id: businessId }, "-last_detected", 500),
    ]);

    const leaks = runAllRules({ snapshots, supplierInvoiceLines, expenses, channelSales, receivables, menuItems }, cfg);

    if (body.debug) {
      const asc = [...snapshots].sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
      const last7 = asc.slice(-7);
      const curRev = last7.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
      const curLab = last7.reduce((s, r) => s + (Number(r.labour_cents) || 0), 0);
      const sample = last7[0];
      // Replicate the engine's same-day baseline for the last day
      const d = last7[last7.length - 1];
      const dow = new Date(d.period_start + "T00:00:00Z").getUTCDay();
      const prior = asc.filter((s) => s.period_start < d.period_start && new Date(s.period_start + "T00:00:00Z").getUTCDay() === dow).slice(-4);
      const pRev = prior.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
      const pLab = prior.reduce((s, r) => s + (Number(r.labour_cents) || 0), 0);
      return Response.json({
        debug: {
          snapCount: snapshots.length,
          curRev, curLab, curPct: curRev > 0 ? +((curLab / curRev) * 100).toFixed(2) : 0,
          sampleLabourCents: sample?.labour_cents, sampleRevenue: sample?.revenue,
          lastDate: d.period_start, dow,
          priorDates: prior.map((r) => r.period_start),
          priorRev: pRev, priorLab: pLab, priorPct: pRev > 0 ? +((pLab / pRev) * 100).toFixed(2) : 0,
          expCount: expenses.length, chanCount: channelSales.length, linesCount: supplierInvoiceLines.length, recvCount: receivables.length,
        },
      });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const byKey = {};
    for (const e of existing) byKey[e.leak_key] = e;

    let created = 0, updated = 0, skipped = 0;
    for (const l of leaks) {
      const evidenceStr = JSON.stringify(l.evidence);
      const sourcesStr = JSON.stringify(l.source_systems);
      const peak = l.monthly_impact_cents || l.annual_impact_cents || 0;
      const ex = byKey[l.leak_key];
      if (ex && (ex.status === "dismissed" || ex.status === "realised")) { skipped++; continue; }
      if (ex) {
        await S.ProfitLeak.update(ex.id, {
          last_detected: now,
          current_value: l.current_value, baseline_value: l.baseline_value, variance: l.variance, variance_pct: l.variance_pct,
          weekly_impact_cents: l.weekly_impact_cents, monthly_impact_cents: l.monthly_impact_cents, annual_impact_cents: l.annual_impact_cents,
          confidence_score: l.confidence_score, severity: l.severity, evidence: evidenceStr, source_systems: sourcesStr,
          explanation: l.explanation, title: l.title, recommended_action: l.recommended_action,
          peak_impact_cents: Math.max(ex.peak_impact_cents || 0, peak),
        });
        updated++;
      } else {
        await S.ProfitLeak.create({
          organisation_id: orgId, business_id: businessId, industry: cfg.industry,
          leak_key: l.leak_key, category: l.category, leak_type: l.leak_type,
          title: l.title, explanation: l.explanation,
          detected_date: today,
          current_value: l.current_value, baseline_value: l.baseline_value, variance: l.variance, variance_pct: l.variance_pct,
          weekly_impact_cents: l.weekly_impact_cents, monthly_impact_cents: l.monthly_impact_cents, annual_impact_cents: l.annual_impact_cents,
          confidence_score: l.confidence_score, severity: l.severity,
          evidence: evidenceStr, source_systems: sourcesStr,
          recommended_action: l.recommended_action, action_difficulty: l.action_difficulty,
          status: "identified", first_detected: now, last_detected: now, peak_impact_cents: peak,
        });
        created++;
      }
    }

    return Response.json({
      business_id: businessId,
      detected: leaks.length,
      created, updated, skipped,
      categories: leaks.map((l) => l.category),
      generated_at: now,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}