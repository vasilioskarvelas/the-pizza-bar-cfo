// Phase 02 permission registry + role->permission map. The authoritative grant
// source at runtime is the RolePermission entity (loaded by accessService);
// this map is the seeded default and a deny-by-default fallback only.

export const PERMISSIONS = [
  'organisation.manage',
  'users.invite',
  'users.manage_roles',
  'sites.manage',
  'financials.read',
  'financials.manage',
  'connectors.manage',
  'commitments.read',
  'commitments.manage',
  'calculations.run',
  'reconciliation.manage',
  'reports.read',
  'audit.read',
  'feature_flags.manage',
];

export const PERMISSION_LABELS = {
  'organisation.manage': 'Manage organisation',
  'users.invite': 'Invite users',
  'users.manage_roles': 'Manage roles & site access',
  'sites.manage': 'Manage sites',
  'financials.read': 'Read financials',
  'financials.manage': 'Manage financial config',
  'connectors.manage': 'Manage connectors',
  'commitments.read': 'Read commitments',
  'commitments.manage': 'Manage commitments',
  'calculations.run': 'Run calculations',
  'reconciliation.manage': 'Run reconciliation',
  'reports.read': 'Read reports',
  'audit.read': 'Read audit log',
  'feature_flags.manage': 'Manage feature flags',
};

// Seeded default grants (mirrors the RolePermission records). Deny-by-default:
// a permission not listed for a role is not granted.
export const ROLE_PERMISSIONS = {
  owner: PERMISSIONS,
  finance_manager: ['financials.read', 'financials.manage', 'commitments.read', 'commitments.manage', 'reconciliation.manage', 'reports.read', 'connectors.manage', 'calculations.run'],
  site_manager: ['financials.read', 'commitments.read', 'reports.read'],
  shift_supervisor: ['financials.read'],
  accountant: ['financials.read', 'financials.manage', 'reconciliation.manage', 'reports.read', 'commitments.read', 'audit.read', 'calculations.run'],
  auditor: ['financials.read', 'commitments.read', 'reports.read', 'audit.read'],
  system: PERMISSIONS,
};

export const ROLE_LABELS = {
  owner: 'Owner',
  finance_manager: 'Finance Manager',
  site_manager: 'Site Manager',
  shift_supervisor: 'Shift Supervisor',
  accountant: 'Accountant',
  auditor: 'Auditor',
  system: 'System',
};

// Roles that the MFA enforcement hook targets (§7).
export const PRIVILEGED_ROLES = ['owner', 'finance_manager', 'accountant', 'auditor'];