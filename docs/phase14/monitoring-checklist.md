# Monitoring Checklist — Phase 14

Base44 provides: `SystemEvent`, `AuditLog`, run statuses (`CalculationRun`, `ConnectorRun`, `ReconciliationRun`), `ExecutiveAlert`, and the Workflows run-history dashboard. **No new internal monitoring product was built** — the brief advised against one.

## What is observable natively
- Backend function failures: each function try/catch returns 500 + (for calc/owner-score/connector runs) marks the run `failed` and publishes a failure `SystemEvent` + `AuditLog`.
- Scheduled job failures: workflow run history (`get_workflow_run`) records per-run status/duration.
- AI failures: `AISummary.validation_status` + `used_fallback` + `ai_summary.generated` event.
- Auth/permission-denied: `AuditLog` `action_type: read_sensitive` failures; `manageAccess` rejections.

## External integration required (Base44 does not provide native alerting)
Configure in your deployment platform's observability stack:
1. **Backend-function failure rate** — alert if 5xx rate > 1% over 5 min.
2. **Scheduled-job failure** — alert on any workflow run status `failed`.
3. **AI-summary fallback spike** — alert if `used_fallback` rate > 20% over 1h.
4. **Auth failure spike** — alert on 401/403 rate > baseline+3σ.
5. **Permission-denied spike** — alert on 403 rate > 10/min (possible brute-force or isolation probe).
6. **Slow requests** — alert if P95 > 2s (reads) / 4s (dashboards) / 8s (reports).
7. **File-upload failures** — alert on `uploadDocument` 5xx.
8. **Report-generation failures** — alert on `generateWeeklyReport`/`generateAISummary` 5xx.
9. **Build/deploy failures** — CI workflow `phase14-ci.yml` red status.
10. **Tenant-isolation alerts** — alert on any 200 response returning records whose `organisation_id` ≠ caller org (monitor via a synthetic cross-org probe job).

## Recommended tooling
- Log/metric ingestion: the deployment platform's logs (every function logs to stdout; capture externally).
- APM: wrap function entry/exit with timing.
- Uptime: synthetic probe hitting `getExecutiveDashboard` every 60s.