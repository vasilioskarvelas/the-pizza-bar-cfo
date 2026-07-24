import React, { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Collapsible, favourite-able widget wrapper. Persists per-user state via getDashboardWidgets.
export default function WidgetSection({ widgetKey, title, children }) {
  const [state, setState] = useState({ collapsed: false, favourite: false });
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    base44.functions.invoke("getDashboardWidgets", {}).then((r) => {
      const w = (r.widgets || []).find((x) => x.widget_key === widgetKey);
      if (w) { setState({ collapsed: !!w.collapsed, favourite: !!w.favourite }); }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [widgetKey]);

  const toggleCollapse = () => {
    const next = { ...state, collapsed: !state.collapsed };
    setState(next);
    base44.functions.invoke("getDashboardWidgets", { action: "save", widgets: [{ widget_key: widgetKey, ...next }] }).catch(() => {});
  };
  const toggleFav = () => {
    const next = { ...state, favourite: !state.favourite };
    setState(next);
    base44.functions.invoke("getDashboardWidgets", { action: "save", widgets: [{ widget_key: widgetKey, ...next }] }).catch(() => {});
  };

  return (
    <section className="mb-1">
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
          <button onClick={toggleFav} className={`ml-1 ${state.favourite ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}`} title="Favourite"><Star className="w-3.5 h-3.5" fill={state.favourite ? "currentColor" : "none"} /></button>
          <button onClick={toggleCollapse} className="ml-auto text-zinc-500 hover:text-zinc-300" title="Collapse"><ChevronDown className={`w-4 h-4 transition-transform ${state.collapsed ? "-rotate-90" : ""}`} /></button>
        </div>
      )}
      {(!state.collapsed || !loaded) && children}
    </section>
  );
}