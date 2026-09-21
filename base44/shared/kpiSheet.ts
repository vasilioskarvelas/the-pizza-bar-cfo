// KPI spreadsheet importer — pure parsing (no base44, no I/O), fully unit-testable.
//
// Reads the owner's weekly "KPI SHEET - THE PIZZA BAR" workbook. Each shop has a
// "KPI <SHOP>" tab containing one block per year:
//
//   year row   : B = 2026, section titles ("Turnover", "COMISSIONS", "COGS", "Labour", "KPI's")
//   header row : B = "Week", C = "Week Ending", then channel names per section
//   week rows  : B = week number (1..53)
//
// Columns are located by HEADER TEXT inside each section, never by fixed letter,
// so a moved or added column is picked up (or reported) instead of silently
// mis-mapped. Week-ending dates are derived from year + week number (weeks run
// Mon→Sun, week 1 ends on the first Sunday of the year); the sheet's own date
// cell is only cross-checked, because copied year blocks can carry stale dates.
//
// Figures are taken exactly as entered (the owner enters them GST-inclusive,
// as reported by each platform).

export const CHANNELS = [
  "bite", "phone_pickup", "tables", "doordash", "uber_eats", "menulog", "hungry_hungry",
] as const;
export type Channel = typeof CHANNELS[number];

export type SectionKind = "turnover" | "commission" | "count";

export interface KpiRow {
  sheet: string;
  sheet_row: number;          // 1-based spreadsheet row, for traceability
  year: number;
  week: number;
  week_start: string;         // ISO Monday
  week_ending: string;        // ISO Sunday
  channel: Channel;
  gross_sales: number | null; // dollars
  commission: number | null;  // dollars
  order_count: number | null;
}

export interface ParseResult {
  rows: KpiRow[];
  warnings: string[];
}

export function channelFromHeader(header: unknown): Channel | null {
  const h = String(header ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!h || h.startsWith("total") || h.includes("transactions") || h.includes("item sales")) return null;
  if (h.includes("bite") || h.includes("byte")) return "bite";
  if (h.includes("phone") || h.includes("pick up") || h.includes("pickup")) return "phone_pickup";
  if (h.includes("table")) return "tables";
  if (h.includes("door")) return "doordash";
  if (h.includes("uber")) return "uber_eats";
  if (h.includes("menulog")) return "menulog";
  if (h.includes("hungry")) return "hungry_hungry";
  return null;
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,\s]/g, "");
  if (!s || s.startsWith("#")) return null; // #DIV/0!, #REF!, …
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function firstSunday(year: number): Date {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d;
}

export function weekEnding(year: number, week: number): string {
  const d = firstSunday(year);
  d.setUTCDate(d.getUTCDate() + 7 * (week - 1));
  return iso(d);
}

export function weekStartFromEnding(ending: string): string {
  const d = new Date(ending + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6);
  return iso(d);
}

// Spreadsheet date cell → ISO date. Accepts JS Date, ISO string, or Excel serial.
function cellDate(v: unknown): string | null {
  // Parsers can shift midnight dates by a timezone offset; round to the nearest day.
  if (v instanceof Date && !isNaN(v.getTime())) return iso(new Date(Math.round(v.getTime() / 86400000) * 86400000));
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return iso(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000));
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

const COL_B = 1; // zero-based column index of "Week" / year marker

function colName(i: number): string {
  let s = "", n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Parse one KPI tab. `grid` is a 2D array of cell values (row 0 = spreadsheet row 1).
 * Only week rows with at least one channel figure produce output.
 */
export function parseKpiSheet(sheet: string, grid: unknown[][]): ParseResult {
  const rows: KpiRow[] = [];
  const warnings: string[] = [];

  for (let r = 0; r < grid.length - 1; r++) {
    const year = toNumber(grid[r]?.[COL_B]);
    const next = grid[r + 1] || [];
    if (!year || year < 2000 || year > 2100 || String(next[COL_B] ?? "").trim().toLowerCase() !== "week") continue;

    // Sections are found from the header row itself: channel headers form contiguous
    // runs separated by non-channel headers ("Total", suppliers, wages, …). The first
    // run is turnover, a run followed by a TRANSACTIONS / ITEM SALES header is the
    // customer-count run, and a run in between is commissions. (The year row's
    // section titles are centred over merged cells, so they don't mark exact edges.)
    type Run = { cells: { col: number; ch: Channel; label: string }[]; nextLabel: string };
    const runs: Run[] = [];
    let current: Run | null = null;
    next.forEach((h, c) => {
      if (c <= COL_B + 1) return;
      const label = String(h ?? "").trim();
      if (!label) return;
      const ch = channelFromHeader(label);
      if (ch) {
        if (!current) { current = { cells: [], nextLabel: "" }; runs.push(current); }
        current.cells.push({ col: c, ch, label });
      } else if (current) {
        current.nextLabel = label.toLowerCase();
        current = null;
      }
    });
    const cols: Record<SectionKind, Partial<Record<Channel, number>>> = { turnover: {}, commission: {}, count: {} };
    runs.forEach((run, i) => {
      const kind: SectionKind = i === 0 ? "turnover"
        : (run.nextLabel.includes("transaction") || run.nextLabel.includes("item sales") || i === runs.length - 1) ? "count"
        : "commission";
      for (const { col, ch, label } of run.cells) {
        if (cols[kind][ch] !== undefined) {
          warnings.push(`${sheet} ${year}: duplicate "${label}" header in ${kind} columns (column ${colName(col)} ignored)`);
          continue;
        }
        cols[kind][ch] = col;
      }
    });
    if (!Object.keys(cols.turnover).length) {
      warnings.push(`${sheet} ${year}: no turnover channel columns found — block skipped`);
      continue;
    }

    const dateMismatches: string[] = [];
    // A year block holds at most 53 week rows; stop early at the next year marker.
    for (let w = r + 2; w < Math.min(grid.length, r + 2 + 60); w++) {
      const line = grid[w] || [];
      const week = toNumber(line[COL_B]);
      if (week !== null && week >= 2000) break;
      if (week === null || !Number.isInteger(week) || week < 1 || week > 53) continue;

      const ending = weekEnding(year, week);
      const sheetDate = cellDate(line[COL_B + 1]);
      if (sheetDate && sheetDate !== ending) dateMismatches.push(`row ${w + 1} shows ${sheetDate}, used ${ending}`);

      for (const ch of CHANNELS) {
        const g = cols.turnover[ch] !== undefined ? toNumber(line[cols.turnover[ch]!]) : null;
        const cm = cols.commission[ch] !== undefined ? toNumber(line[cols.commission[ch]!]) : null;
        const n = cols.count[ch] !== undefined ? toNumber(line[cols.count[ch]!]) : null;
        if (!g && !cm && !n) continue; // nothing entered (future week or unused channel)
        rows.push({
          sheet, sheet_row: w + 1, year, week,
          week_start: weekStartFromEnding(ending), week_ending: ending, channel: ch,
          gross_sales: g, commission: cm, order_count: n === null ? null : Math.round(n),
        });
      }
    }
    if (dateMismatches.length) {
      warnings.push(`${sheet} ${year}: ${dateMismatches.length} week-ending date(s) in the sheet don't match ${year} week numbers (e.g. ${dateMismatches[0]}) — dates derived from week numbers were used`);
    }
  }
  return { rows, warnings };
}

/** KPI tabs are named "KPI <SHOP NAME>". Returns the shop part, or null for other tabs. */
export function shopNameFromSheet(sheetName: string): string | null {
  const m = /^\s*kpi\s+(.+?)\s*$/i.exec(sheetName);
  return m ? m[1] : null;
}

/** Match a tab's shop name to a Site by shared distinctive words (e.g. "DIGGERS REST" ↔ "The Pizza Bar Diggers Rest"). */
export function matchSite<T extends { id: string; name?: string; suburb?: string }>(shop: string, sites: T[]): T | null {
  const words = shop.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const hits = sites.filter((s) => {
    const hay = `${s.name || ""} ${s.suburb || ""}`.toLowerCase();
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

export function dedupKey(siteId: string, weekEndingIso: string, channel: Channel): string {
  return `kpi_sheet|${siteId}|${weekEndingIso}|${channel}`;
}

const cents = (v: number | null) => (v === null ? null : Math.round(v * 100));

/** Shape a parsed row into a WeeklyChannelKPI entity record. */
export function toEntity(row: KpiRow, organisationId: string, siteId: string, importBatchRef: string) {
  const gross = cents(row.gross_sales) ?? 0;
  const comm = cents(row.commission) ?? 0;
  return {
    organisation_id: organisationId,
    site_id: siteId,
    week_start: row.week_start,
    week_ending: row.week_ending,
    channel: row.channel,
    gross_sales_cents: gross,
    commission_cents: comm,
    net_sales_cents: gross - comm,
    order_count: row.order_count ?? 0,
    has_order_count: row.order_count !== null,
    source: "kpi_sheet",
    source_ref: `${row.sheet}!R${row.sheet_row}`,
    import_ref: importBatchRef,
    dedup_key: dedupKey(siteId, row.week_ending, row.channel),
  };
}

/** True when an existing record differs from the incoming one on any figure. */
export function figuresChanged(existing: any, incoming: any): boolean {
  return ["gross_sales_cents", "commission_cents", "net_sales_cents", "order_count", "has_order_count"]
    .some((k) => (existing?.[k] ?? null) !== (incoming?.[k] ?? null));
}
