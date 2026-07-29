// Phase 11 — AI fixed-format summary ENGINE (pure, no I/O, no AI call).
// Builds the permission-filtered context fed to the LLM, the fixed JSON
// schema, a numeric validator that catches hallucinated figures, and a
// deterministic fallback used when the AI is unavailable or fails validation.
// The actual InvokeLLM call lives in the backend function.

export const AI_SUMMARY_ENGINE_VERSION = "ai-summary-1.0.0";

// Fixed output schema — the LLM MUST return this shape.
export const AI_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One-sentence executive headline, <=140 chars, using only provided figures." },
    strengths: { type: "array", items: { type: "string" }, description: "2-4 positive observations, each citing a provided figure where possible." },
    concerns: { type: "array", items: { type: "string" }, description: "2-4 risks or issues, each citing a provided figure where possible." },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", description: "Concrete next step." },
          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          rationale: { type: "string", description: "Why, referencing provided figures." }
        },
        required: ["action", "priority", "rationale"]
      }
    },
    outlook: { type: "string", enum: ["strong", "stable", "cautious", "at_risk", "critical"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  },
  required: ["headline", "strengths", "concerns", "recommended_actions", "outlook", "confidence"]
};

const fmt$ = (c: number | null) => c == null ? "n/a" : `$${Math.round(c / 100).toLocaleString("en-AU")}`;
const fmtPct = (bps: number | null) => bps == null ? "n/a" : `${(bps / 100).toFixed(1)}%`;

// Build the curated, permission-filtered context. Only numbers the caller is
// permitted to see are included — no raw records, no cross-site leakage.
export function buildContext(opts: {
  orgName: string; siteName: string | null; scope: string;
  metrics: Record<string, any>; ownerScore: number | null;
  activity: Record<string, number>; alerts: any[]; period: { start: string; end: string };
}) {
  const { orgName, siteName, scope, metrics, ownerScore, activity, alerts, period } = opts;
  const lines: string[] = [];
  lines.push(`Organisation: ${orgName}`);
  if (siteName) lines.push(`Site: ${siteName}`); else lines.push(`Scope: organisation-wide (consolidated)`);
  lines.push(`Reporting period: ${period.start} to ${period.end}`);
  lines.push("");
  lines.push("You are generating a fixed-format executive summary for a hospitality business owner.");
  lines.push("Rules:");
  lines.push("- Use ONLY the figures provided below. Do NOT invent, estimate, or recall any number.");
  lines.push("- Quote currency as $X,XXX (whole dollars), percentages as X.X%, and the Owner Score as a number 0-100.");
  lines.push("- Do not reference any data not listed here.");
  lines.push("");
  lines.push("Key financial metrics for this period:");
  lines.push(`- Revenue: ${fmt$(metrics.revenue)}`);
  lines.push(`- Gross Profit: ${fmt$(metrics.gross_profit)}`);
  lines.push(`- Gross Margin: ${fmtPct(metrics.gross_margin)}`);
  lines.push(`- EBITDA: ${fmt$(metrics.ebitda)}`);
  lines.push(`- Net Profit: ${fmt$(metrics.net_profit)}`);
  lines.push(`- Cash: ${fmt$(metrics.cash)}`);
  lines.push(`- Working Capital: ${fmt$(metrics.working_capital)}`);
  lines.push(`- Debt Ratio: ${fmtPct(metrics.debt_ratio)}`);
  lines.push(`- Labour Cost %: ${fmtPct(metrics.labour_cost_pct)}`);
  lines.push(`- Food Cost %: ${fmtPct(metrics.food_cost_pct)}`);
  lines.push(`- Net GST Position: ${fmt$(metrics.net_gst_position)}`);
  lines.push(`- Owner Score: ${ownerScore != null ? Number(ownerScore).toFixed(1) : "n/a"} / 100`);
  lines.push("");
  lines.push("This week's activity:");
  lines.push(`- ${activity.alerts || 0} alerts, ${activity.goals_updated || 0} goal updates, ${activity.initiatives_updated || 0} initiative updates, ${activity.decisions || 0} decisions logged, ${activity.opportunities || 0} opportunities.`);
  if (alerts && alerts.length) {
    lines.push("- Top open alerts:");
    for (const a of alerts.slice(0, 5)) lines.push(`  • ${a.title} (${a.severity}) — ${a.reason || a.status || ""}`);
  }
  lines.push("");
  lines.push("Return ONLY the JSON object matching the provided schema. No prose outside the JSON.");

  // The set of numbers the AI is permitted to quote (for validation).
  const dollars = [metrics.revenue, metrics.gross_profit, metrics.ebitda, metrics.net_profit, metrics.cash, metrics.working_capital, metrics.net_gst_position]
    .filter((v) => v != null).map((v) => Math.round(Number(v) / 100));
  const percents = [metrics.gross_margin, metrics.debt_ratio, metrics.labour_cost_pct, metrics.food_cost_pct]
    .filter((v) => v != null).map((v) => Math.round(Number(v)) / 100); // 1dp percent
  const score = ownerScore != null ? [Number(ownerScore)] : [];
  const counts = [activity.alerts, activity.goals_updated, activity.initiatives_updated, activity.decisions, activity.opportunities].filter((n) => n != null);

  return {
    promptContext: lines.join("\n"),
    allowed: { dollars, percents, score, counts },
    contextHash: simpleHash(lines.join("\n")),
  };
}

// Numeric validator: extract $/%/score tokens from the AI's text and verify
// each appears in the allowed set. Returns mismatches the AI invented.
export function validateNumbers(aiText: string, allowed: { dollars: number[]; percents: number[]; score: number[]; counts: number[] }) {
  const mismatches: string[] = [];
  if (!aiText) return { status: "skipped", mismatches };
  // $ amounts → dollars
  const dollarTokens = [...aiText.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  for (const d of dollarTokens) {
    if (!allowed.dollars.some((a) => Math.abs(a - d) <= 1)) mismatches.push(`$${d.toLocaleString()}`);
  }
  // percentages X.X%
  const pctTokens = [...aiText.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  for (const p of pctTokens) {
    if (!allowed.percents.some((a) => Math.abs(a - p) <= 0.2)) mismatches.push(`${p}%`);
  }
  // standalone score "Owner Score X" / "score of X"
  const scoreMatch = aiText.match(/owner score[^0-9]*(\d+(?:\.\d+)?)/i) || aiText.match(/score of (\d+(?:\.\d+)?)/i);
  if (scoreMatch && allowed.score.length) {
    const s = Number(scoreMatch[1]);
    if (!allowed.score.some((a) => Math.abs(a - s) <= 0.5)) mismatches.push(`score ${s}`);
  }
  return { status: mismatches.length ? "failed" : "passed", mismatches };
}

// Deterministic fallback — no AI. Used when InvokeLLM errors OR validation fails.
export function deterministicFallback(opts: {
  metrics: Record<string, any>; ownerScore: number | null; activity: Record<string, number>; period: { start: string; end: string };
}) {
  const { metrics, ownerScore, activity, period } = opts;
  const strengths: string[] = [];
  const concerns: string[] = [];
  if (metrics.revenue != null) strengths.push(`Revenue at ${fmt$(metrics.revenue)} for the period.`);
  if (metrics.gross_margin != null && metrics.gross_margin >= 5000) strengths.push(`Gross margin ${fmtPct(metrics.gross_margin)} is healthy.`);
  if (metrics.cash != null && metrics.cash > 0) strengths.push(`Cash position ${fmt$(metrics.cash)} is positive.`);
  if (ownerScore != null && ownerScore >= 70) strengths.push(`Owner Score ${ownerScore.toFixed(1)} reflects strong operating health.`);
  if (metrics.net_profit != null && metrics.net_profit < 0) concerns.push(`Net profit is negative at ${fmt$(metrics.net_profit)}.`);
  if (metrics.debt_ratio != null && metrics.debt_ratio > 5000) concerns.push(`Debt ratio ${fmtPct(metrics.debt_ratio)} is elevated.`);
  if (metrics.labour_cost_pct != null && metrics.labour_cost_pct > 3000) concerns.push(`Labour cost ${fmtPct(metrics.labour_cost_pct)} above 30% target.`);
  if (metrics.cash_runway != null && metrics.cash_runway > 0 && metrics.cash_runway < 13) concerns.push(`Cash runway only ${metrics.cash_runway} weeks.`);
  if (activity.alerts) concerns.push(`${activity.alerts} open alert(s) this week.`);
  if (!strengths.length) strengths.push("No material deterioration detected in available metrics.");
  if (!concerns.length) concerns.push("Limited prior-period data; trend direction not yet established.");
  const outlook = ownerScore != null ? (ownerScore >= 80 ? "strong" : ownerScore >= 65 ? "stable" : ownerScore >= 50 ? "cautious" : "at_risk") : "cautious";
  return {
    headline: `Period ${period.start}→${period.end}: revenue ${fmt$(metrics.revenue)}, net profit ${fmt$(metrics.net_profit)}, Owner Score ${ownerScore != null ? ownerScore.toFixed(1) : "n/a"}.`,
    strengths, concerns,
    recommended_actions: [
      { action: "Review open alerts and assign owners.", priority: activity.alerts ? "high" : "medium", rationale: `${activity.alerts || 0} alerts require attention this week.` },
      { action: "Confirm next-period forecast against actuals.", priority: "medium", rationale: "Keeps the forecast baseline honest." },
    ],
    outlook, confidence: "medium",
  };
}

export function summaryKey(orgId: string, siteId: string | null, contextHash: string): string {
  return `ai|${orgId}|${siteId || "_"}|${contextHash}`;
}

function simpleHash(s: string): string {
  let h = 0; for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16);
}