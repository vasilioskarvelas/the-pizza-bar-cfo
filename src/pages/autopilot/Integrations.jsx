import React from 'react';
import { Plug, Check, Clock } from 'lucide-react';

const INTEGRATIONS = [
  { name: 'Xero', category: 'Accounting', status: 'connected' },
  { name: 'Square', category: 'POS', status: 'connected' },
  { name: 'Deputy', category: 'Payroll', status: 'connected' },
  { name: 'Stripe', category: 'Payments', status: 'available' },
  { name: 'MYOB', category: 'Accounting', status: 'available' },
  { name: 'QuickBooks', category: 'Accounting', status: 'available' },
  { name: 'Employment Hero', category: 'Payroll', status: 'available' },
  { name: 'Lightspeed', category: 'POS', status: 'available' },
  { name: 'Shopify', category: 'Ecommerce', status: 'coming_soon' },
  { name: 'ServiceM8', category: 'Trades', status: 'coming_soon' },
  { name: 'Fergus', category: 'Trades', status: 'coming_soon' },
  { name: 'Uber Eats', category: 'Delivery', status: 'available' },
  { name: 'DoorDash', category: 'Delivery', status: 'available' },
];

const TONE = {
  connected: { chip: 'bg-emerald-100 text-emerald-700', icon: Check, label: 'Connected' },
  available: { chip: 'bg-slate-100 text-slate-600', icon: Plug, label: 'Available' },
  coming_soon: { chip: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Coming soon' },
};

export default function Integrations() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Integrations</h1>
      <p className="text-slate-500 mt-1">Connect your accounting, POS, payroll and delivery platforms. Sample data is loaded for demonstration.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {INTEGRATIONS.map((i) => {
          const t = TONE[i.status];
          const Icon = t.icon;
          return (
            <div key={i.name} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{i.name}</p>
                <p className="text-xs text-slate-500">{i.category}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${t.chip}`}><Icon className="w-3 h-3" /> {t.label}</span>
                {i.status === 'available' && <button className="text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800">Connect</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-6 text-sm text-slate-500">
        Connected integrations feed the deterministic calculation engine. Disconnected platforms show as "Available" — no live data is simulated.
      </div>
    </div>
  );
}