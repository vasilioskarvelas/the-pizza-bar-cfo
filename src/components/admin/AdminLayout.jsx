import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAccess, isPlatformAdmin, isOwner } from '@/lib/accessService';
import { Shield, Users, KeyRound, Lock, Building2, ScrollText, ArrowLeft } from 'lucide-react';

const NAV = [
  { to: '/admin/users', label: 'Users', icon: Users, perm: null },
  { to: '/admin/roles', label: 'Roles', icon: KeyRound, perm: null },
  { to: '/admin/permissions', label: 'Permissions', icon: Lock, perm: null },
  { to: '/admin/site-access', label: 'Site Access', icon: Building2, perm: null },
  { to: '/admin/security', label: 'Security Status', icon: ScrollText, perm: 'audit.read' },
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
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50">
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