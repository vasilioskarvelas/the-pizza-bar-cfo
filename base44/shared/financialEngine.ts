// Phase 05 — Deterministic financial & tax calculation engine (PURE, no I/O).
// No base44, no Deno — fully unit-testable. All financial figures are integer
// minor units (cents); percentages are integer basis points (bps); ratios are
// integer x10000 (4 dp). No binary floating-point aggregation of money.
//
// Conventions (locked ERD, no schema change):
//  - Account.account_type (free-form) carries fine classification; Account.class
//    enum is the fallback. Recognised account_type values documented in CODE_TYPE.
//  - Canonical input txns (Phase 04) store value as float major units, unit="AUD".
//    The RUNNER converts to cents at the read boundary; the engine never sees floats.
//  - Source amounts are SIGNED magnitudes: assets/expenses debit-normal (positive
//    increases), liabilities/equity/revenue credit-normal (positive); bank receipts
//    positive, payments negative; accumulated depreciation negative (contra-asset).

export const ENGINE_VERSION = "financial-engine-1.0";

// ---- Decimal-safe helpers -------------------------------------------------

// Convert a Phase-04 major-unit float to integer cents (round half-up).
export function toCents(major) {
  const n = Number(major) || 0;
  return Math.round(n * 100);
}
export function fromCents(c) { return (Number(c) || 0) / 100; }

// Basis points: 1 bp = 0.01%. 40.00% = 4000 bps.
export function toBps(pct) { return Math.round((Number(pct) || 0) * 100); }
export function fromBps(b) { return (Number(b) || 0) / 100; }

// Ratios scaled x10000 (4 dp). 2.5 = 25000.
export function toRatio(r) { return Math.round((Number(r) || 0) * 10000); }
export function fromRatio(r) { return (Number(r) || 0) / 10000; }

// Round half-up integer division: round(a / b) with b != 0.
export function roundDiv(a, b, scale = 1) {
  if (!b) return 0; // zero-denominator guard
  const x = (Number(a) || 0) * scale;
  const y = Number(b);
  // half-up rounding of x / y
  const sign = (x < 0) === (y < 0) ? 1 : -1;
  const q = Math.floor(Math.abs(x) / Math.abs(y));
  const rem = Math.abs(x) - q * Math.abs(y);
  let adj = 0;
  if (rem * 2 >= Math.abs(y)) adj = 1;
  return sign * (q + adj);
}

// Percentage (bps) = numerator / denominator * 10000, zero-denominator -> 0.
export function pctBps(num, den) { return roundDiv(num, den, 10000); }
// Ratio (x10000) = num / den.
export function ratioScaled(num, den) { return roundDiv(num, den, 10000); }

// ---- Account classification -------------------------------------------------

const CODE_TYPE = [
  "depreciation", "amortisation", "interest", "company_tax",
  "revenue", "cogs", "labour", "overhead",
  "bank", "cash", "accounts_receivable", "inventory",
  "current_asset", "fixed_asset", "accumulated_depreciation",
  "accounts_payable", "gst", "payg_withholding", "superannuation",
  "current_liability", "long_term_debt", "equity", "retained_earnings",
];

// Map an account (account_type + class) to a canonical line group + line code.
export function classifyAccount(accountType, accountClass) {
  const t = String(accountType || "").toLowerCase();
  const c = String(accountClass || "").toLowerCase();
  if (t.includes("depreciation") || t.includes("accumulated_depreciation")) {
    return t.includes("accumulated") ? { group: "bs", line: "accumulated_depreciation" } : { group: "pl", line: "depreciation" };
  }
  if (t.includes("amortis")) return { group: "pl", line: "amortisation" };
  if (t === "interest" || t.includes("interest")) return { group: "pl", line: "interest_expense" };
  if (t === "company_tax" || t.includes("company_tax") || t.includes("income_tax")) return { group: "pl", line: "tax_expense" };
  if (t === "revenue" || t === "income" || t === "sales" || c === "revenue") return { group: "pl", line: "revenue" };
  if (t === "cogs" || t === "cost_of_sales" || t === "directcosts" || c === "cogs") return { group: "pl", line: "cogs" };
  if (t === "labour" || c === "labour" || t.includes("wages") || t.includes("payroll")) return { group: "pl", line: "labour_cost" };
  if (t === "bank" || t === "cash") return { group: "bs", line: "cash" };
  if (t.includes("receivable") || t === "ar") return { group: "bs", line: "accounts_receivable" };
  if (t === "inventory" || t.includes("inventory")) return { group: "bs", line: "inventory" };
  if (t === "current_asset" || t === "other_current_asset") return { group: "bs", line: "other_current_assets" };
  if (t === "fixed_asset" || t.includes("fixed_asset")) return { group: "bs", line: "fixed_assets" };
  if (t.includes("payable") || t === "ap") return { group: "bs", line: "accounts_payable" };
  if (t === "gst") return { group: "bs", line: "gst_payable" };
  if (t.includes("payg")) return { group: "bs", line: "payg_withholding" };
  if (t.includes("super")) return { group: "bs", line: "superannuation_payable" };
  if (t === "current_liability" || t === "other_current_liability") return { group: "bs", line: "other_current_liabilities" };
  if (t.includes("long_term_debt") || t === "loan" || t.includes("loan")) return { group: "bs", line: "long_term_debt" };
  if (t === "equity" || c === "equity") return { group: "bs", line: "equity" };
  if (t.includes("retained")) return { group: "bs", line: "retained_earnings" };
  // fallbacks by class
  if (c === "asset") return { group: "bs", line: "other_current_assets" };
  if (c === "liability") return { group: "bs", line: "other_current_liabilities" };
  if (c === "equity") return { group: "bs", line: "equity" };
  if (c === "overhead") return { group: "pl", line: "operating_expenses" };
  if (c === "tax") return { group: "bs", line: "gst_payable" };
  return { group: "unmapped", line: null };
}

// ---- GST -------------------------------------------------------------------

// GST component (cents) of a GST-inclusive amount given rate (e.g. 0.10).
export function gstComponentInclusive(amountCents, rate) {
  const r = Number(rate) || 0;
  if (!amountCents) return 0;
  // gst = amount - amount/(1+r) = amount * r / (1+r)
  return roundDiv(amountCents * r, (1 + r), 1); // roundDiv handles scale=1 -> amountCents*r / (1+r)
}

// ---- Confidence aggregation (deterministic) -------------------------------

const CONF_RANK = { confirmed: 3, estimated: 2, forecast: 1 };
export function worstConfidence(confs) {
  let min = 3;
  for (const c of confs) {
    const r = CONF_RANK[c] ?? 1;
    if (r < min) min = r;
  }
  return min >= 3 ? "confirmed" : min === 2 ? "estimated" : "forecast";
}

// ---- Dependency graph + formulas ------------------------------------------

// All line codes with metadata: { label, unit, group, level, deps }.
// deps reference other line codes (derived) or are [] for raw lines.
export const LINES = {
  // --- P&L raw (level 0) ---
  revenue:            { label: "Revenue", unit: "cents", group: "pl", level: 0, deps: [] },
  cogs:               { label: "Cost of Goods Sold", unit: "cents", group: "pl", level: 0, deps: [] },
  labour_cost:        { label: "Labour Cost", unit: "cents", group: "pl", level: 0, deps: [] },
  operating_expenses: { label: "Operating Expenses", unit: "cents", group: "pl", level: 0, deps: [] },
  depreciation:       { label: "Depreciation", unit: "cents", group: "pl", level: 0, deps: [] },
  amortisation:       { label: "Amortisation", unit: "cents", group: "pl", level: 0, deps: [] },
  interest_expense:   { label: "Interest Expense", unit: "cents", group: "pl", level: 0, deps: [] },
  tax_expense:        { label: "Tax Expense", unit: "cents", group: "pl", level: 0, deps: [] },

  // --- Balance sheet raw (level 0) ---
  cash:                       { label: "Cash", unit: "cents", group: "bs", level: 0, deps: [] },
  accounts_receivable:        { label: "Accounts Receivable", unit: "cents", group: "bs", level: 0, deps: [] },
  inventory:                  { label: "Inventory", unit: "cents", group: "bs", level: 0, deps: [] },
  other_current_assets:       { label: "Other Current Assets", unit: "cents", group: "bs", level: 0, deps: [] },
  fixed_assets:               { label: "Fixed Assets", unit: "cents", group: "bs", level: 0, deps: [] },
  accumulated_depreciation:    { label: "Accumulated Depreciation", unit: "cents", group: "bs", level: 0, deps: [] },
  accounts_payable:           { label: "Accounts Payable", unit: "cents", group: "bs", level: 0, deps: [] },
  gst_payable:                { label: "GST Payable / Receivable", unit: "cents", group: "bs", level: 0, deps: [] },
  payg_withholding:           { label: "PAYG Withholding Payable", unit: "cents", group: "bs", level: 0, deps: [] },
  superannuation_payable:     { label: "Superannuation Payable", unit: "cents", group: "bs", level: 0, deps: [] },
  other_current_liabilities:  { label: "Other Current Liabilities", unit: "cents", group: "bs", level: 0, deps: [] },
  long_term_debt:             { label: "Long-Term Debt", unit: "cents", group: "bs", level: 0, deps: [] },
  equity:                     { label: "Equity", unit: "cents", group: "bs", level: 0, deps: [] },
  retained_earnings:          { label: "Retained Earnings", unit: "cents", group: "bs", level: 0, deps: [] },

  // --- Cash flow raw (level 0) ---
  opening_cash: { label: "Opening Cash", unit: "cents", group: "cf", level: 0, deps: [] },

  // --- Tax raw (level 0) ---
  gst_collected:        { label: "GST Collected", unit: "cents", group: "tax", level: 0, deps: [] },
  gst_paid:             { label: "GST Paid (Input Credits)", unit: "cents", group: "tax", level: 0, deps: [] },
  gst_free_sales:       { label: "GST-Free Sales", unit: "cents", group: "tax", level: 0, deps: [] },
  gst_free_purchases:   { label: "GST-Free Purchases", unit: "cents", group: "tax", level: 0, deps: [] },
  input_taxed:          { label: "Input-Taxed Transactions", unit: "cents", group: "tax", level: 0, deps: [] },

  // --- P&L derived ---
  gross_profit:       { label: "Gross Profit", unit: "cents", group: "pl", level: 1, deps: ["revenue", "cogs"] },
  gross_margin_pct:   { label: "Gross Margin %", unit: "bps", group: "pl", level: 2, deps: ["gross_profit", "revenue"] },
  labour_pct:         { label: "Labour Cost %", unit: "bps", group: "pl", level: 2, deps: ["labour_cost", "revenue"] },
  operating_expense_pct: { label: "Operating Expense %", unit: "bps", group: "pl", level: 2, deps: ["operating_expenses", "revenue"] },
  ebitda:             { label: "EBITDA", unit: "cents", group: "pl", level: 2, deps: ["gross_profit", "labour_cost", "operating_expenses"] },
  ebitda_margin:      { label: "EBITDA Margin", unit: "bps", group: "pl", level: 3, deps: ["ebitda", "revenue"] },
  ebit:               { label: "EBIT", unit: "cents", group: "pl", level: 3, deps: ["ebitda", "depreciation", "amortisation"] },
  net_profit:         { label: "Net Profit", unit: "cents", group: "pl", level: 4, deps: ["ebit", "interest_expense", "tax_expense"] },
  net_profit_margin:  { label: "Net Profit Margin", unit: "bps", group: "pl", level: 5, deps: ["net_profit", "revenue"] },

  // --- Balance sheet derived ---
  total_current_assets:      { label: "Total Current Assets", unit: "cents", group: "bs", level: 1, deps: ["cash", "accounts_receivable", "inventory", "other_current_assets"] },
  total_assets:              { label: "Total Assets", unit: "cents", group: "bs", level: 2, deps: ["total_current_assets", "fixed_assets", "accumulated_depreciation"] },
  total_current_liabilities: { label: "Total Current Liabilities", unit: "cents", group: "bs", level: 1, deps: ["accounts_payable", "gst_payable", "payg_withholding", "superannuation_payable", "other_current_liabilities"] },
  total_liabilities:         { label: "Total Liabilities", unit: "cents", group: "bs", level: 2, deps: ["total_current_liabilities", "long_term_debt"] },
  working_capital:           { label: "Working Capital", unit: "cents", group: "bs", level: 2, deps: ["total_current_assets", "total_current_liabilities"] },
  balance_check:             { label: "Balance Sheet Check", unit: "cents", group: "bs", level: 5, deps: ["total_assets", "total_liabilities", "equity", "retained_earnings", "net_profit"] },

  // --- Cash flow derived ---
  operating_cash_flow: { label: "Operating Cash Flow", unit: "cents", group: "cf", level: 5, deps: ["net_profit", "depreciation", "amortisation", "total_current_liabilities", "accounts_receivable", "inventory", "other_current_assets"] },
  investing_cash_flow: { label: "Investing Cash Flow", unit: "cents", group: "cf", level: 0, deps: [] },
  financing_cash_flow: { label: "Financing Cash Flow", unit: "cents", group: "cf", level: 0, deps: [] },
  net_cash_movement:   { label: "Net Cash Movement", unit: "cents", group: "cf", level: 6, deps: ["operating_cash_flow", "investing_cash_flow", "financing_cash_flow"] },
  closing_cash:        { label: "Closing Cash", unit: "cents", group: "cf", level: 7, deps: ["opening_cash", "net_cash_movement"] },
  cash_burn:           { label: "Cash Burn", unit: "cents", group: "cf", level: 8, deps: ["net_cash_movement"] },
  cash_runway:         { label: "Cash Runway", unit: "weeks", group: "cf", level: 9, deps: ["closing_cash", "cash_burn"] },

  // --- Tax derived ---
  net_gst_position: { label: "Net GST Position", unit: "cents", group: "tax", level: 1, deps: ["gst_collected", "gst_paid"] },

  // --- KPIs (result_type "kpi") ---
  // Each references P&L/BS results; computed separately with kpi_definition_id.
};

// Topological order (by level then name). Rejects cycles by construction.
export function topoOrder() {
  const codes = Object.keys(LINES);
  codes.sort((a, b) => (LINES[a].level - LINES[b].level) || a.localeCompare(b));
  // Validate no forward references (a node may only depend on lower levels).
  for (const code of codes) {
    for (const d of LINES[code].deps) {
      if (!LINES[d]) throw new Error(`Circular/unknown dependency: ${code} -> ${d}`);
      if (LINES[d].level > LINES[code].level) throw new Error(`Dependency order violation: ${code} (L${LINES[code].level}) depends on ${d} (L${LINES[d].level})`);
    }
  }
  return codes;
}

// Compute every derived line from raw inputs.
// raw: { lineCode: { cents: number, confidence: "confirmed"|"estimated"|"forecast" } }
// prior: { revenueCents?, closingCashCents? } for growth/runway/opening.
// companyTaxRate: number (e.g. 0.25) or null -> tax_expense 0.
// Returns { values: { code: { value, unit, confidence, inputs:[codes], na:boolean } } }
export function computeAll(raw, prior = {}, companyTaxRate = null) {
  const V = {}; // code -> { cents, bps, scaled, confidence, na }
  const get = (code) => V[code];

  // seed raw lines
  for (const code of Object.keys(LINES)) {
    const r = raw[code];
    if (LINES[code].level === 0) {
      V[code] = { value: r ? (r.cents || 0) : 0, confidence: r ? (r.confidence || "forecast") : "forecast", inputs: [], na: false };
    }
  }

  // company tax expense estimate (deterministic) if no raw tax_expense provided
  // computed after ebit/interest are known -> handled below at net_profit level.

  const order = topoOrder();
  for (const code of order) {
    if (LINES[code].level === 0) continue; // raw already set
    const deps = LINES[code].deps.map(get).filter(Boolean);
    const confs = deps.map((d) => d.confidence);
    const conf = worstConfidence(confs.length ? confs : ["forecast"]);
    let val = 0, na = false;
    switch (code) {
      case "gross_profit":
        val = (get("revenue")?.value || 0) - (get("cogs")?.value || 0); break;
      case "gross_margin_pct": {
        const rev = get("revenue")?.value || 0;
        if (rev <= 0) { val = 0; na = true; }
        else val = pctBps(get("gross_profit")?.value || 0, rev);
        break;
      }
      case "labour_pct": {
        const rev = get("revenue")?.value || 0;
        val = rev > 0 ? pctBps(get("labour_cost")?.value || 0, rev) : (na = true, 0); break;
      }
      case "operating_expense_pct": {
        const rev = get("revenue")?.value || 0;
        val = rev > 0 ? pctBps(get("operating_expenses")?.value || 0, rev) : (na = true, 0); break;
      }
      case "ebitda":
        val = (get("gross_profit")?.value || 0) - (get("labour_cost")?.value || 0) - (get("operating_expenses")?.value || 0); break;
      case "ebitda_margin": {
        const rev = get("revenue")?.value || 0;
        val = rev > 0 ? pctBps(get("ebitda")?.value || 0, rev) : (na = true, 0); break;
      }
      case "ebit":
        val = (get("ebitda")?.value || 0) - (get("depreciation")?.value || 0) - (get("amortisation")?.value || 0); break;
      case "tax_expense": {
        // if raw tax_expense provided (>0 or forecast), keep; else estimate from rate.
        const rawTax = V["tax_expense"];
        if (rawTax && rawTax.value) { val = rawTax.value; }
        else if (companyTaxRate) {
          const ebt = (get("ebit")?.value || 0) - (get("interest_expense")?.value || 0);
          val = ebt > 0 ? roundDiv(ebt * (Number(companyTaxRate) || 0), 1, 1) : 0;
          V["tax_expense"].confidence = "estimated";
        } else { val = 0; V["tax_expense"].confidence = "forecast"; }
        break;
      }
      case "net_profit":
        val = (get("ebit")?.value || 0) - (get("interest_expense")?.value || 0) - (get("tax_expense")?.value || 0); break;
      case "net_profit_margin": {
        const rev = get("revenue")?.value || 0;
        val = rev > 0 ? pctBps(get("net_profit")?.value || 0, rev) : (na = true, 0); break;
      }
      case "total_current_assets":
        val = ["cash", "accounts_receivable", "inventory", "other_current_assets"].reduce((s, c) => s + (get(c)?.value || 0), 0); break;
      case "total_assets":
        val = (get("total_current_assets")?.value || 0) + (get("fixed_assets")?.value || 0) + (get("accumulated_depreciation")?.value || 0); break;
      case "total_current_liabilities":
        val = ["accounts_payable", "gst_payable", "payg_withholding", "superannuation_payable", "other_current_liabilities"].reduce((s, c) => s + (get(c)?.value || 0), 0); break;
      case "total_liabilities":
        val = (get("total_current_liabilities")?.value || 0) + (get("long_term_debt")?.value || 0); break;
      case "working_capital":
        val = (get("total_current_assets")?.value || 0) - (get("total_current_liabilities")?.value || 0); break;
      case "balance_check": {
        // Total Assets - (Total Liabilities + Equity + Retained Earnings + Net Profit)
        // Retained earnings already includes opening RE; net profit is the period addition.
        const re = (get("retained_earnings")?.value || 0) + (get("net_profit")?.value || 0);
        val = (get("total_assets")?.value || 0) - ((get("total_liabilities")?.value || 0) + (get("equity")?.value || 0) + re);
        break;
      }
      case "operating_cash_flow": {
        // indirect method: Net Profit + non-cash addbacks + Δworking capital.
        // ΔWC = Δ(current liabilities) − Δ(non-cash current assets). prior=0 for first period.
        const tcl = get("total_current_liabilities")?.value || 0;
        const noncashCA = (get("accounts_receivable")?.value || 0) + (get("inventory")?.value || 0) + (get("other_current_assets")?.value || 0);
        const priorTCL = prior.tcl || 0;
        const priorNoncashCA = prior.noncashCA || 0;
        val = (get("net_profit")?.value || 0) + (get("depreciation")?.value || 0) + (get("amortisation")?.value || 0) + (tcl - priorTCL) - (noncashCA - priorNoncashCA);
        break;
      }
      case "net_cash_movement":
        val = (get("operating_cash_flow")?.value || 0) + (get("investing_cash_flow")?.value || 0) + (get("financing_cash_flow")?.value || 0); break;
      case "closing_cash":
        val = (get("opening_cash")?.value || 0) + (get("net_cash_movement")?.value || 0); break;
      case "cash_burn": {
        const ncm = get("net_cash_movement")?.value || 0;
        val = ncm < 0 ? -ncm : 0; if (ncm >= 0) na = true; break;
      }
      case "cash_runway": {
        const burn = get("cash_burn")?.value || 0;
        const cash = get("closing_cash")?.value || 0;
        if (burn <= 0) { val = 0; na = true; } // not-applicable: non-negative burn
        else val = roundDiv(cash * 4345, burn, 1); // weeks = cash/burn * 4.345 (weeks/month)
        break;
      }
      case "net_gst_position":
        val = (get("gst_collected")?.value || 0) - (get("gst_paid")?.value || 0); break;
      default:
        // investing/financing are raw (level 0) already seeded
        break;
    }
    V[code] = { value: val, confidence: conf, inputs: LINES[code].deps.slice(), na: !!(V[code] && V[code].na) || na };
  }

  return V;
}

// ---- KPI definitions + computation -----------------------------------------

// KPI code -> { formula(ctx) -> {value, unit, confidence, inputs:[codes], na} }
// ctx = the computeAll V map + prior + raw.
export const KPI_FORMULAS = {
  revenue_growth: (V, prior) => {
    const rev = V.revenue?.value || 0;
    const prev = prior.revenueCents || 0;
    if (!prev) return { value: 0, unit: "bps", confidence: "forecast", inputs: ["revenue"], na: true };
    return { value: pctBps(rev - prev, prev), unit: "bps", confidence: V.revenue?.confidence || "forecast", inputs: ["revenue"] };
  },
  gross_margin: (V) => ({ value: V.gross_margin_pct?.value || 0, unit: "bps", confidence: V.gross_margin_pct?.confidence || "forecast", inputs: ["gross_margin_pct"], na: V.gross_margin_pct?.na }),
  food_cost_pct: (V) => {
    const rev = V.revenue?.value || 0;
    return { value: rev > 0 ? pctBps(V.cogs?.value || 0, rev) : 0, unit: "bps", confidence: worstConfidence([V.cogs?.confidence, V.revenue?.confidence]), inputs: ["cogs", "revenue"], na: rev <= 0 };
  },
  labour_cost_pct: (V) => ({ value: V.labour_pct?.value || 0, unit: "bps", confidence: V.labour_pct?.confidence || "forecast", inputs: ["labour_pct"], na: V.labour_pct?.na }),
  operating_expense_pct: (V) => ({ value: V.operating_expense_pct?.value || 0, unit: "bps", confidence: V.operating_expense_pct?.confidence || "forecast", inputs: ["operating_expense_pct"], na: V.operating_expense_pct?.na }),
  ebitda_margin: (V) => ({ value: V.ebitda_margin?.value || 0, unit: "bps", confidence: V.ebitda_margin?.confidence || "forecast", inputs: ["ebitda_margin"], na: V.ebitda_margin?.na }),
  net_profit_margin: (V) => ({ value: V.net_profit_margin?.value || 0, unit: "bps", confidence: V.net_profit_margin?.confidence || "forecast", inputs: ["net_profit_margin"], na: V.net_profit_margin?.na }),
  current_ratio: (V) => {
    const tcl = V.total_current_liabilities?.value || 0;
    const tca = V.total_current_assets?.value || 0;
    return { value: tcl > 0 ? ratioScaled(tca, tcl) : 0, unit: "ratio_4dp", confidence: worstConfidence([V.total_current_assets?.confidence, V.total_current_liabilities?.confidence]), inputs: ["total_current_assets", "total_current_liabilities"], na: tcl <= 0 };
  },
  quick_ratio: (V) => {
    const tcl = V.total_current_liabilities?.value || 0;
    const qa = (V.total_current_assets?.value || 0) - (V.inventory?.value || 0);
    return { value: tcl > 0 ? ratioScaled(qa, tcl) : 0, unit: "ratio_4dp", confidence: worstConfidence([V.total_current_assets?.confidence, V.inventory?.confidence, V.total_current_liabilities?.confidence]), inputs: ["total_current_assets", "inventory", "total_current_liabilities"], na: tcl <= 0 };
  },
  debt_ratio: (V) => {
    const ta = V.total_assets?.value || 0;
    const tl = V.total_liabilities?.value || 0;
    return { value: ta > 0 ? ratioScaled(tl, ta) : 0, unit: "ratio_4dp", confidence: worstConfidence([V.total_liabilities?.confidence, V.total_assets?.confidence]), inputs: ["total_liabilities", "total_assets"], na: ta <= 0 };
  },
  dscr: (V) => {
    // Debt Service Coverage = EBITDA / (Interest + current portion of LT debt).
    // Approx: EBITDA / Interest (current portion not separately sourced) -> forecast.
    const denom = (V.interest_expense?.value || 0);
    const ebitda = V.ebitda?.value || 0;
    return { value: denom > 0 ? ratioScaled(ebitda, denom) : 0, unit: "ratio_4dp", confidence: "forecast", inputs: ["ebitda", "interest_expense"], na: denom <= 0 };
  },
  ar_days: (V) => {
    const rev = V.revenue?.value || 0;
    const ar = V.accounts_receivable?.value || 0;
    return { value: rev > 0 ? roundDiv(ar * 365, rev, 1) : 0, unit: "days", confidence: worstConfidence([V.accounts_receivable?.confidence, V.revenue?.confidence]), inputs: ["accounts_receivable", "revenue"], na: rev <= 0 };
  },
  ap_days: (V) => {
    const purchases = (V.cogs?.value || 0) + (V.operating_expenses?.value || 0);
    const ap = V.accounts_payable?.value || 0;
    return { value: purchases > 0 ? roundDiv(ap * 365, purchases, 1) : 0, unit: "days", confidence: worstConfidence([V.accounts_payable?.confidence, V.cogs?.confidence]), inputs: ["accounts_payable", "cogs", "operating_expenses"], na: purchases <= 0 };
  },
  cash_runway: (V) => ({ value: V.cash_runway?.value || 0, unit: "weeks", confidence: V.cash_runway?.confidence || "forecast", inputs: ["cash_runway"], na: V.cash_runway?.na }),
};

// ---- Deterministic cache key ----------------------------------------------

export function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & 0xffffffff;
  }
  // unsigned hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

// parts: { orgId, siteId, period, engineVersion, methodologyVersionId,
//          txns:[{id,updated_date,value}], configs:{accounts,mappings,taxrates,methodology,commitments} }
export function buildCacheKey(parts) {
  const txnsKey = (parts.txns || []).map((t) => `${t.id}:${t.updated_date || ""}:${t.value}`).sort().join("|");
  const cfgKey = JSON.stringify({
    a: (parts.configs.accounts || []).map((x) => `${x.id}:${x.updated_date}`).sort(),
    m: (parts.configs.mappings || []).map((x) => `${x.id}:${x.updated_date}`).sort(),
    t: (parts.configs.taxrates || []).map((x) => `${x.id}:${x.updated_date}:${x.rate}`).sort(),
    meth: parts.methodologyVersionId || "none",
    com: (parts.configs.commitments || []).map((x) => `${x.id}:${x.current_version}:${x.status}`).sort(),
  });
  const blob = `${parts.orgId}|${parts.siteId || "org"}|${parts.period}|${parts.engineVersion}|${txnsKey}|${cfgKey}`;
  return djb2(blob);
}