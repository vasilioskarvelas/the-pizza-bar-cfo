import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAccess, isPlatformAdmin, isOwner } from '@/lib/accessService';
import { Shield, Users, KeyRound, Lock, Building2, ScrollText, ArrowLeft, Plug, History, Activity, GitCompareArrows, AlertTriangle, BookMarked, Spline, Calculator, Coins, Gauge, GitBranch, Receipt, LayoutDashboard, Bell, Sun, Database, Calendar, Sliders, TrendingUp, Target, Rocket, Map as MapIcon, ShieldAlert, Lightbulb, Gavel, FileText, Copy, Layers } from 'lucide-react';

const NAV = [
  { to: '/admin/users', label: 'Users', icon: Users, perm: null },
  { to: '/admin/roles', label: 'Roles', icon: KeyRound, perm: null },
  { to: '/admin/permissions', label: 'Permissions', icon: Lock, perm: null },
  { to: '/admin/site-access', label: 'Site Access', icon: Building2, perm: null },
  { to: '/admin/security', label: 'Security Status', icon: ScrollText, perm: 'audit.read' },
  { to: '/admin/connectors', label: 'Connectors', icon: Plug, perm: null },
  { to: '/admin/imports', label: 'Import History', icon: History, perm: null },
  { to: '/admin/sync', label: 'Sync Status', icon: Activity, perm: null },
  { to: '/admin/reconciliation', label: 'Reconciliation', icon: GitCompareArrows, perm: null },
  { to: '/admin/exceptions', label: 'Exceptions', icon: AlertTriangle, perm: null },
  { to: '/admin/account-mapping', label: 'Account Mapping', icon: BookMarked, perm: null },
  { to: '/admin/source-mapping', label: 'Source Mapping', icon: Spline, perm: null },
  { to: '/admin/calc-runs', label: 'Calculation Runs', icon: Calculator, perm: null },
  { to: '/admin/financial-results', label: 'Financial Results', icon: Coins, perm: null },
  { to: '/admin/kpi-results', label: 'KPI Results', icon: Gauge, perm: null },
  { to: '/admin/calc-lineage', label: 'Calc Lineage', icon: GitBranch, perm: null },
  { to: '/admin/tax-results', label: 'Tax Results', icon: Receipt, perm: null },
  { to: '/admin/engine-status', label: 'Engine Status', icon: Activity, perm: null },
  { to: '/admin/dashboard-config', label: 'Dashboard Config', icon: LayoutDashboard, perm: null },
  { to: '/admin/widgets', label: 'Widgets', icon: LayoutDashboard, perm: null },
  { to: '/admin/alert-rules', label: 'Alert Rules', icon: Bell, perm: null },
  { to: '/admin/brief-rules', label: 'Brief Rules', icon: Sun, perm: null },
  { to: '/admin/dashboard-cache', label: 'Dashboard Cache', icon: Database, perm: null },
  { to: '/admin/notification-rules', label: 'Notification Rules', icon: Bell, perm: null },
  { to: '/admin/forecast-config', label: 'Forecast Config', icon: Gauge, perm: null },
  { to: '/admin/forecast-assumptions', label: 'Forecast Assumptions', icon: Gauge, perm: null },
  { to: '/admin/scenario-management', label: 'Scenarios', icon: GitBranch, perm: null },
  { to: '/admin/timeline-config', label: 'Timeline Config', icon: Calendar, perm: null },
  { to: '/admin/simulation-rules', label: 'Simulation Rules', icon: Sliders, perm: null },
  { to: '/admin/forecast-cache', label: 'Forecast Cache', icon: Database, perm: null },
  // Phase 09 — Executive Planning
  { to: '/admin/goal-categories', label: 'Goal Categories', icon: Layers, perm: null },
  { to: '/admin/initiative-templates', label: 'Initiative Templates', icon: Copy, perm: null },
  { to: '/admin/report-templates', label: 'Report Templates', icon: FileText, perm: null },
  { to: '/admin/risk-rules', label: 'Risk Rules', icon: ShieldAlert, perm: null },
  { to: '/admin/opportunity-rules', label: 'Opportunity Rules', icon: Lightbulb, perm: null },
  { to: '/admin/executive-settings', label: 'Exec Settings', icon: Sliders, perm: null },
];

export default function AdminLayout() {
  const ctx = useAccess();
  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!isPlatformAdmin(ctx)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 gap-3 px-6 text-center">
        <Shield className="w-8 h-8 text-rose-400" />
        <h1 className="text-lg font-semibold">Administrator access required</h1>
        <p className="text-sm text-zinc-500 max-w-sm">This administration area is restricted to owners and administrators. Your current role does not grant access.</p>
        <Link to="/" className="text-amber-400 text-sm hover:underline">Back to Foundation</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 mb-4">
          <Shield className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-sm font-semibold leading-tight">HFOS Admin</p>
            <p className="text-[10px] text-zinc-500 leading-tight">Phase 02 · Access Control</p>
          </div>
        </div>
        {NAV.map((n) => {
          const allowed = !n.perm || ctx.permissions?.has(n.perm) || isOwner(ctx);
          if (!allowed) return null;
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'}`
              }
            >
              <Icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          );
        })}
        <div className="mt-auto pt-4 border-t border-zinc-800 space-y-1">
          <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
          <Link to="/forecast" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <TrendingUp className="w-4 h-4" /> Forecast
          </Link>
          <Link to="/goals" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <Target className="w-4 h-4" /> Goals
          </Link>
          <Link to="/scorecard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <Gauge className="w-4 h-4" /> Scorecard
          </Link>
          <Link to="/roadmap" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <MapIcon className="w-4 h-4" /> Roadmap
          </Link>
          <Link to="/risks" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <ShieldAlert className="w-4 h-4" /> Risks
          </Link>
          <Link to="/opportunities" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <Lightbulb className="w-4 h-4" /> Opportunities
          </Link>
          <Link to="/reports" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <FileText className="w-4 h-4" /> Reports
          </Link>
          <Link to="/timeline" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50">
            <Calendar className="w-4 h-4" /> Timeline
          </Link>
          <Link to="/foundation" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50">
            <ArrowLeft className="w-4 h-4" /> Foundation
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}