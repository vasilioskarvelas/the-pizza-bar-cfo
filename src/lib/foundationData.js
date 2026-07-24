// Phase 01 foundation metadata — describes the schema, zones, RLS patterns,
// tests and platform limitations. This is descriptive configuration, not
// financial data.

export const ZONES = [
  {
    name: 'source',
    description: 'Immutable, append-only raw ingestion records. Raw payload retained verbatim. Corrections are superseding records, never edits.',
    entities: ['SourceRecord'],
  },
  {
    name: 'canonical',
    description: 'The reconciled system truth — built from source data plus user-entered records. This zone grows as later phases populate it.',
    entities: ['ManualCommitment', 'CommitmentVersion', 'CommitmentSourceLink', 'CommitmentDuplicateCandidate'],
  },
  {
    name: 'mart',
    description: 'Denormalised precomputed aggregates for dashboard performance. Fully rebuildable — nothing here is authoritative. Not yet populated.',
    entities: [],
  },
  {
    name: 'audit',
    description: 'Immutable, append-only audit log. Write-only to application users; read restricted to admins. Hash-chain fields present.',
    entities: ['AuditLog'],
  },
  {
    name: 'configuration',
    description: 'Structural and reference data — tenant structure, chart of accounts, tax rates, KPI definitions, methodology, and governance rules.',
    entities: [
      'Organisation', 'Site', 'SiteGroup', 'SiteGroupMembership',
      'UserProfile', 'Role', 'Permission', 'RolePermission',
      'UserOrganisationRole', 'UserSiteAccess',
      'Account', 'AccountMapping', 'CostCentre', 'TaxRate',
      'KPIDefinition', 'KPIThresholdVersion',
      'ScoreMethodologyVersion', 'ScoreMethodologyComponent', 'ScoreMethodologyInput',
      'ApproximationRegister', 'SourceAuthorityRule', 'MaterialityRule', 'DataFreshnessRule',
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
    description: 'Read/create/update scoped to organisation AND (admin OR site_id in user.site_ids). Admin-only delete.',
    entities: ['Site', 'SiteGroupMembership', 'CostCentre', 'UserSiteAccess'],
  },
  {
    name: 'IMMUTABLE',
    description: 'Read scoped to org/site; admin-only create; update and update denied to ALL app users (false). Only the service role (ingestion) writes.',
    entities: ['SourceRecord', 'CommitmentVersion', 'CommitmentSourceLink'],
  },
  {
    name: 'COMMITMENT',
    description: 'Read scoped to org AND (admin OR shared scope OR site_id in user.site_ids). Admin-only delete. Supports soft-delete via deleted_at.',
    entities: ['ManualCommitment', 'CommitmentDuplicateCandidate'],
  },
  {
    name: 'AUDIT',
    description: 'Admin-only read within organisation. create/update/delete denied to ALL app users (false). Only the service role writes audit records.',
    entities: ['AuditLog'],
  },
  {
    name: 'IDENTITY',
    description: 'User can read their own profile/org-role records; admins manage all. Built-in User entity governed by platform permissions (no custom RLS applied).',
    entities: ['UserProfile', 'UserOrganisationRole'],
  },
  {
    name: 'LOCKED (prototype)',
    description: 'Admin read-only, all writes denied. Unapproved prototype schemas retained for reference but disabled and inaccessible to regular users.',
    entities: ['SalesTransaction', 'SupplierInvoice', 'PayRun', 'BankAccount', 'TaxObligation', 'Anomaly'],
  },
];

export const TESTS = [
  { id: 'T1', name: 'Strathmore-only user cannot access Diggers Rest data', category: 'Tenant isolation', status: 'rule_in_place', detail: 'ORG+SITE RLS filters site_id against user.data.site_ids. Runtime verification requires provisioned users (auth phase).' },
  { id: 'T2', name: 'Diggers Rest-only user cannot access Strathmore data', category: 'Tenant isolation', status: 'rule_in_place', detail: 'Same ORG+SITE pattern; site_id not in user.site_ids yields no records.' },
  { id: 'T3', name: 'User from another organisation cannot access The Pizza Bar', category: 'Tenant isolation', status: 'rule_in_place', detail: 'Every entity filters data.organisation_id == user.data.organisation_id. Cross-org user sees nothing.' },
  { id: 'T4', name: 'Site manager cannot access audit data', category: 'Role restriction', status: 'rule_in_place', detail: 'AuditLog read requires user_condition role=admin. Non-admin site users are denied.' },
  { id: 'T5', name: 'Normal user cannot update source records', category: 'Immutability', status: 'enforced', detail: 'SourceRecord update = false (deny-all). Service role bypasses RLS for ingestion.' },
  { id: 'T6', name: 'Normal user cannot delete source records', category: 'Immutability', status: 'enforced', detail: 'SourceRecord delete = false (deny-all).' },
  { id: 'T7', name: 'Normal user cannot update audit records', category: 'Immutability', status: 'enforced', detail: 'AuditLog update = false (deny-all).' },
  { id: 'T8', name: 'Normal user cannot delete audit records', category: 'Immutability', status: 'enforced', detail: 'AuditLog delete = false (deny-all).' },
  { id: 'T9', name: 'Soft-deleted mutable records remain auditable', category: 'Audit', status: 'partial', detail: 'ManualCommitment supports deleted_at/deleted_by/deletion_reason. Automatic audit-on-delete requires a logging mechanism — see platform limitations.' },
  { id: 'T10', name: 'Every tested write creates an audit record', category: 'Audit', status: 'not_implemented', detail: 'Base44 has no database triggers. Audit-on-write requires backend-function wrappers or middleware — documented limitation.' },
];

export const LIMITATIONS = [
  {
    title: 'No physical PostgreSQL schemas (zones)',
    detail: 'Base44 does not expose physical database schemas. The five logical zones (source, canonical, mart, audit, configuration) are implemented as an explicit naming and metadata convention — each entity carries a zone designation and is grouped accordingly. The separation is logical, not a physical schema boundary.',
  },
  {
    title: 'No database-level immutability enforcement',
    detail: 'PostgreSQL REVOKE UPDATE, DELETE is not available. Immutability is enforced via RLS (update/delete = false) at the application access layer. The service role (backend functions) retains write capability for ingestion. This is application-layer immutability, not database-layer.',
  },
  {
    title: 'No database triggers for audit-on-write',
    detail: 'Automatic audit logging on every create/update/delete requires database triggers or ORM middleware, neither of which Base44 provides. The AuditLog entity and hash-chain fields exist, but populating it on every write requires backend-function wrappers around entity operations. This is a deferred implementation item.',
  },
  {
    title: 'Hash chaining is application-level, not tamper-evident at DB layer',
    detail: 'previous_hash, record_hash and chain_position fields are present on AuditLog. Computing them requires application code (backend function), not a DB-level computed column. Without DB-level enforcement, a determined attacker with service-role access could rewrite the chain. This is weaker than the architecture specifies and must not be claimed as tamper-evident.',
  },
  {
    title: 'No enforced foreign-key constraints',
    detail: 'Base44 entities are schemaless JSON documents. Referential integrity (e.g. site_id must exist in Site) is not enforced at the database layer. It must be validated in application code. Orphan records are possible if application logic is defective.',
  },
  {
    title: 'Money stored as JSON number, not NUMERIC(15,4)',
    detail: 'Base44 number fields are not PostgreSQL NUMERIC. The application layer must use integer cents or careful decimal handling to avoid floating-point drift. Currency is an explicit field on monetary entities.',
  },
  {
    title: 'Fine-grained roles limited to admin/user at RLS layer',
    detail: 'RLS user_condition checks only the built-in role (admin/user). Granular roles (owner, finance_manager, site_manager, auditor) are stored on UserProfile.system_role and User.data.system_role, but RLS cannot evaluate them directly. Site-level scoping uses user.data.site_ids (array). Full role enforcement beyond admin/user requires application-layer checks.',
  },
  {
    title: 'Built-in User entity cannot receive custom RLS',
    detail: 'The platform governs User with its own permissions. Custom fields (organisation_id, site_ids, system_role) were added to the schema and are accessible via {{user.data.*}}, but the User entity itself has no entity-level RLS.',
  },
  {
    title: 'User records are invite-only (cannot be seeded)',
    detail: 'User records cannot be created via the API (invite-only). Cross-user RLS runtime tests therefore require provisioned users and cannot be executed in this phase via the service-role sandbox.',
  },
];

export const NOT_IMPLEMENTED = [
  'Dashboard', 'Owner Score calculation', 'Daily Brief', 'Financial Timeline interface',
  'Xero integration', 'POS integration', 'Financial calculations', 'Reports',
  'AI summaries', 'AI Chat', 'Forecasting', 'Anomaly detection', 'Sample financial data',
];