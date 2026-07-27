# Phase 14B — External Verification Package

Phase 14 remains **IN PROGRESS — EXTERNAL VERIFICATION REQUIRED**. This package contains every script, fixture, manifest, and checklist needed to close the launch blockers in CI, a staging deployment, or another supported environment. **Do not mark any external test as passed unless runtime evidence is returned and stored** (paste results into **Admin → Test Results** in the app, schema: `docs/phase14/external-results-schema.json`).

Nothing in `tests/`, `scripts/`, `manifests/`, or `docs/` is imported by the app, so none of it affects the production build, lint (scoped to `src/components`+`src/pages`), or typecheck (scoped to `src/components`+`src/pages`+`src/Layout.jsx`).

---

## 1. Prerequisites
- Node 20+, npm 10+
- A deployed/staging app URL (`APP_URL`)
- `BASE44_API_KEY` + `BASE44_APP_ID` (service-role key with entity read/write) for dataset, backup, restore
- k6 installed (https://k6.io) for load tests
- Playwright installed externally for browser tests: `npm i -D @playwright/test && npx playwright install --with-deps chromium`
- 12 invited test accounts (see §4) with real, monitored mailboxes
- An isolated test tenant for dataset generation (not the production tenant)

## 2. Environment setup
```bash
npm ci
export APP_URL=https://YOUR_STAGING_URL
export BASE44_API_KEY=YOUR_SERVICE_KEY
export BASE44_APP_ID=YOUR_APP_ID
```

## 3. Required test accounts
See `manifests/test-accounts.json`. For each account: invite a real user (Settings → Users → Invite), assign role + site access, then export the authenticated access token after login for the permission/isolation runners. Synthetic entity data is separate from these users.

## 4. Environment-variable checklist (redacted)
| Var | Purpose | Required for |
|---|---|---|
| `BASE44_API_KEY` | service-role entity access | dataset, backup, restore |
| `BASE44_APP_ID` | target app | dataset, backup, restore |
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
npx playwright test tests/e2e/smoke.spec.js --project=chromium
```
A `playwright.config.js` is included. `beforeAll` logs in once via the UI (using `E2E_USER_*`) and saves a storage state to `tests/e2e/.auth/user.json`; protected tests reuse it. The login-flow and unauthorised-admin tests use fresh unauthenticated contexts.
Suite covers: login, dashboard, enterprise dashboard/analytics, compliance, document vault, orgs/sites/roles admin, direct route refresh, logout, session expiry, unauthorised admin route, missing route, API-failure/empty/loading states. Fails on uncaught page errors, unexpected console errors, failed critical network requests; screenshots on failure (`tests/e2e/screenshots/`).

## 8. Load-test commands
```bash
k6 run -e BASE_URL=$APP_URL -e STAGE=smoke   tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=normal  tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=peak    tests/k6/load-tests.js
k6 run -e BASE_URL=$APP_URL -e STAGE=stress  tests/k6/load-tests.js
```
Set `FUNCTIONS_PATH` (default `/_functions`) if your deployed app exposes backend functions at a different path. Profiles: smoke (5 VUs/2m), normal (20 VUs/10m), peak (100 VUs/15m), stress (ramp to failure). Captures rps, avg, p95, p99, error rate, timeouts, rate-limit responses, server failures.
Thresholds: reads P95 <2s, dashboards <4s, reports <8s, error rate <1%, zero tenant leakage, zero unhandled errors.

## 9. Dataset-generation commands
```bash
node scripts/generate-test-dataset.mjs --dry-run            # plan only
node scripts/generate-test-dataset.mjs --before-counts      # lower-bound counts per entity (SDK caps at 1000)
node scripts/generate-test-dataset.mjs --config=datasets/prod-scale.json   # custom counts
node scripts/generate-test-dataset.mjs                      # create (isolated tenant!)
node scripts/generate-test-dataset.mjs --cleanup            # delete the records created this run
```
Defaults: 25 orgs, 150 sites, 500 users (→ invitation manifest, since User records are invite-only), 20k txns, 5k compliance, 2k docs, 500 reports, 500 summaries, 1k runs, 10k results, 1k goals, 1k risks, 500 forecasts, 250 scenarios. Deterministic seed, integer cents, Australian business data, no real customer info, batch + rate-limit + retry, dry-run + cleanup modes. User invitations are written to `manifests/test-accounts.generated.json`.

## 10. Permission-test commands
```bash
node tests/permissions/run-permission-matrix.mjs --base $APP_URL --credentials creds.json
# creds.json: [{ role, email, password, access_token, organisation_id, site_id }]
```
Matrix: `tests/permissions/permission-matrix.json` (every role × page/function/action, expected allow/deny). Tests backend enforcement (HTTP status) — authoritative — plus optional frontend visibility via Playwright reuse.

## 11. Tenant-isolation-test commands
```bash
node tests/isolation/tenant-isolation.mjs --base $APP_URL --creds isolation-creds.json
# isolation-creds.json: 3 orgs (A/B/C) x 2 sites, each with an authenticated token
```
Attempts cross-tenant access via modified org/site/record ids, direct function calls, direct URLs, cached state, removed permissions, suspended/deleted users, stale sessions. **Fails immediately on any cross-tenant record, metadata, or protected file URL returned.**

## 12. Backup commands
```bash
node scripts/backup-entities.mjs        # writes backups/<timestamp>/*.json + MANIFEST.json
```
Entity inventory + export order in the script. Limitations: secrets, auth/session state, file binaries (metadata URLs only), workflow definitions (re-export from `base44/workflows/*.jsonc`), point-in-time recovery are NOT covered. Records beyond the 1000/call SDK cap are truncated — noted in MANIFEST.

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
- Permissions: matrix 100% pass
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

## Items still requiring credentials / external execution
- Real test email mailboxes for the 12 role accounts (§4)
- `BASE44_API_KEY` / `BASE44_APP_ID` for dataset/backup/restore
- k6, Playwright installs
- Copy of `phase14-ci.yml` into `.github/workflows/` on the repo
- External CI run, preview server, load runner, isolation tenant

## Known limitations
- User records are invite-only — 500 authenticated identities require real mailboxes; synthetic data is separate from authenticated-user testing.
- SDK `.filter` has no `skip` — pagination beyond ~1000/entity unavailable from the client; enterprise aggregation undercounts at very large scale (see pagination-audit.md).
- Deterministic financial/forecast runners contain unbounded per-org reads (source records, config, history) — latent truncation risk; **not changed** per the phase brief; load-test regression must prove truncation before any change.
- No platform-level backup/restore tool — backup is entity export only; auth state, secrets, file binaries, workflow history, point-in-time recovery are not covered.
- Weekly Report scheduled execution not yet observed.

**PHASE 14B PACKAGE READY — EXTERNAL EXECUTION REQUIRED**