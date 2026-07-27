# Phase 14 — External Verification Package (audited through Phase 14G)

Phase 14 remains **IN PROGRESS — EXTERNAL VERIFICATION REQUIRED**. This package contains every script, fixture, manifest, and checklist needed to close the launch blockers in CI, a staging deployment, or another supported environment. **Do not mark any external test as passed unless runtime evidence is returned and stored** (paste results into **Admin → Test Results** in the app, schema: `docs/phase14/external-results-schema.json`).

Nothing in `tests/`, `scripts/`, `manifests/`, or `docs/` is imported by the app, so none of it affects the production build, lint (scoped to `src/components`+`src/pages`), or typecheck (scoped to `src/components`+`src/pages`+`src/Layout.jsx`).

---

## 1. Prerequisites
- Node 20+, npm 10+
- A deployed/staging app URL (`APP_URL`)
- `BASE44_ADMIN_TOKEN` (an admin user's Base44 access token) + `BASE44_APP_ID` for dataset, backup, restore. The service role is **not** available via the external SDK (`createClient`), so an authenticated admin token is required and RLS applies.
- k6 installed (https://k6.io) for load tests
- Playwright installed externally for browser tests: `npm i -D @playwright/test && npx playwright install --with-deps chromium`
- 12 invited test accounts (see §4) with real, monitored mailboxes
- An isolated test tenant for dataset generation (not the production tenant)

## 2. Environment setup
```bash
npm ci
export APP_URL=https://YOUR_STAGING_URL
export BASE44_ADMIN_TOKEN=YOUR_ADMIN_ACCESS_TOKEN
export BASE44_APP_ID=YOUR_APP_ID
```

## 3. Required test accounts
See `manifests/test-accounts.json`. For each account: invite a real user (Settings → Users → Invite), assign role + site access, then export the authenticated access token after login for the permission/isolation runners. Synthetic entity data is separate from these users.

## 4. Environment-variable checklist (redacted)
| Var | Purpose | Required for |
|---|---|---|
| `BASE44_ADMIN_TOKEN` | admin user access token (service role is not available externally) | dataset, backup, restore |
| `BASE44_APP_ID` | target app | dataset, backup, restore, permissions, isolation |
| `APP_URL` / `E2E_BASE_URL` | deployed app URL | e2e, load, permissions, isolation |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | standard user | e2e |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | admin user | e2e admin |
| `XERO_CLIENT_ID/SECRET/REDIRECT_URI` | live Xero OAuth | connector runtime (optional) |
Confirm: debug flags off, test data absent from production tenant, no secrets in source.

## 5. CI commands
The CI workflow lives at `docs/phase14/phase14-ci.yml` (the Base44 GitHub-sync app cannot write `.github/workflows/`). Copy it into `.github/workflows/phase14-ci.yml` on your repo.
```bash
npm ci
npm run typecheck      # hard-fail
npm run lint           # advisory (scoped to src)
npm run build          # hard-fail; produces dist/
```
Record: Node version, npm version, exit codes, build duration, bundle sizes (`ls -la dist/assets`), warnings, errors.

## 6. Production-preview commands
```bash
npm run build
npm run preview -- --host 0.0.0.0
# open http://localhost:4173 — verify load, auth, protected/admin routes, refresh, static assets
```

## 7. Browser-test commands
```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium
E2E_BASE_URL=http://localhost:4173 \
E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
npx playwright test tests/e2e/smoke.spec.js --project=chromium
```
A `playwright.config.js` is included. `beforeAll` logs in BOTH an admin (`E2E_ADMIN_*`) and a standard non-admin (`E2E_USER_*`), saving storage states to `tests/e2e/.auth/{admin,user}.json`. Admin-gated tests use the admin state; the non-admin denial test uses the user state; the login-flow and unauthenticated-admin tests use fresh contexts. `E2E_USER_*` must be a non-admin account for the denial test to be valid.
Suite covers: login redirect, dashboard load, enterprise dashboard/analytics, compliance centre, document vault, admin shell (orgs/sites/roles), direct route refresh, missing-route handling, non-admin admin denial, unauthenticated admin redirect. Fails on uncaught page errors and console errors; screenshots on failure (`tests/e2e/screenshots/`). **Not covered by the current spec:** logout, session expiry, and API-failure/empty/loading states — add specs if those flows must be verified.

## 8. Load-test commands
```bash
k6 run -e BASE_URL=$APP_URL -e STAGE=smoke   tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=normal  tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=peak    tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=stress  tests/k6/load-tests.js
```
Set `FUNCTIONS_PATH` (default `/functions`, per Base44 docs) if your app exposes functions at a different path. Set `BASE44_ACCESS_TOKEN` to a user access token — the dashboard/report functions are authenticated and will reject (401) unauthenticated load traffic. Profiles: smoke (5 VUs/2m), normal (20 VUs/10m), peak (100 VUs/15m), stress (ramp to failure). Captures rps, avg, p95, p99, error rate, timeouts, rate-limit responses, server failures.
Thresholds: reads P95 <2s, dashboards <4s, reports <8s, error rate <1%, zero tenant leakage, zero unhandled errors.
> **k6 caveat:** k6 cannot import the Base44 SDK (k6 runtime), so it calls `/functions/<name>` with raw HTTP + an `Authorization: Bearer` header. This relies on `createClientFromRequest` honouring that header (the same mechanism `invoke()` uses). If the first smoke run returns 401s, that path is not establishing user context — replace k6 with an SDK-based Node load script (`createClient({appId, token}).functions.invoke`) instead.

## 9. Dataset-generation commands
```bash
node scripts/generate-test-dataset.mjs --dry-run            # plan only
node scripts/generate-test-dataset.mjs --before-counts      # lower-bound counts per entity (script bound 1000; SDK max 5000/call)
node scripts/generate-test-dataset.mjs --config=datasets/prod-scale.json   # custom counts
node scripts/generate-test-dataset.mjs                      # create (isolated tenant!)
node scripts/generate-test-dataset.mjs --cleanup            # delete the records created this run
```
Defaults: 25 orgs, 150 sites, 500 users (→ invitation manifest, since User records are invite-only), 5k compliance, 2k docs, 500 reports, 500 summaries, 1k runs, 10k results, 1k goals, 1k risks, 500 forecasts, 250 scenarios. SalesTransaction is NOT generated (entity create is denied to all app users — service-role only). Deterministic seed, integer cents, Australian business data, no real customer info, batch + rate-limit + retry, dry-run + cleanup modes. User invitations are written to `manifests/test-accounts.generated.json`.

> **RLS limitation:** the external SDK has no service role, so an admin token can only create org-scoped entities (WeeklyReport, AISummary, ForecastResult, Scenario, ExecutiveGoal, ExecutiveRisk) for its own organisation. Full multi-org seeding requires a service-role backend function (not built this phase); until then multi-org generation is BLOCKED — use a single-org config or accept per-batch RLS rejections (logged).

## 10. Permission-test commands
```bash
BASE44_APP_ID=$BASE44_APP_ID node tests/permissions/run-permission-matrix.mjs --credentials creds.json
# creds.json: [{ role, email, access_token, organisation_id, site_id }]  (no --base: uses SDK functions.invoke)
```
Matrix: `tests/permissions/permission-matrix.json` (every role × page/function/action, expected allow/deny). Tests backend enforcement via the SDK `functions.invoke` (the documented path that establishes user context — raw fetch has none). The runner sends an **empty body**: every target function checks auth (401/403) before input validation (400), so 403=deny, 400/404/409=allow (passed the auth gate, no side effect), 200=allow, 401=BLOCK (token/no user context), 500=ERROR (inconclusive). Requires `BASE44_APP_ID`. RLS-only rows with no dedicated backend function (AuditLog view, ExecutiveGoal update, ExecutiveRisk create, ComplianceItem delete) are reported as **SKIP**, not failed — verify them via the isolation suite or by confirming the entity REST path externally. A FAIL means either an over-permissive function or an over-strict expectation — review each before launch.

## 11. Tenant-isolation-test commands
```bash
node tests/isolation/tenant-isolation.mjs --base $APP_URL --creds isolation-creds.json
# isolation-creds.json: 3 orgs (A/B/C) x 2 sites, each with an authenticated token
# Env: BASE44_APP_ID (required for createClient). --base is used only by the unauthenticated-bypass probe (test 6).
```
Attempts cross-tenant access via modified org/site ids and direct function calls (getEnterpriseAnalytics, getComplianceCentre, getDocumentVault, generateAISummary). Direct entity-record reads are **SKIPPED** — Base44 exposes no documented generic entity REST endpoint; isolation is verified at the function layer (which applies org+site RLS). Removed-permission / suspended-user / stale-session steps are manual. **Fails immediately on any cross-tenant record or metadata returned.**

## 12. Backup commands
```bash
node scripts/backup-entities.mjs        # writes backups/<timestamp>/*.json + MANIFEST.json
```
Entity inventory + export order in the script. Limitations: secrets, auth/session state, file binaries (metadata URLs only), workflow definitions (re-export from `base44/workflows/*.jsonc`), point-in-time recovery are NOT covered. Records beyond the 1000-record script bound are truncated (SDK max 5000/call) — noted in MANIFEST. Backup runs as the admin token user under RLS, so org-scoped entities are exported only for that user's organisation; cross-org backup requires per-org admin tokens or a service-role function.

## 13. Restore commands
```bash
node scripts/restore-entities.mjs backups/<timestamp>   # ISOLATED tenant only
```
Restores in dependency order; new ids are generated (existing ids not overwritten). Relationship ids must be remapped if restoring cross-tenant.

## 14. Cleanup commands
```bash
node scripts/generate-test-dataset.mjs --cleanup        # remove generated records
# delete test organisations/sites/users/documents created for isolation tests
# confirm production tenant record counts unchanged (before/after)
```

## 15. Evidence to capture
For every test, paste a result object into **Admin → Test Results** (schema `docs/phase14/external-results-schema.json`):
```json
{ "test_id": "ci-build", "suite": "ci", "environment": "github-actions",
  "command": "npm run build", "started_at": "...", "completed_at": "...",
  "exit_code": 0, "status": "passed", "metrics": { "bundle_kb": 480, "duration_ms": 32000 },
  "errors": [], "evidence": ["https://github.com/.../runs/..."] }
```

## 16. Pass/fail thresholds
- CI: typecheck + build exit 0
- Preview: app loads, no console/network errors, all routes resolve
- E2e: all smoke specs pass
- Permissions: matrix 100% pass on executable checks (RLS-only rows SKIP — see §10; the "Known project defects" below will cause failures until the functions are fixed)
- Isolation: zero cross-tenant leakage
- Load: reads P95 <2s, dashboards <4s, reports <8s, error rate <1%
- Backup/restore: round-trip counts match (within documented truncation)
- Weekly Report: one real Monday 08:00 Australia/Melbourne execution observed ok
- Cleanup: production tenant counts unchanged

## 17. Final sign-off checklist
- [ ] `npm run build` exit 0 (CI evidence stored)
- [ ] Production preview passes
- [ ] Browser smoke suite passes
- [ ] Permission matrix passes (all roles)
- [ ] Tenant-isolation suite passes (3 orgs)
- [ ] Load thresholds met (smoke/normal/peak)
- [ ] Backup + restore verified (isolated tenant)
- [ ] Weekly Report scheduled execution observed (Monday 08:00 Melbourne)
- [ ] All external results imported to Admin → Test Results
- [ ] Test data cleaned up; production tenant integrity confirmed
- [ ] Phase 14 status flipped to VERIFIED (only after all above)

## Package contents
- `docs/phase14/phase14-ci.yml` — CI workflow (copy to `.github/workflows/`)
- `scripts/generate-test-dataset.mjs` — dataset generator
- `scripts/backup-entities.mjs`, `scripts/restore-entities.mjs` — backup/restore
- `tests/k6/load-tests.js` — k6 load scenarios
- `tests/e2e/smoke.spec.js` — Playwright smoke suite
- `tests/permissions/permission-matrix.json`, `tests/permissions/run-permission-matrix.mjs`
- `tests/isolation/tenant-isolation.mjs`
- `manifests/test-accounts.json` — invited account manifest
- `docs/phase14/scheduled-workflows.md`, `monitoring-checklist.md`, `pagination-audit.md`, `external-results-schema.json`
- `base44/entities/ExternalTestResult.jsonc` + `src/pages/admin/ExternalTestResults.jsx` — imported-results tracker (Admin → Test Results)

## Known project defects (will surface as test failures during external runs)
These are application/function issues, NOT Base44 platform limitations. They block launch and must be fixed in the app — the runners correctly surface them; do NOT "fix" the matrix to match the buggy code.
- **Unauthenticated actor bypass:** `resolveEnterpriseActor` (`enterpriseShared.ts`) and `resolveActor` (`authEvents.ts`) fall back to `{ isPlatformAdmin: true }` / `{ isAdmin: true }` when `base44.auth.me()` is null AND `body.organisation_id` is present. An unauthenticated direct-HTTP caller that supplies any `organisation_id` is treated as a platform admin for that org. The isolation suite probes this (test 6: unauthenticated `getComplianceCentre` with a foreign org id); a 200 = bypass confirmed.
- **Over-permissive create functions:** `createSite` and `createComplianceItem` allow ANY authenticated org member (not just admins) past their auth gate — they check `!actor.isPlatformAdmin && !actor.orgId` (true for any org member), then proceed. The matrix expects `site_manager:Site:create` and `site_manager:ComplianceItem:create` to DENY; the functions currently ALLOW them.
- **Role-name mismatch:** `resolveActor` treats only `system_role === 'owner' | 'system'` as admin. Roles named `org_owner` / `enterprise_admin` are NOT admin unless their stored `system_role` is exactly `owner`/`system`. Matrix rows expecting those roles to act as admins may fail until role values or the resolver align.
- **Coarse cross-site scoping:** `getDocumentVault` filters only by `organisation_id` for non-platform admins (not `site_id`), so a site manager receives all documents in their org regardless of site access. The isolation suite's site check reflects this; tighten if site-level isolation is required.

## Items still requiring credentials / external execution
- Real test email mailboxes for the 12 role accounts (§4)
- `BASE44_ADMIN_TOKEN` / `BASE44_APP_ID` for dataset/backup/restore; `BASE44_APP_ID` (+ per-account access tokens) for permission/isolation runners; `BASE44_ACCESS_TOKEN` for k6
- k6, Playwright installs
- Copy of `phase14-ci.yml` into `.github/workflows/` on the repo
- External CI run, preview server, load runner, isolation tenant

## Known limitations
- User records are invite-only — 500 authenticated identities require real mailboxes; synthetic data is separate from authenticated-user testing.
- SDK `.filter` supports a `skip` parameter (4th argument, per docs); the unbounded engine reads flagged in pagination-audit.md omit it and truncate at the default (50). Paginating them is a future change, not done this phase.
- Deterministic financial/forecast runners contain unbounded per-org reads (source records, config, history) — latent truncation risk; **not changed** per the phase brief; load-test regression must prove truncation before any change.
- No platform-level backup/restore tool — backup is entity export only; auth state, secrets, file binaries, workflow history, point-in-time recovery are not covered.
- Cross-org dataset seeding via the external SDK is blocked by RLS (org-scoped entities require `data.organisation_id == user.data.organisation_id`); full multi-org seeding needs a service-role backend function (not built this phase).
- Entities with `create: false` (e.g. `SalesTransaction`) cannot be created externally — service-role only; excluded from the dataset generator.
- External `@base44/sdk` `createClient` takes `appId` + an optional user `token` (NOT `apiKey`); the service role (`asServiceRole`) is only available inside Base44-hosted functions, so external dataset/backup/restore run as the authenticated admin user under RLS.
- Weekly Report scheduled execution not yet observed.

**PHASE 14 PACKAGE READY FOR EXTERNAL EXECUTION — APP NOT YET VERIFIED (known project defects must be fixed first)**