# Scheduled Workflow Verification — Phase 14

| Workflow | File | Cron | Timezone | Status (builder) | Run history (builder) |
|---|---|---|---|---|---|
| Financial Calculations | `base44/workflows/Financial Calculations.jsonc` | `0 6 * * *` (daily 06:00) | Australia/Melbourne | active | VERIFIED — last 3 runs ok (2026-07-24/25/26) |
| Connector Auto Sync | `base44/workflows/Connector Auto Sync.jsonc` | `0 * * * *` (hourly) | Australia/Melbourne | active | VERIFIED — 10 recent hourly runs ok |
| Weekly Report | `base44/workflows/Weekly Report.jsonc` | `0 8 * * 1` (Mon 08:00) | Australia/Melbourne | active | UNVERIFIED — zero run history; first Monday fire pending |
| Compliance reminders | (none) | — | — | NOT CONFIGURED | n/a — no dedicated workflow; compliance reminder logic lives in `ComplianceItem.reminder_days`/`last_reminder_at` but no scheduled job emits reminders. **Action:** add a scheduled workflow `runComplianceReminders` or document reminders as out of scope. |
| AI Summary schedules | (none) | — | — | NOT CONFIGURED | n/a — AI summaries are generated on demand (`generateAISummary`) and by the weekly report; no standalone schedule. **Action:** add a schedule if periodic AI summaries are required. |

## Evidence to collect (external)
For each workflow, capture and paste into `Admin → Test Results`:
- workflow name, last run id, last run timestamp (Melbourne), duration, result (ok/fail), error text, idempotency key (cache hash) where applicable.

## Weekly Report — DO NOT mark verified until
A real Monday 08:00 `Australia/Melbourne` execution is observed successfully (status ok, WeeklyReport records created/notified for every org + active site). Verify via the Workflows dashboard or `get_workflow_run(workflow_name="Weekly Report")` after the next Monday 08:00 Melbourne.

## Daylight saving
Cron evaluates in `Australia/Melbourne`; AEDT→AEST and AEST→AEDT transitions are handled by the scheduler automatically. Confirm one boundary transition in production monitoring.