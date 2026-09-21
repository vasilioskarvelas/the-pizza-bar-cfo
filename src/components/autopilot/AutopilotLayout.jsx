import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Sunrise, TrendingDown, Wallet, BarChart3, Receipt, Users, PieChart, Sparkles, CheckSquare, Trophy, Plug, Settings, Building2, CalendarDays, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/last-week', label: 'Last Week', icon: CalendarDays },
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
  // Mobile: sidebar becomes a slide-over drawer behind a top bar. Desktop (md+): unchanged fixed sidebar.
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  const current = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) || NAV[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b border-slate-200">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="-ml-2 p-2 rounded-lg text-slate-700 hover:bg-slate-100">
          <Menu className="w-5 h-5" />
        </button>
        <p className="font-semibold text-slate-900 truncate">{current.label}</p>
      </header>

      {open && <div className="md:hidden fixed inset-0 z-40 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 shrink-0 border-r border-slate-200 bg-white flex flex-col`}>
        <div className="px-5 py-5 border-b border-slate-200 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white text-sm font-bold">BA</div>
            <div>
              <p className="text-sm font-semibold leading-tight">Business Autopilot</p>
              <p className="text-[11px] text-slate-400 leading-tight">Profit optimisation</p>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="md:hidden -mr-2 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
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
                `flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
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
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
