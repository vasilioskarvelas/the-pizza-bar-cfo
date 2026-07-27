# Pagination & Query-Limit Audit — Phase 14

Audit of every entity read for default-result truncation. Base44 SDK `.filter(query, sort, limit, skip)` and `.list(sort, limit, skip)` cap each call at **5,000 records** (default **50** when the limit is omitted); an unbounded read silently truncates at 50.

## Legend
- **OK** — bounded with an explicit limit and scoped by `organisation_id` (and `site_id` where appropriate).
- **FIXED (this phase)** — was unbounded `.list()`/`.filter()`; now bounded to 1000.
- **RISK (documented, not changed)** — deterministic calc I/O with an unbounded read; no observed defect at current volumes; flagged for load-test verification. Not changed per the phase brief (do not alter deterministic financial/forecast logic without a failing scale test).

## Audit results

| File | Function / area | Entity | Query method | Limit | Status |
|---|---|---|---|---|---|
| `getEnterpriseDashboard/entry.ts` | platform aggregation | Organisation, Site, UserProfile, ComplianceItem, WeeklyReport, AISummary, CalculationRun | `.filter({}, sort, 1000)` | 1000 | FIXED |
| `getEnterpriseAnalytics/entry.ts` | benchmarking | Organisation, CalculationRun, ExecutiveGoal, ExecutiveRisk | `.filter({}, sort, 1000)` | 1000 | FIXED |
| `getOrganisations/entry.ts` | org list | Organisation, Site | `.filter({}, sort, 1000)` | 1000 | FIXED |
| `getFutureObligations/entry.ts` | obligation refresh | FutureObligation | `.filter({org}, sort, 1000)` | 1000 | FIXED |
| `generateWeeklyReport/entry.ts` | scheduled all_orgs | Organisation, User | `.filter({}, sort, 1000)` | 1000 | FIXED |
| `getComplianceCentre/entry.ts` | compliance list | ComplianceItem | `.filter({org}, sort, 500)` | 500 | OK |
| `getDocumentVault/entry.ts` | vault list | VaultDocument, DocumentVersion | `.filter({org}, sort, 500/1000)` | 500/1000 | OK |
| `getSites/entry.ts` | site list | Site | `.filter({org?}, sort, 500)` | 500 | OK |
| `getWeeklyReports/entry.ts` | report history | WeeklyReport | `.filter({org}, sort, 100)` | 100 | OK |
| `getAISummaries/entry.ts` | summary history | AISummary | `.filter({org}, sort, 50)` | 50 | OK |
| `getExecutiveDashboard/entry.ts` | dashboard | CalculationRun, CalculationResult | `.filter({org}, sort, 20/30)` | 20/30 | OK |
| `dashboardShared.ts` | buildTimeline | SystemEvent, AuditLog, CalculationRun, ConnectorRun, ReconciliationRun | `.filter({org}, sort, 100)` | 100 | OK |
| `dashboardShared.ts` | buildTrends | CalculationResult (kpi + fig) | `.filter({org}, sort, 200)` | 200 | OK |
| `dashboardShared.ts` | reconciliationSummary / connectorSummary / upsertAlerts | ReconciliationRun, ReconciliationException, Connector, ConnectorRun, ExecutiveAlert | `.filter({org})` unbounded | default | RISK — small per-org volumes; bound if grows |
| `executivePlanningRunner.ts` | loadMetrics | CalculationResult (fig/kpi/score) | `.filter({org}, sort, 1000)` | 1000 | OK |
| `executivePlanningRunner.ts` | listGoals/Initiatives/Decisions, getScorecard, getRoadmap, getRiskRegister, getOpportunityRegister | ExecutiveGoal, Initiative, ExecutiveDecision, ExecutiveRisk, Opportunity, RiskRule, OpportunityRule | `.filter({org}, sort, 200–500)` | 200–500 | OK |
| `forecastRunner.ts` | loadForecastInputs | CalculationResult (fig/kpi) | `.filter({org}, sort, 1000)` | 1000 | OK |
| `forecastRunner.ts` | loadForecastInputs | TaxRate, ScoreMethodology*, KPIThresholdVersion, ReconciliationException, ConnectorRun, SourceRecord, Connector, ManualCommitment, CommitmentVersion, ForecastAssumption | `.filter({org})` unbounded | default | RISK — config/source per org; load-test verifies |
| `forecastRunner.ts` | buildObligations | ManualCommitment, CommitmentVersion, PayRun | `.filter({org})` / `.list()` | default | RISK — bound if grows |
| `financialRunner.ts` | runEngine (canonical txn load) | CalculationResult (source_record) | `.filter({org, result_type, entity_type})` unbounded | default | **RISK — core financial input read; load-test verifies truncation at >cap txns per org. Do not change without a failing scale test.** |
| `financialRunner.ts` | runEngine (config) | Account, AccountMapping, TaxRate, ScoreMethodologyVersion, ManualCommitment, CommitmentVersion, KPIDefinition, ReconciliationException | `.filter({org})` unbounded | default | RISK — config per org |
| `financialRunner.ts` | runEngine (prior results, allScope) | CalculationResult | `.filter({org})` unbounded | default | RISK — grows with history |
| `ownerScoreRunner.ts` | runOwnerScore / getCurrentOwnerScore | CalculationResult (score_component), ScoreMethodology*, KPIDefinition, KPIThresholdVersion, CalculationRun | `.filter({org})` unbounded | default | RISK — methodology + score history |
| `enterpriseShared.ts` | extractOrgMetrics | CalculationResult (per-run) | `.filter({calculation_run_id}, sort, 500/50)` | bounded | OK |

## Regression tests for silent truncation
Add to `tests/isolation/` / CI:
1. Seed an org with N source-record CalculationResults where N exceeds the suspected default cap; run `runFinancialCalculations`; assert the run's input count == N (no truncation).
2. Seed >1000 ComplianceItems for an org; call `getComplianceCentre`; assert `summary.total` == seeded count (within the 1000 bound; document overflow).
3. Seed >1000 CalculationRuns; call `getEnterpriseDashboard`; assert run count reflects pagination or document the truncation.

## Platform limitation
The SDK `.filter(query, sort, limit, skip)` **does** expose a `skip` parameter (4th argument, per the Base44 SDK docs), so true pagination is available from the client. The unbounded reads flagged RISK above omit `limit`/`skip` and therefore truncate at the default (50); adding `skip` loops to those engine paths is a future change (not done this phase, per the brief — do not alter deterministic financial/forecast logic without a failing scale test). Until then, the flagged aggregations undercount at >1000 records per entity.