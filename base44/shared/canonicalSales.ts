// Canonical sales ledger — normalization + reconciliation (PURE, no I/O).
// Reuses the Phase-04 canonical.ts patterns. Every source (API or CSV) writes
// immutable SourceRecords; a build step then normalizes them into SalesLedgerEntry
// + SalesLineItem, and reconciles marketplace sales against PlatformSettlements.
//
// Core rule: REVENUE != PAYOUT. A $50 marketplace order is $50 revenue
// (SalesLedgerEntry) + $15 commission expense (PlatformFee) + $35 cash receipt
// (PlatformSettlement). It is NEVER $135 of revenue.

export function safeParse(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

export const SALE_CHANNELS = ["pos", "uber_eats", "doordash", "direct_online", "pickup", "other"];
export const SERVICE_TYPES = ["dine_in", "pickup", "delivery", "online", "unknown"];
export const RECON_STATUS = ["unmatched", "matched", "duplicate", "exception", "awaiting_data"];
export const CONFIDENCE = ["confirmed", "estimated", "forecast", "unknown"];

// ---- money helpers (integer cents) ----------------------------------------

export function toCents(major) {
  const n = Number(major) || 0;
  // accept already-cents integers (>= 1000 treated as cents if flagged) — default: major units
  return Math.round(n * 100);
}
export function fromCents(c) { return (Number(c) || 0) / 100; }

// ---- date helpers ----------------------------------------------------------

// ISO Monday week start (UTC). Restaurant weeks are Mon->Sun.
export function weekStart(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

// ---- channel / service mapping --------------------------------------------

export function mapChannel(sourceSystem, rawChannel, rawService) {
  const s = String(sourceSystem || "").toLowerCase();
  if (s === "uber_eats" || s === "ubereats") return "uber_eats";
  if (s === "doordash") return "doordash";
  if (s === "pos" || s === "bite") return "pos";
  if (s === "direct_online" || s === "online") return "direct_online";
  const c = String(rawChannel || rawService || "").toLowerCase();
  if (c.includes("uber")) return "uber_eats";
  if (c.includes("door")) return "doordash";
  if (c.includes("pickup") || c.includes("takeaway")) return "pickup";
  if (c.includes("online") || c.includes("direct")) return "direct_online";
  return "pos";
}

export function mapServiceType(rawService, channel) {
  const s = String(rawService || "").toLowerCase();
  if (s.includes("dine")) return "dine_in";
  if (s.includes("pickup") || s.includes("takeaway") || s.includes("collect")) return "pickup";
  if (s.includes("deliver")) return "delivery";
  if (s.includes("online")) return "online";
  if (channel === "uber_eats" || channel === "doordash") return "delivery";
  if (channel === "direct_online") return "online";
  return "unknown";
}

// ---- confidence ------------------------------------------------------------

// unknown = data missing (NOT zero). forecast = derived/guessed. estimated = partial.
// confirmed = complete + reconciled.
export function saleConfidence({ business_date, net, external_order_id, source_system }) {
  if (!business_date) return "unknown";
  if (net == null || Number.isNaN(net)) return "unknown";
  if (!external_order_id && source_system !== "pos") return "estimated";
  return "confirmed";
}

// ---- dedup -----------------------------------------------------------------

// Detect the same order arriving from POS AND a marketplace. Prefer order id;
// fall back to (site|date|net|channel) so a marketplace order that also appears
// in POS is flagged as a duplicate rather than double-counted.
export function saleDedupKey({ site_id, business_date, external_order_id, net_sales_cents, channel }) {
  if (external_order_id) return `order|${site_id || ""}|${external_order_id}`;
  return `amt|${site_id || ""}|${business_date}|${channel || ""}|${net_sales_cents || 0}`;
}

// ---- normalization ---------------------------------------------------------

// Normalize a raw SourceRecord into a canonical SalesLedgerEntry candidate.
// Field names are generic across POS exports, Uber/DoorDash settlement rows.
export function normalizeSale(rec) {
  const p = typeof rec.raw_payload === "string" ? safeParse(rec.raw_payload) : (rec.raw_payload || {});
  const site_id = rec.site_id || p.site_id || p.location_id || null;
  const business_date = String(
    p.business_date || p.transaction_date || p.order_date || p.date || p.settlement_date || ""
  ).slice(0, 10) || null;
  const channel = mapChannel(rec.source_system, p.channel, p.service_type);
  const service_type = mapServiceType(p.service_type, channel);
  const gross = toCents(p.gross_sales ?? p.gross ?? p.total ?? p.subtotal ?? 0);
  const discounts = toCents(p.discounts ?? p.discount ?? p.promotions ?? p.promo ?? 0);
  const refunds = toCents(p.refunds ?? p.refund ?? 0);
  const gst = toCents(p.gst ?? p.tax ?? p.gst_collected ?? 0);
  const netRaw = p.net_sales ?? p.net_sales_gst_incl ?? p.net ?? p.net_payout ?? null;
  const net = netRaw != null ? toCents(netRaw) : (gross - discounts - refunds);
  const external_order_id = p.order_id || p.external_order_id || p.order_ref || p.invoice_number || rec.external_record_id || null;
  const txCount = Number(p.transaction_count ?? p.order_count ?? (external_order_id ? 1 : 0)) || 0;
  return {
    organisation_id: rec.organisation_id,
    site_id,
    source_system: rec.source_system,
    source_record_id: rec.id,
    external_order_id,
    business_date,
    week_start: weekStart(business_date),
    channel,
    service_type,
    gross_sales_cents: gross,
    discounts_cents: discounts,
    refunds_cents: refunds,
    net_sales_cents: net,
    gst_cents: gst,
    transaction_count: txCount,
    avg_order_value_cents: txCount > 0 ? Math.round(net / txCount) : 0,
    reconciliation_status: "unmatched",
    dedup_key: saleDedupKey({ site_id, business_date, external_order_id, net_sales_cents: net, channel }),
    confidence: saleConfidence({ business_date, net, external_order_id, source_system: rec.source_system }),
  };
}

// Normalize line items from a raw payload that contains an items array.
export function normalizeLineItems(rec, saleEntryId) {
  const p = typeof rec.raw_payload === "string" ? safeParse(rec.raw_payload) : (rec.raw_payload || {});
  const items = p.items || p.line_items || p.order_items || [];
  const site_id = rec.site_id || p.site_id || null;
  const business_date = String(p.business_date || p.transaction_date || p.order_date || p.date || "").slice(0, 10) || null;
  const channel = mapChannel(rec.source_system, p.channel, p.service_type);
  const service_type = mapServiceType(p.service_type, channel);
  return (Array.isArray(items) ? items : []).map((it) => {
    const qty = Number(it.quantity ?? it.qty ?? it.count ?? 0) || 0;
    const gross = toCents(it.gross ?? it.line_total ?? (it.price ? it.price * qty : 0));
    const disc = toCents(it.discount ?? it.discounts ?? 0);
    const refd = toCents(it.refund ?? it.refunded ?? 0);
    const net = toCents(it.net ?? it.net_total ?? (gross - disc - refd));
    return {
      organisation_id: rec.organisation_id,
      site_id,
      sales_ledger_entry_id: saleEntryId,
      source_record_id: rec.id,
      item_name: it.name || it.item_name || it.product || it.description || "Unknown item",
      item_ref: it.item_id || it.sku || it.plu || it.product_id || null,
      category: it.category || it.category_name || null,
      quantity: qty,
      gross_cents: gross,
      discount_cents: disc,
      refund_cents: refd,
      net_cents: net,
      avg_price_cents: qty > 0 ? Math.round(net / qty) : 0,
      channel,
      service_type,
      business_date,
      week_start: weekStart(business_date),
      estimated_food_cost_cents: 0,
      contribution_margin_cents: 0,
      costing_source: "none",
    };
  });
}

// Normalize a raw SourceRecord (marketplace settlement) into a PlatformSettlement.
export function normalizeSettlement(rec) {
  const p = typeof rec.raw_payload === "string" ? safeParse(rec.raw_payload) : (rec.raw_payload || {});
  const platform = mapPlatform(rec.source_system, p.platform);
  const payout_date = String(p.payout_date || p.settlement_date || p.payment_date || p.date || "").slice(0, 10) || null;
  const period_start = String(p.period_start || p.range_start || "").slice(0, 10) || null;
  const period_end = String(p.period_end || p.range_end || "").slice(0, 10) || null;
  const gross = toCents(p.gross_sales ?? p.gross ?? p.total_sales ?? 0);
  const refunds = toCents(p.refunds ?? p.refund_total ?? 0);
  const adjustments = toCents(p.adjustments ?? p.other_adjustments ?? 0);
  const commissions = toCents(p.commissions ?? p.commission ?? p.service_fee ?? 0);
  const fees = toCents(p.fees ?? p.delivery_fee ?? p.other_fees ?? 0);
  const promotions = toCents(p.promotions ?? p.marketing ?? p.promo ?? 0);
  const gstCollected = toCents(p.gst ?? p.gst_collected ?? p.tax ?? 0);
  const netPayout = toCents(p.net_payout ?? p.net ?? p.payout_amount ?? p.total_payout ?? 0);
  return {
    organisation_id: rec.organisation_id,
    site_id: rec.site_id || p.site_id || null,
    platform,
    source_system: rec.source_system,
    source_record_id: rec.id,
    external_payout_id: p.payout_id || p.settlement_id || p.reference || rec.external_record_id || null,
    payout_date,
    period_start,
    period_end,
    gross_sales_cents: gross,
    refunds_cents: refunds,
    adjustments_cents: adjustments,
    commissions_cents: commissions,
    fees_cents: fees,
    promotions_cents: promotions,
    gst_collected_cents: gstCollected,
    net_payout_cents: netPayout,
    matched_sales_count: 0,
    reconciliation_status: payout_date ? "unmatched" : "awaiting_data",
    confidence: payout_date && netPayout != null ? "confirmed" : "unknown",
  };
}

export function mapPlatform(sourceSystem, rawPlatform) {
  const s = String(sourceSystem || rawPlatform || "").toLowerCase();
  if (s.includes("uber")) return "uber_eats";
  if (s.includes("door")) return "doordash";
  if (s.includes("menulog")) return "menulog";
  return "other";
}

// ---- reconciliation ---------------------------------------------------------

// Reconcile marketplace sales against platform settlements.
// Revenue stays gross on the sale; the settlement confirms the cash receipt and
// carries the commission/fees as separate expense lines. We match by platform +
// business_date within the settlement period; net payout is NOT added to revenue.
//
// Returns { matched: [{sale, settlement}], unmatchedSales, unmatchedSettlements }.
export function reconcileSalesToSettlements(sales, settlements) {
  const used = new Set();
  const matched = [];
  const unmatchedSales = [];
  for (const sale of sales) {
    if (sale.channel !== "uber_eats" && sale.channel !== "doordash") {
      unmatchedSales.push(sale); // POS/direct — no platform settlement to match
      continue;
    }
    const platform = sale.channel;
    const date = sale.business_date;
    const cand = settlements.find(
      (st) =>
        !used.has(st.id) &&
        st.platform === platform &&
        st.period_start && st.period_end &&
        date >= st.period_start && date <= st.period_end
    );
    if (cand) {
      used.add(cand.id);
      matched.push({ sale, settlement: cand });
    } else {
      unmatchedSales.push(sale);
    }
  }
  const unmatchedSettlements = settlements.filter((st) => !used.has(st.id));
  return { matched, unmatchedSales, unmatchedSettlements };
}

// Detect duplicate sales (same dedup_key) WITHIN the canonical ledger.
// The first occurrence is the canonical sale; later ones are flagged duplicate.
export function findDuplicateSales(sales) {
  const seen = new Map();
  const dups = [];
  for (const s of sales) {
    const key = s.dedup_key;
    if (!key) continue;
    if (seen.has(key)) dups.push({ original: seen.get(key), duplicate: s });
    else seen.set(key, s);
  }
  return dups;
}

// Aggregate canonical sales into a weekly summary by channel + service type.
// This is the input to the financial engine (revenue lines), NOT a fabricated figure.
export function aggregateWeek(sales, weekStartStr) {
  const inWeek = (sales || []).filter((s) => s.week_start === weekStartStr && s.reconciliation_status !== "duplicate");
  const byChannel = {};
  const byService = {};
  let gross = 0, discounts = 0, refunds = 0, net = 0, gst = 0, orders = 0;
  for (const s of inWeek) {
    gross += s.gross_sales_cents || 0;
    discounts += s.discounts_cents || 0;
    refunds += s.refunds_cents || 0;
    net += s.net_sales_cents || 0;
    gst += s.gst_cents || 0;
    orders += s.transaction_count || 0;
    byChannel[s.channel] = (byChannel[s.channel] || 0) + (s.net_sales_cents || 0);
    byService[s.service_type] = (byService[s.service_type] || 0) + (s.net_sales_cents || 0);
  }
  return {
    week_start: weekStartStr,
    sale_count: inWeek.length,
    gross_sales_cents: gross,
    discounts_cents: discounts,
    refunds_cents: refunds,
    net_sales_cents: net,
    gst_cents: gst,
    order_count: orders,
    avg_order_value_cents: orders > 0 ? Math.round(net / orders) : 0,
    by_channel: byChannel,
    by_service: byService,
  };
}