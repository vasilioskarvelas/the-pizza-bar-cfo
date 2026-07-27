// Phase 14 — Entity backup/export (external, Node 20+).
// Exports entity data to JSON files in ./backups/<timestamp>/.
// Bounded reads (1000/call). Where >1000 records exist, export notes truncation.
//
// Usage: node scripts/backup-entities.mjs
// Env: BASE44_ADMIN_TOKEN (admin user access token), BASE44_APP_ID. Service role is not available externally; an admin token is required and RLS applies.

import { createClient } from '@base44/sdk';
import { mkdir, writeFile } from 'node:fs/promises';

const S = createClient({ appId: process.env.BASE44_APP_ID, token: process.env.BASE44_ADMIN_TOKEN });

// Export order respects relationships (parents before children).
const ENTITY_ORDER = [
  'Organisation', 'Site', 'SiteGroup', 'SiteGroupMembership',
  'UserProfile', 'Role', 'Permission', 'RolePermission', 'UserOrganisationRole', 'UserSiteAccess',
  'Account', 'AccountMapping', 'CostCentre', 'TaxRate', 'KPIDefinition', 'KPIThresholdVersion',
  'ScoreMethodologyVersion', 'ScoreMethodologyComponent', 'ScoreMethodologyInput',
  'Connector', 'ConnectorRun', 'ImportBatch', 'SourceRecord', 'ImportError',
  'ManualCommitment', 'CommitmentVersion', 'CommitmentSourceLink', 'CommitmentDuplicateCandidate',
  'CalculationRun', 'CalculationResult', 'CalculationLineage',
  'ReconciliationRun', 'ReconciliationException',
  'ExecutiveGoal', 'Initiative', 'ExecutiveDecision', 'ExecutiveRisk', 'Opportunity',
  'GoalCategory', 'InitiativeTemplate', 'ExecutiveReportTemplate', 'RiskRule', 'OpportunityRule',
  'ExecutiveDashboardSetting', 'ExecutiveAlert', 'AlertRule', 'DashboardWidget',
  'Scenario', 'ForecastAssumption', 'FutureObligation', 'ForecastResult',
  'WeeklyReport', 'WeeklyReportSetting', 'AISummary',
  'ComplianceItem', 'ComplianceRule', 'VaultDocument', 'DocumentVersion', 'DocumentCategory',
  'BrandingSetting', 'PlatformSetting', 'FeatureFlag',
  'Notification', 'SystemEvent', 'AuditLog',
];

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `backups/${ts}`;

(async () => {
  if (!process.env.BASE44_ADMIN_TOKEN) { console.error('BLOCKED: BASE44_ADMIN_TOKEN required (service role not available externally).'); process.exit(2); }
  await mkdir(dir, { recursive: true });
  const manifest = [];
  for (const name of ENTITY_ORDER) {
    let rows = [];
    try { rows = await S.entities[name].filter({}, '-created_date', 1000); }
    catch (e) { console.warn(`skip ${name}: ${e.message}`); continue; }
    await writeFile(`${dir}/${name}.json`, JSON.stringify(rows, null, 2));
    const truncated = rows.length >= 1000;
    manifest.push({ entity: name, count: rows.length, truncated, file: `${name}.json` });
    console.log(`${name}: ${rows.length}${truncated ? ' (may be truncated — SDK page cap)' : ''}`);
  }
  await writeFile(`${dir}/MANIFEST.json`, JSON.stringify({ exported_at: ts, entity_order: ENTITY_ORDER, entities: manifest }, null, 2));
  console.log(`\nBackup written to ${dir}/`);
  console.log('LIMITATIONS: secrets, auth/session state, file binaries (only metadata URLs),');
  console.log('workflow definitions (re-export from base44/workflows/*.jsonc), and point-in-time');
  console.log('recovery are NOT covered. Records beyond the 1000/call SDK cap are truncated.');
})();