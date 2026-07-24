// Financial calculation engine — pure, deterministic functions.
// Per HFOS §6: every calculation is a named, versioned, individually tested function.
// No I/O, no randomness, no clock reads except explicit as-at parameters.

export function formatCurrency(amount, opts = {}) {
  const { compact = false } = opts;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(amount || 0);
}

export function formatNumber(value, decimals = 1) {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

export function formatPct(value, decimals = 1) {
  return `${formatNumber(value, decimals)}%`;
}

// §6.1 Revenue
export function computeNetSales(transactions) {
  return (transactions || []).reduce((sum, t) => sum + (t.net_sales || 0), 0);
}

export function computeGrossSales(transactions) {
  return (transactions || []).reduce((sum, t) => sum + (t.gross_sales || 0), 0);
}

export function computeTransactionCount(transactions) {
  return (transactions || []).reduce((sum, t) => sum + (t.transaction_count || 0), 0);
}

export function computeATV(transactions) {
  const count = computeTransactionCount(transactions);
  if (!count) return 0;
  return computeNetSales(transactions) / count;
}

// §6.2 COGS (purchases method)
export function computeCOGS(invoices) {
  return (invoices || []).reduce((sum, i) => sum + (i.amount_excl || 0), 0);
}

// §6.4 Labour
export function computeLabour(payRuns) {
  return (payRuns || []).reduce(
    (sum, p) => sum + (p.gross_wages || 0) + (p.super || 0) + (p.payroll_tax || 0),
    0
  );
}

export function computeLabourHours(payRuns) {
  return (payRuns || []).reduce((sum, p) => sum + (p.total_hours || 0), 0);
}

// §6.3 Gross Profit
export function computeGrossProfit(netSales, cogs) {
  return netSales - cogs;
}

export function computeGrossProfitPct(netSales, cogs) {
  if (!netSales) return 0;
  return ((netSales - cogs) / netSales) * 100;
}

// §6.4 Prime Cost
export function computePrimeCost(cogs, labour) {
  return cogs + labour;
}

export function computePrimeCostPct(cogs, labour, netSales) {
  if (!netSales) return 0;
  return ((cogs + labour) / netSales) * 100;
}

export function computeLabourPct(labour, netSales) {
  if (!netSales) return 0;
  return (labour / netSales) * 100;
}

// §6.6 EBITDA (simplified for dashboard)
export function computeEBITDA(grossProfit, labour, opex) {
  return grossProfit - labour - (opex || 0);
}

// §6.8 Available cash
export function computeAvailableCash(bankTotal, commitments7d, unfundedTax30d) {
  return bankTotal - (commitments7d || 0) - (unfundedTax30d || 0);
}

// §6.9 Cash runway
export function computeCashRunway(availableCash, weeklyBurn) {
  if (!weeklyBurn || weeklyBurn <= 0) return null;
  return availableCash / weeklyBurn;
}

// Tax funded percentage
export function computeTaxFundedPct(obligations) {
  const dueSoon = (obligations || []).filter(
    (o) => o.status !== 'paid'
  );
  if (!dueSoon.length) return 100;
  const totalAmount = dueSoon.reduce((s, o) => s + (o.amount || 0), 0);
  const totalFunded = dueSoon.reduce((s, o) => s + (o.funded_amount || 0), 0);
  if (!totalAmount) return 100;
  return (totalFunded / totalAmount) * 100;
}

export function computeUnfundedTax(obligations) {
  return (obligations || []).reduce((sum, o) => {
    if (o.status === 'paid') return sum;
    return sum + Math.max(0, (o.amount || 0) - (o.funded_amount || 0));
  }, 0);
}

// §7 KPI status evaluation
export function getKPIStatus(value, target, warning, critical, direction = 'lower') {
  if (direction === 'lower') {
    if (value <= target) return 'good';
    if (value <= warning) return 'warning';
    if (value >= critical) return 'critical';
    return 'warning';
  }
  // higher is better
  if (value >= target) return 'good';
  if (value >= warning) return 'warning';
  return 'critical';
}

export const STATUS_COLORS = {
  good: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-rose-400',
};

export const STATUS_BG = {
  good: 'bg-emerald-500/10 border-emerald-500/20',
  warning: 'bg-amber-500/10 border-amber-500/20',
  critical: 'bg-rose-500/10 border-rose-500/20',
};