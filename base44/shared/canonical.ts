// Phase 04 — canonical financial model + reconciliation engine.
// Pure deterministic helpers shared by buildCanonicalModel and runReconciliation.
// No base44, no I/O — fully unit-testable. All financial figures are stored as
// CalculationResult (result_type="financial_figure", entity_type="source_record"),
// the locked-ERD home for canonical financial truth. Lineage is CalculationLineage.

export const DEFAULT_TOLERANCE = { amount: 0.01, date_days: 0, currency: "AUD" };

export function safeParse(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

// Canonical transaction label encodes account + GST treatment: "4000|GST_INCL".
export function labelAccount(label) { return (label || "").split("|")[0] || "UNMAPPED"; }
export function labelGst(label) { return (label || "").split("|")[1] || "GST_FREE"; }
export function makeLabel(accountCode, gst) { return `${accountCode || "UNMAPPED"}|${gst || "GST_FREE"}`; }

export function accountsById(accounts) {
  const m = {};
  for (const a of accounts || []) m[a.id] = a;
  return m;
}

export function effectiveMappings(mappings, sourceSystem, todayStr) {
  return (mappings || []).filter(
    (m) => m.source_system === sourceSystem &&
      (!m.effective_to || m.effective_to >= todayStr) &&
      (!m.effective_from || m.effective_from <= todayStr)
  );
}

// Extract canonical fields from a raw source payload. Field names are generic
// so the builder works across Xero invoices, POS sales, banking deposits, etc.
export function extractFields(rawPayload, sourceSystem, externalEntityType, externalRecordId) {
  const p = typeof rawPayload === "string" ? safeParse(rawPayload) : (rawPayload || {});
  const amount = Number(
    p.amount ?? p.Total ?? p.net_sales ?? p.net_sales_gst_incl ??
    p.gross_wages ?? p.gross_sales ?? p.amount_excl ?? p.net_pay ?? 0
  );
  const rawDate = p.transaction_date || p.business_date || p.DateString ||
    p.invoice_date || p.payment_date || null;
  const transactionDate = rawDate ? String(rawDate).slice(0, 10) : null;
  const postingDate = p.posting_date ? String(p.posting_date).slice(0, 10) : transactionDate;
  const category = p.category || p.account_code || p.account || p.Type ||
    p.external_category || externalEntityType || "unknown";
  const currency = p.currency || "AUD";
  const reference = p.reference || p.invoice_number || p.InvoiceNumber || externalRecordId || null;
  const gstTreatment = p.gst_treatment || null;
  return {
    amount: isFinite(amount) ? amount : 0,
    transactionDate, postingDate, category, currency, reference, gstTreatment,
  };
}

// Classify: map (source_system, external_category) -> canonical Account via AccountMapping.
export function classify({ category, sourceSystem, mappings, accounts, todayStr }) {
  const byId = accountsById(accounts);
  const m = effectiveMappings(mappings, sourceSystem, todayStr)
    .find((x) => x.external_category === category);
  if (!m) return { mapped: false, accountCode: null, accountId: null, accountClass: null };
  const acct = byId[m.account_id];
  if (!acct) return { mapped: false, accountCode: null, accountId: null, accountClass: null };
  return { mapped: true, accountCode: acct.code, accountId: acct.id, accountClass: acct.class };
}

export function gstTreatmentFor(accountClass, override) {
  if (override) return override;
  switch (accountClass) {
    case "revenue":
    case "cogs":
    case "overhead": return "GST_INCL";
    case "tax": return "GST";
    default: return "GST_FREE";
  }
}

// Build-time confidence from data quality (deterministic, no AI).
export function buildConfidence({ mapped, hasAmount, hasDate }) {
  if (!mapped || !hasAmount) return "forecast";
  if (!hasDate) return "estimated";
  return "confirmed";
}

export function dateDiffDays(d1, d2) {
  if (!d1 || !d2) return Infinity;
  const a = new Date(d1 + "T00:00:00Z").getTime();
  const b = new Date(d2 + "T00:00:00Z").getTime();
  return Math.abs(Math.round((a - b) / 86400000));
}

// Reconcile set A against set B. Each canonical transaction is a CalculationResult
// where label="account|gst", unit=currency, period_start=transaction date, value=amount.
// Returns per-A classifications: matched | partially_matched | unmatched | duplicate | exception.
export function reconcileSets(txsA, txsB, tolerance) {
  const tol = { ...DEFAULT_TOLERANCE, ...tolerance };
  const out = [];
  const usedB = new Set();
  for (const a of txsA) {
    const acct = labelAccount(a.label);
    const sameAccount = txsB.filter((b) => labelAccount(b.label) === acct && !usedB.has(b.id));
    const sameAccountCurrency = sameAccount.filter((b) => b.unit === a.unit);
    const dateClose = sameAccountCurrency.filter((b) => dateDiffDays(a.period_start, b.period_start) <= tol.date_days);
    const amtMatch = dateClose.filter((b) => Math.abs((a.value || 0) - (b.value || 0)) <= tol.amount);

    let status = "unmatched", match = null, reason = null;
    if (amtMatch.length === 1) { status = "matched"; match = amtMatch[0]; usedB.add(match.id); }
    else if (amtMatch.length > 1) { status = "duplicate"; match = amtMatch[0]; usedB.add(match.id); reason = `${amtMatch.length} amount-matching candidates`; }
    // Partial / currency mismatches do NOT consume — only exact matches and
    // duplicates consume a B candidate, so an earlier partial can never steal the
    // exact counterpart of a later record.
    else if (dateClose.length >= 1) { status = "partially_matched"; match = dateClose[0]; reason = "amount_mismatch"; }
    else if (sameAccountCurrency.length >= 1) { status = "partially_matched"; match = sameAccountCurrency[0]; reason = "date_mismatch"; }
    else if (sameAccount.length >= 1) { status = "exception"; match = sameAccount[0]; reason = "currency_mismatch"; }

    out.push({ a, status, match, reason });
  }
  return out;
}

// Detect duplicates WITHIN a single set (same account+amount+date+currency).
export function findDuplicates(txs) {
  const seen = new Map();
  const dups = [];
  for (const t of txs) {
    const key = `${labelAccount(t.label)}|${t.unit}|${t.period_start}|${t.value}`;
    if (seen.has(key)) dups.push({ original: seen.get(key), duplicate: t });
    else seen.set(key, t);
  }
  return dups;
}

// Reconciliation classification -> confidence level (deterministic).
export function reconcileConfidence(status) {
  if (status === "matched") return "confirmed";
  if (status === "partially_matched") return "estimated";
  return "forecast";
}