// Business Autopilot — deterministic financial metric engine.
// NO generative AI here. All figures are computed from stored MetricSnapshots.
import { base44 } from '@/api/base44Client';

export const DEMO_ORG = 'demo-pizza-bar';
export const DEMO_BUSINESS = 'pizza-bar-strathmore';
export const DEMO_LOCATION = 'strathmore';

export function formatAUD(cents, withCents = false) {
  if (cents == null || Number.isNaN(cents)) return '—';
  const n = Number(cents);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const c = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-AU')}${withCents ? '.' + String(c).padStart(2, '0') : ''}`;
}

export function formatSignedAUD(cents) {
  if (cents == null || Number.isNaN(cents)) return '—';
  if (cents === 0) return '$0';
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatAUD(Math.abs(cents))}`;
}

export function formatPct(p, decimals = 1) {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Number(p).toFixed(decimals)}%`;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export async function loadSnapshots(businessId = DEMO_BUSINESS, limit = 400) {
  const rows = await base44.entities.MetricSnapshot.filter({ business_id: businessId }, '-period_start', limit);
  return rows.sort((a, b) => (a.period_start < b.period_start ? -1 : 1));
}

export function latest(snapshots) {
  if (!snapshots || !snapshots.length) return null;
  return snapshots[snapshots.length - 1];
}

export function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function findOnOrBefore(snapshots, dateStr) {
  let best = null;
  for (const s of snapshots) {
    if (s.period_start <= dateStr && (!best || s.period_start > best.period_start)) best = s;
  }
  return best;
}

function diff(cur, prev) {
  if (cur == null || prev == null) return null;
  const abs = cur - prev;
  const pct = prev === 0 ? null : (abs / Math.abs(prev)) * 100;
  return { abs, pct };
}

const COMPARE_FIELDS = ['revenue', 'gross_profit', 'operating_profit', 'cash_position', 'labour_pct', 'cogs_pct', 'outstanding_receivables', 'bills_due', 'tax_obligations'];

export function comparePeriods(snapshots) {
  const cur = latest(snapshots);
  if (!cur) return { current: null, deltas: {}, refDate: null };
  const ref = cur.period_start;
  const yesterday = findOnOrBefore(snapshots, shiftDate(ref, -1));
  const lastWeek = findOnOrBefore(snapshots, shiftDate(ref, -7));
  const lastMonth = findOnOrBefore(snapshots, shiftDate(ref, -30));
  const lastYear = findOnOrBefore(snapshots, shiftDate(ref, -365));
  const deltas = {};
  for (const f of COMPARE_FIELDS) {
    deltas[f] = {
      vs_yesterday: diff(cur[f], yesterday?.[f]),
      vs_last_week: diff(cur[f], lastWeek?.[f]),
      vs_last_month: diff(cur[f], lastMonth?.[f]),
      vs_last_year: diff(cur[f], lastYear?.[f]),
    };
  }
  return { current: cur, deltas, refDate: ref, yesterday, lastWeek, lastMonth, lastYear };
}

// Deterministic Business Health Score 0–100.
export function computeHealthScore(m) {
  if (!m) return 0;
  let score = 0;
  const opMargin = m.revenue > 0 ? (m.operating_profit / m.revenue) * 100 : 0;
  score += clamp(opMargin * 2, 0, 30); // 15% operating margin -> 30 pts
  const cashCover = m.revenue > 0 ? m.cash_position / (m.revenue * 30) : 0;
  score += clamp(cashCover * 25, 0, 25);
  const labourPenalty = Math.max(0, (m.labour_pct || 0) - 28);
  score += clamp(20 - labourPenalty * 2, 0, 20);
  const cogsPenalty = Math.max(0, (m.cogs_pct || 0) - 30);
  score += clamp(15 - cogsPenalty * 2, 0, 15);
  const obligations = (m.bills_due || 0) + (m.tax_obligations || 0);
  const cover = obligations > 0 ? Math.min(1, (m.outstanding_receivables || 0) / obligations) : 1;
  score += cover * 10;
  return Math.round(clamp(score, 0, 100));
}

export function healthLabel(score) {
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Healthy';
  if (score >= 50) return 'Watch';
  if (score >= 35) return 'At Risk';
  return 'Critical';
}

export function healthColor(score) {
  if (score >= 65) return 'emerald';
  if (score >= 50) return 'amber';
  if (score >= 35) return 'orange';
  return 'rose';
}

// Deterministic cash forecast from recent average daily net cash flow.
export function cashForecast(snapshots, days) {
  const cur = latest(snapshots);
  if (!cur) return { projected: null, avgNet: 0, shortfall: null };
  const recent = snapshots.slice(-14);
  const avgNet = recent.length ? recent.reduce((s, r) => s + (r.net_cash_flow || 0), 0) / recent.length : 0;
  const projected = cur.cash_position + avgNet * days;
  const shortfall = projected < 1000000 ? { amount: 1000000 - projected, days } : null;
  return { projected, avgNet, shortfall, current: cur.cash_position };
}

export function sum(arr, field) {
  return (arr || []).reduce((s, r) => s + (r[field] || 0), 0);
}