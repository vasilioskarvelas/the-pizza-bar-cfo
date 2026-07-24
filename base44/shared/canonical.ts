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
  // A partial amount match requires the amounts to be CLOSE (within partial_amount_pct,
  // default 5%) — not merely same-date. Wildly different amounts are "unmatched", not
  // partial. Only exact matches and duplicates consume a B candidate, so an earlier
  // partial can never steal the exact counterpart of a later record.
  const partialPct = tol.partial_amount_pct ?? 0.05;
  const exactAmt = (a, b) => Math.abs((a.value || 0) - (b.value || 0)) <= tol.amount;
  const closeAmt = (a, b) => {
    const diff = Math.abs((a.value || 0) - (b.value || 0));
    const base = Math.max(Math.abs(a.value || 0), Math.abs(b.value || 0), 1);
    return diff > tol.amount && diff / base <= partialPct;
  };
  const sameDate = (a, b) => dateDiffDays(a.period_start, b.period_start) <= tol.date_days;

  const out = [];
  const usedB = new Set();
  for (const a of txsA) {
    const acct = labelAccount(a.label);
    const sameAccount = txsB.filter((b) => labelAccount(b.label) === acct && !usedB.has(b.id));
    const sameCurrency = sameAccount.filter((b) => b.unit === a.unit);

    const exact = sameCurrency.filter((b) => sameDate(a, b) && exactAmt(a, b));
    const sameAmtDiffDate = sameCurrency.filter((b) => !sameDate(a, b) && exactAmt(a, b));
    const closeSameDate = sameCurrency.filter((b) => sameDate(a, b) && closeAmt(a, b));
    const closeDiffDate = sameCurrency.filter((b) => !sameDate(a, b) && closeAmt(a, b));

    let status = "unmatched", match = null, reason = "no_counterpart";
    if (exact.length === 1) { status = "matched"; match = exact[0]; usedB.add(match.id); }
    else if (exact.length > 1) { status = "duplicate"; match = exact[0]; usedB.add(match.id); reason = `${exact.length} exact candidates`; }
    else if (sameAmtDiffDate.length >= 1) { status = "partially_matched"; match = sameAmtDiffDate[0]; reason = "date_mismatch"; }
    else if (closeSameDate.length >= 1) { status = "partially_matched"; match = closeSameDate[0]; reason = "amount_mismatch"; }
    else if (closeDiffDate.length >= 1) { status = "partially_matched"; match = closeDiffDate[0]; reason = "amount_mismatch"; }
    else if (sameCurrency.length >= 1) { status = "unmatched"; match = sameCurrency[0]; reason = "amount_out_of_tolerance"; }
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