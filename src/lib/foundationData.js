// HFOS ERD v1.0 (LOCKED) + Addendum 001 — foundation metadata.
// Describes the locked schema (42 entities), logical zones, RLS patterns,
// verification status, platform limitations, and the Addendum 001 Version 1
// build order (§7.1). Descriptive configuration only — no financial data.

export const ZONES = [
  {
    name: 'source',
    description: 'Immutable, append-only raw ingestion: Connector → ConnectorRun → ImportBatch → SourceRecord → ImportError. Raw payload retained verbatim; corrections are superseding records, never edits.',
    entities: ['Connector', 'ConnectorRun', 'ImportBatch', 'SourceRecord', 'ImportError'],
  },
  {
    name: 'canonical',
    description: 'The reconciled system truth — commitments, deterministic calculation outputs with full lineage, and reconciliation runs/exceptions.',
    entities: ['ManualCommitment', 'CommitmentVersion', 'CommitmentSourceLink', 'CommitmentDuplicateCandidate', 'CalculationRun', 'CalculationResult', 'CalculationLineage', 'ReconciliationRun', 'ReconciliationException'],
  },
  {
    name: 'mart',
    description: 'Denormalised precomputed aggregates for dashboard performance. Fully rebuildable — nothing here is authoritative. Not yet populated.',
    entities: [],
  },
  {
    name: 'audit',
    description: 'Immutable, append-only event and audit streams. Write-only to application users; read restricted to admins.',
    entities: ['SystemEvent', 'AuditLog'],
  },
  {
    name: 'configuration',
    description: 'Structural, reference, identity, delivery, and governance data — tenant structure, identity/RBAC, chart of accounts, tax rates, KPI definitions, methodology, notifications, feature flags, and governance rules.',
    entities: [
      'Organisation', 'Site', 'SiteGroup', 'SiteGroupMembership',
      'UserProfile', 'Role', 'Permission', 'RolePermission',
      'UserOrganisationRole', 'UserSiteAccess',
      'Account', 'AccountMapping', 'CostCentre', 'TaxRate',
      'KPIDefinition', 'KPIThresholdVersion',
      'ScoreMethodologyVersion', 'ScoreMethodologyComponent', 'ScoreMethodologyInput',
      'ApproximationRegister', 'SourceAuthorityRule', 'MaterialityRule', 'DataFreshnessRule',
      'Notification', 'FeatureFlag',
    ],
  },
];

export const RLS_PATTERNS = [
  {
    name: 'ORG',
    description: 'Read scoped to user.organisation_id; create/update/delete restricted to admins of the same organisation.',
    entities: ['SiteGroup', 'Role', 'Permission', 'RolePermission', 'Account', 'AccountMapping', 'TaxRate', 'KPIDefinition', 'KPIThresholdVersion', 'ScoreMethodologyVersion', 'ScoreMethodologyComponent', 'ScoreMethodologyInput', 'ApproximationRegister', 'SourceAuthorityRule', 'MaterialityRule', 'DataFreshnessRule'],
  },
  {
    name: 'ORG+SITE',
    description: 'Read/create/update scoped to organisation AND (admin OR site_id in user.site_ids OR site_id null). Admin-only delete.',
    entities: ['Site', 'SiteGroupMembership', 'CostCentre', 'UserSiteAccess', 'Connector', 'ConnectorRun', 'ImportBatch', 'CalculationRun', 'ReconciliationRun', 'ReconciliationException', 'FeatureFlag'],
  },
  {
    name: 'IMMUTABLE',
    description: 'Read scoped to org/site; admin-only create; update and delete denied to ALL app users (false). Only the service role (ingestion/engine) writes.',
    entities: ['SourceRecord', 'ImportError', 'CommitmentVersion', 'CommitmentSourceLink', 'CalculationResult', 'CalculationLineage'],
  },
  {
    name: 'COMMITMENT',
    description: 'Read scoped to org AND (admin OR shared scope OR site_id in user.site_ids). Admin-only delete. Soft-delete via deleted_at on ManualCommitment.',
    entities: ['ManualCommitment', 'CommitmentDuplicateCandidate'],
  },
  {
    name: 'AUDIT',
    description: 'Admin-only read within organisation. create/update/delete denied to ALL app users (false). Only the service role writes audit records.',
    entities: ['AuditLog'],
  },
  {
    name: 'SYSTEM-EVENT',
    description: 'Organisation-scoped read; create/update/delete denied to ALL app users (false). Free-string namespaced event_key. Only the service role publishes events.',
    entities: ['SystemEvent'],
  },
  {
    name: 'IDENTITY',
    description: 'User reads their own profile/org-role records; admins manage all. UserSiteAccess is canonical; User.site_ids[] is a synchronised RLS cache only.',
    entities: ['UserProfile', 'UserOrganisationRole', 'UserSiteAccess'],
  },
  {
    name: 'NOTIFICATION',
    description: 'Delivery artefact derived from a SystemEvent. User reads own notifications; admins read all. Admin-only create/delete.',
    entities: ['Notification'],
  },
];

export const TESTS = [
  { id: 'T1', name: 'Strathmore-only user cannot access Diggers Rest data', category: 'Tenant isolation', status: 'rule_in_place', detail: 'ORG+SITE RLS filters site_id against user.data.site_ids; null site_id records visible org-wide. Runtime verification requires provisioned users (Phase 02 auth).' },
  { id: 'T2', name: 'User from another organisation cannot access The Pizza Bar', category: 'Tenant isolation', status: 'rule_in_place', detail: 'Every entity filters data.organisation_id == user.data.organisation_id.' },
  { id: 'T3', name: 'Site manager cannot read audit data', category: 'Role restriction', status: 'rule_in_place', detail: 'AuditLog read requires user_condition role=admin.' },
  { id: 'T4', name: 'Immutable entities reject application updates', category: 'Immutability', status: 'enforced', detail: 'update=false on SourceRecord, ImportError, CommitmentVersion, CommitmentSourceLink, CalculationResult, CalculationLineage.' },
  { id: 'T5', name: 'Immutable entities reject application deletes', category: 'Immutability', status: 'enforced', detail: 'delete=false on the same set.' },
  { id: 'T6', name: 'AuditLog rejects application writes', category: 'Audit', status: 'enforced', detail: 'create/update/delete=false; service role only.' },
  { id: 'T7', name: 'SystemEvent rejects application writes', category: 'Audit', status: 'enforced', detail: 'create/update/delete=false; service role publishes via event_key.' },
  { id: 'T8', name: 'User reads only own notifications unless admin', category: 'Notification', status: 'rule_in_place', detail: 'read: org AND (admin OR data.user_id == user.id).' },
  { id: 'T9', name: 'User.site_ids[] is only the RLS cache', category: 'Identity', status: 'rule_in_place', detail: 'UserSiteAccess is canonical; User.site_ids[] is denormalised with site_ids_synced_at. Sync is application-layer (deferred).' },
  { id: 'T10', name: 'Foreign-key & unique-constraint enforcement', category: 'Referential integrity', status: 'not_implemented', detail: 'Base44 has no DB-level FK/UQ. Application-layer validation module is a deferred implementation item (ERD-documented).' },
  { id: 'T11', name: 'Audit-on-write hash chain', category: 'Audit', status: 'not_implemented', detail: 'AuditLog hash-chain fields present; population requires backend-function wrappers (no DB triggers). Deferred.' },
  { id: 'T12', name: 'Xero import creates immutable SourceRecords', category: 'Ingestion', status: 'enforced', detail: 'runConnectorSync persists raw payload + payload_hash; SourceRecord update/delete=false. 9 records across 8 runs verified.' },
  { id: 'T13', name: 'Duplicate import never creates duplicate records', category: 'Idempotency', status: 'enforced', detail: 'idempotency_key=source_system|type|ext_id; matching payload_hash → skip. Re-run: imported 0, duplicates 3.' },
  { id: 'T14', name: 'Corrections are superseding records, never edits', category: 'Version tracking', status: 'enforced', detail: 'Changed payload_hash → new SourceRecord with supersedes_record_id; old marked superseded. Chain verified on C1-1000.' },
  { id: 'T15', name: 'Disabled connector refuses sync', category: 'Connector lifecycle', status: 'enforced', detail: 'status=disabled → runConnectorSync returns skipped, no run created.' },
  { id: 'T16', name: 'Failed authentication fails the run', category: 'Error handling', status: 'enforced', detail: '401 from source → ConnectorRun failed + sync.failed event + audit; ImportBatch rejected.' },
  { id: 'T17', name: 'Expired token fails the run', category: 'Error handling', status: 'enforced', detail: 'invalid_grant refresh → run failed (real Xero refresh needs XERO_CLIENT_ID/SECRET).' },
  { id: 'T18', name: 'Retry succeeds after a failure', category: 'Resilience', status: 'enforced', detail: 'Fixed connector config → subsequent sync imported 2, completed.' },
  { id: 'T19', name: 'Partial import recovers failed records', category: 'Resilience', status: 'enforced', detail: 'invalid record → ImportError (validate); rerun imports recovered record, dedupes the rest.' },
  { id: 'T20', name: 'Live Xero OAuth connection', category: 'Connector', status: 'not_implemented', detail: 'xeroAuth authorize/callback/refresh/disconnect implemented; runtime deferred pending builder XERO_CLIENT_ID/SECRET/REDIRECT_URI.' },
  { id: 'T21', name: 'Scheduled auto-sync cron fire', category: 'Scheduling', status: 'rule_in_place', detail: 'Connector Auto Sync workflow (hourly) registered; first fire pending. Manual path fully verified.' },
];

export const LIMITATIONS = [
  { title: 'No physical PostgreSQL schemas (zones)', detail: 'Base44 exposes no physical database schemas. The five logical zones are an explicit naming/metadata convention — logical separation, not a physical boundary.' },
  { title: 'No database-level immutability enforcement', detail: 'Immutability is enforced via RLS (update/delete = false) at the application access layer. The service role retains write capability for ingestion/engine.' },
  { title: 'No database triggers for audit-on-write', detail: 'Automatic audit logging requires DB triggers or ORM middleware, neither available. AuditLog + hash-chain fields exist; population requires backend-function wrappers. Deferred.' },
  { title: 'No enforced foreign-key or unique constraints', detail: 'Base44 entities are schemaless JSON documents. Referential integrity and uniqueness must be validated in application code.' },
  { title: 'Money stored as JSON number, not NUMERIC(15,4)', detail: 'Application layer must use integer cents or careful decimal handling to avoid floating-point drift. Currency is an explicit field on monetary entities.' },
  { title: 'Fine-grained roles limited to admin/user at RLS layer', detail: 'RLS user_condition checks only the built-in role. Granular roles live on UserProfile.system_role; RLS cannot evaluate them directly. Full role enforcement beyond admin/user requires application-layer checks.' },
  { title: 'Built-in User entity cannot receive custom RLS', detail: 'Platform governs User with its own permissions. Custom fields (organisation_id, site_ids, system_role) are accessible via {{user.data.*}}, but User has no entity-level RLS.' },
  { title: 'User records are invite-only (cannot be seeded)', detail: 'User records cannot be created via the API. Cross-user RLS runtime tests therefore require provisioned users and cannot run via the service-role sandbox.' },
];

export const NOT_IMPLEMENTED = [
  'Deterministic financial & tax engine (item 5)',
  'Owner Score calculation (item 6)',
  'Executive dashboard & Daily Owner Brief (item 7)',
  'Financial Timeline (item 8)',
  'Weekly report (item 9)',
  'Numeric validator & permission-filtered AI context (item 10)',
  'AI fixed-format summary (item 11)',
  'AI Financial Chat (item 12 — §4.1 eight-gate release condition)',
];

// Addendum 001 — Version 1 build order (§7.1). Items 1-4 complete; item 5 next.
export const BUILD_ORDER = [
  { id: 1, component: 'Schema, RLS, audit log', state: 'complete', dependsOn: '—' },
  { id: 2, component: 'Authentication, roles, MFA', state: 'complete', dependsOn: '1' },
  { id: 3, component: 'Xero connector & immutable raw ingestion', state: 'complete', dependsOn: '1' },
  { id: 4, component: 'Canonical model & reconciliation', state: 'complete', dependsOn: '3' },
  { id: 5, component: 'Deterministic financial & tax engine', state: 'next', dependsOn: '4' },
  { id: 6, component: 'Owner Score calculation', state: 'pending', dependsOn: '5' },
  { id: 7, component: 'Executive dashboard & Daily Owner Brief', state: 'pending', dependsOn: '6' },
  { id: 8, component: 'Financial Timeline', state: 'pending', dependsOn: '5' },
  { id: 9, component: 'Weekly report', state: 'pending', dependsOn: '5' },
  { id: 10, component: 'Numeric validator & permission-filtered AI context', state: 'pending', dependsOn: '5, 2' },
  { id: 11, component: 'AI fixed-format summary', state: 'pending', dependsOn: '10' },
  { id: 12, component: 'AI Financial Chat', state: 'gated', dependsOn: '11 + §4.1 eight-gate release' },
];