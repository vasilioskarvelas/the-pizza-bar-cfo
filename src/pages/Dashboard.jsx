import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Bell, TrendingUp, CalendarClock, GitBranch } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardToolbar from '@/components/dashboard/DashboardToolbar';
import Hero from '@/components/dashboard/Hero';
import KpiGrid from '@/components/dashboard/KpiGrid';
import BusinessHealth from '@/components/dashboard/BusinessHealth';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import OwnerBriefCard from '@/components/dashboard/OwnerBriefCard';
import TrendChart from '@/components/dashboard/TrendChart';
import ReconciliationOverview from '@/components/dashboard/ReconciliationOverview';
import ConnectorHealth from '@/components/dashboard/ConnectorHealth';
import ActivityTimeline from '@/components/dashboard/ActivityTimeline';
import DrillDownModal from '@/components/dashboard/DrillDownModal';
import WidgetSection from '@/components/dashboard/WidgetSection';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [sites, setSites] = useState([]);
  const [period, setPeriod] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [drill, setDrill] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, brf] = await Promise.all([
        base44.functions.invoke("getExecutiveDashboard", { period_start: period?.periodStart, period_end: period?.periodEnd, site_id: siteId }),
        base44.functions.invoke("getOwnerBrief", { period_start: period?.periodStart, period_end: period?.periodEnd, site_id: siteId }).catch(() => null),
      ]);
      setData(dash); setBrief(brf?.brief || null);
      if (!period && dash?.period) setPeriod(dash.period);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period, siteId]);

  useEffect(() => { base44.entities.Site.list().then((s) => setSites(s || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (period) await base44.functions.invoke("refreshDashboard", { period_start: period.periodStart, period_end: period.periodEnd, site_id: siteId });
      await load();
    } catch (e) { console.error(e); }
    setRefreshing(false);
  };

  const onDrillCard = (card) => setDrill({ kind: "kpi", result_id: card.result_id, title: `${card.label} — drill-down` });
  const onDrillScore = () => data?.owner_score_result_id && setDrill({ kind: "owner", result_id: data.owner_score_result_id, title: "Owner Score — full breakdown" });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Shield className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Executive Dashboard</h1>
            <p className="text-xs text-zinc-500">HFOS · every value sourced from the deterministic Phase 05/06 engines</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/forecast" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><TrendingUp className="w-3.5 h-3.5" /> Forecast</Link>
            <Link to="/timeline" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><CalendarClock className="w-3.5 h-3.5" /> Timeline</Link>
            <Link to="/scenarios" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><GitBranch className="w-3.5 h-3.5" /> Scenarios</Link>
            <Link to="/obligations" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><CalendarClock className="w-3.5 h-3.5" /> Obligations</Link>
            <Link to="/notifications" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><Bell className="w-3.5 h-3.5" /> Alerts</Link>
          </div>
          <Link to="/foundation" className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Foundation</Link>
          <Link to="/admin/users" className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Admin →</Link>
        </div>

        <DashboardToolbar period={period} siteId={siteId} sites={sites} loading={loading || refreshing}
          onPeriod={setPeriod} onSite={setSiteId} onRefresh={refresh} />

        {loading && !data ? (
          <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : !data ? (
          <div className="text-center py-24 text-zinc-500">Unable to load dashboard.</div>
        ) : (
          <div className="space-y-4">
            <WidgetSection widgetKey="hero" title="">
              <Hero ownerScore={data.owner_score} onClick={onDrillScore} />
            </WidgetSection>
            <WidgetSection widgetKey="kpi" title="Executive KPI Cards">
              <KpiGrid cards={data.kpi_cards} onDrill={onDrillCard} />
            </WidgetSection>
            <WidgetSection widgetKey="health" title="Business Health">
              <BusinessHealth items={data.business_health} />
            </WidgetSection>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1"><WidgetSection widgetKey="alerts" title="Alerts"><AlertsPanel alerts={data.alerts} summary={data.alerts_summary} onChanged={load} /></WidgetSection></div>
              <div className="lg:col-span-2"><WidgetSection widgetKey="brief" title="Daily Owner Brief"><OwnerBriefCard brief={brief} loading={refreshing} onRegenerate={load} /></WidgetSection></div>
            </div>
            <WidgetSection widgetKey="trend" title="Trends"><TrendChart siteId={siteId} /></WidgetSection>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WidgetSection widgetKey="recon" title="Reconciliation"><ReconciliationOverview recon={data.reconciliation} /></WidgetSection>
              <WidgetSection widgetKey="connectors" title="Connectors"><ConnectorHealth connectors={data.connectors} /></WidgetSection>
            </div>
            <WidgetSection widgetKey="timeline" title="Activity Timeline"><ActivityTimeline siteId={siteId} /></WidgetSection>
            <p className="text-[11px] text-zinc-600 text-center py-3">Phase 08 · Forecast, Timeline & Scenarios are deterministic and isolated from live data — explore them via the links above.</p>
          </div>
        )}
      </div>
      {drill && <DrillDownModal target={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}