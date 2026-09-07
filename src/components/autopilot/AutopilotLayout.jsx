import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Sunrise, TrendingDown, Wallet, BarChart3, Receipt, Users, PieChart, Sparkles, CheckSquare, Trophy, Plug, Settings, Building2 } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/daily-brief', label: 'Daily Brief', icon: Sunrise },
  { to: '/profit-leaks', label: 'Profit Leaks', icon: TrendingDown },
  { to: '/cash-flow', label: 'Cash Flow', icon: Wallet },
  { to: '/revenue', label: 'Revenue', icon: BarChart3 },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/labour', label: 'Labour', icon: Users },
  { to: '/profitability', label: 'Profitability', icon: PieChart },
  { to: '/ask', label: 'Ask My Business', icon: Sparkles },
  { to: '/actions', label: 'Action Centre', icon: CheckSquare },
  { to: '/value', label: 'Value Created', icon: Trophy },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AutopilotLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white text-sm font-bold">BA</div>
            <div>
              <p className="text-sm font-semibold leading-tight">Business Autopilot</p>
              <p className="text-[11px] text-slate-400 leading-tight">Profit optimisation</p>
            </div>
          </div>
        </div>
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-500" />
            <div className="text-xs">
              <p className="font-medium text-slate-700">Pizza Bar Strathmore</p>
              <p className="text-slate-400">Karvelas Group</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-slate-200">
          <Link to="/foundation" className="text-xs text-slate-400 hover:text-slate-600">Legacy foundation →</Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}