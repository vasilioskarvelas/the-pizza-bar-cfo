export const ENTERPRISE_ROLES = [
  { role_key: 'platform_owner', name: 'Platform Owner', scope: 'platform', level: 100, is_system: true },
  { role_key: 'enterprise_admin', name: 'Enterprise Admin', scope: 'platform', level: 90, is_system: true },
  { role_key: 'organisation_owner', name: 'Organisation Owner', scope: 'organisation', level: 80, is_system: true },
  { role_key: 'regional_manager', name: 'Regional Manager', scope: 'organisation', level: 70, is_system: false },
  { role_key: 'site_manager', name: 'Site Manager', scope: 'site', level: 60, is_system: true },
  { role_key: 'financial_controller', name: 'Financial Controller', scope: 'organisation', level: 55, is_system: false },
  { role_key: 'accountant', name: 'Accountant', scope: 'organisation', level: 50, is_system: true },
  { role_key: 'operations_manager', name: 'Operations Manager', scope: 'organisation', level: 50, is_system: false },
  { role_key: 'advisor', name: 'Advisor', scope: 'organisation', level: 40, is_system: false },
  { role_key: 'auditor', name: 'Auditor', scope: 'organisation', level: 30, is_system: true },
  { role_key: 'read_only', name: 'Read Only', scope: 'organisation', level: 10, is_system: true },
];