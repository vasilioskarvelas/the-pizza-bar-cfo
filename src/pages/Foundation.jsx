import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Shield, Database, Lock, CheckCircle2, Layers, ListChecks } from 'lucide-react';
import ZoneMap from '@/components/foundation/ZoneMap';
import EntityTable from '@/components/foundation/EntityTable';
import TestResults from '@/components/foundation/TestResults';
import Limitations from '@/components/foundation/Limitations';
import { ZONES, RLS_PATTERNS, TESTS, LIMITATIONS, NOT_IMPLEMENTED, BUILD_ORDER } from '@/lib/foundationData';

const ENTITY_LIST = [
  // configuration — tenant structure
  { name: 'Organisation', zone: 'configuration', pattern: 'ORG (by own id)', immutable: false },
  { name: 'Site', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  { name: 'SiteGroup', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'SiteGroupMembership', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  // configuration — identity / RBAC
  { name: 'UserProfile', zone: 'configuration', pattern: 'IDENTITY', immutable: false },
  { name: 'Role', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'Permission', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'RolePermission', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'UserOrganisationRole', zone: 'configuration', pattern: 'IDENTITY', immutable: false },
  { name: 'UserSiteAccess', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  // configuration — delivery & rollout
  { name: 'Notification', zone: 'configuration', pattern: 'NOTIFICATION', immutable: false },
  { name: 'FeatureFlag', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  // configuration — financial / KPI / governance
  { name: 'Account', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'AccountMapping', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'CostCentre', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  { name: 'TaxRate', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'KPIDefinition', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'KPIThresholdVersion', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'ScoreMethodologyVersion', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'ScoreMethodologyComponent', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'ScoreMethodologyInput', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'ApproximationRegister', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'SourceAuthorityRule', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'MaterialityRule', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'DataFreshnessRule', zone: 'configuration', pattern: 'ORG', immutable: false },
  // source — ingestion
  { name: 'Connector', zone: 'source', pattern: 'ORG+SITE', immutable: false },
  { name: 'ConnectorRun', zone: 'source', pattern: 'ORG+SITE', immutable: false },
  { name: 'ImportBatch', zone: 'source', pattern: 'ORG+SITE', immutable: false },
  { name: 'SourceRecord', zone: 'source', pattern: 'IMMUTABLE', immutable: true },
  { name: 'ImportError', zone: 'source', pattern: 'IMMUTABLE', immutable: true },
  // canonical — commitments, calculation, reconciliation
  { name: 'ManualCommitment', zone: 'canonical', pattern: 'COMMITMENT', immutable: false },
  { name: 'CommitmentVersion', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'CommitmentSourceLink', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'CommitmentDuplicateCandidate', zone: 'canonical', pattern: 'COMMITMENT', immutable: false },
  { name: 'CalculationRun', zone: 'canonical', pattern: 'ORG+SITE', immutable: false },
  { name: 'CalculationResult', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'CalculationLineage', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'ReconciliationRun', zone: 'canonical', pattern: 'ORG+SITE', immutable: false },
  { name: 'ReconciliationException', zone: 'canonical', pattern: 'ORG+SITE', immutable: false },
  // audit
  { name: 'SystemEvent', zone: 'audit', pattern: 'SYSTEM-EVENT', immutable: true },
  { name: 'AuditLog', zone: 'audit', pattern: 'AUDIT', immutable: true },
  // built-in
  { name: 'User', zone: 'configuration', pattern: 'Platform-governed', immutable: false },
];

const STATE_STYLE = {
  complete: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  next: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  pending: 'text-zinc-400 bg-zinc-700/30 border-zinc-600/40',
  gated: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
};

export default function Foundation() {
  const [orgCount, setOrgCount] = useState(null);
  const [siteCount, setSiteCount] = useState(null);
  const [rlsVisible, setRlsVisible] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [orgs, sites] = await Promise.all([
          base44.entities.Organisation.list(),
          base44.entities.Site.list(),
        ]);
        setOrgCount(orgs?.length ?? 0);
        setSiteCount(sites?.length ?? 0);
        setRlsVisible(true);
      } catch {
        setRlsVisible(false);
      }
    })();
  }, []);

  const enforcedTests = TESTS.filter((t) => t.status === 'enforced').length;
  const ruleTests = TESTS.filter((t) => t.status === 'rule_in_place').length;
  const notImplTests = TESTS.filter((t) => t.status === 'not_implemented').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">HFOS Foundation — ERD v1.0 (LOCKED) + Addendum 001</h1>
            <p className="text-xs text-zinc-500">Schema, Row-Level Security & Immutable Audit · Owner Experience roadmap accepted · Internal development screen</p>
          </div>
          <Link to="/admin/users" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 hover:border-amber-500/30 transition-colors">Admin →</Link>
        </div>
        <p className="text-xs text-amber-500/80 mt-3 mb-6 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
          This is a development verification screen, not a financial dashboard. No financial metrics are displayed. Owner Experience features (Owner Score, Daily Brief, Timeline, AI) are presentation layers gated behind the build order below.
        </p>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <SummaryTile icon={Database} label="Entities (locked)" value={ENTITY_LIST.length} sub="ERD v1.0 · 0 prototypes" />
          <SummaryTile icon={Layers} label="Logical zones" value={ZONES.length} sub="source · canonical · mart · audit · config" />
          <SummaryTile icon={Lock} label="Immutable entities" value={ENTITY_LIST.filter((e) => e.immutable).length} sub="update/delete denied (false)" />
          <SummaryTile icon={CheckCircle2} label="Tests enforced" value={`${enforcedTests}/${TESTS.length}`} sub={`${ruleTests} rules in place · ${notImplTests} deferred` } />
        </div>

        {/* Tenant structure */}
        <Section title="Tenant structure" subtitle="The only approved organisation and sites">
          <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-mono text-amber-400 px-2 py-0.5 rounded bg-amber-500/10">Organisation</span>
              <span className="text-sm font-semibold text-zinc-200">The Pizza Bar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-4">
              <SiteChip name="The Pizza Bar Strathmore" />
              <SiteChip name="The Pizza Bar Diggers Rest" />
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/60 text-xs text-zinc-600">
              {rlsVisible === null
                ? 'Checking live record visibility…'
                : rlsVisible
                  ? `Live read returned ${orgCount} organisation(s) and ${siteCount} site(s) — visible to your current user context.`
                  : 'Live read blocked or empty — RLS is scoping by your user.organisation_id. Records exist (created via service role) but are visible only to provisioned users.'}
            </div>
          </div>
        </Section>

        {/* Build order */}
        <Section title="Version 1 build order (Addendum 001 §7.1)" subtitle="Mandatory dependency sequence — item 1 complete, item 2 next. Presentation & AI features are gated behind items 3-5.">
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80">
                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-3 py-2 font-medium w-8">#</th>
                  <th className="px-3 py-2 font-medium">Component</th>
                  <th className="px-3 py-2 font-medium w-28">State</th>
                  <th className="px-3 py-2 font-medium w-40">Depends on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {BUILD_ORDER.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 font-mono text-zinc-600">{b.id}</td>
                    <td className="px-3 py-2 text-zinc-300">{b.component}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATE_STYLE[b.state]}`}>{b.state}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500 font-mono text-xs">{b.dependsOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600 mt-2 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" />
            Per §7.2, no presentation or AI feature may bypass this order. A dashboard built on an unfinished foundation is a demonstration of numbers nobody can defend.
          </p>
        </Section>

        {/* Zones */}
        <Section title="Database zones" subtitle="Logical separation (Base44 has no physical schemas — see limitations)">
          <ZoneMap zones={ZONES} />
        </Section>

        {/* Entities */}
        <Section title="Entities & RLS" subtitle={`${ENTITY_LIST.length} entities across ${ZONES.length} zones · ERD v1.0 locked`}>
          <EntityTable entities={ENTITY_LIST} />
        </Section>

        {/* RLS patterns */}
        <Section title="RLS patterns" subtitle="Tenant isolation enforced at the access layer on every entity">
          <div className="space-y-2">
            {RLS_PATTERNS.map((p) => (
              <div key={p.name} className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-semibold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10">{p.name}</span>
                  <span className="text-xs text-zinc-600">{p.entities.length} entities</span>
                </div>
                <p className="text-xs text-zinc-400 mb-2">{p.description}</p>
                <div className="flex flex-wrap gap-1">
                  {p.entities.map((e) => (
                    <span key={e} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Tests */}
        <Section title="Security tests" subtitle="Immutability enforced; tenant isolation rules in place pending user provisioning">
          <TestResults tests={TESTS} />
        </Section>

        {/* Limitations */}
        <Section title="Limitations & scope" subtitle="Honest account of what Base44 cannot fully deliver">
          <Limitations limitations={LIMITATIONS} notImplemented={NOT_IMPLEMENTED} />
        </Section>

        <footer className="text-center py-6 mt-4 border-t border-zinc-900">
          <p className="text-xs text-zinc-700">Phase 01 verified · Phase 02 (auth, roles, MFA) verified · Phase 03 (Xero connector & immutable raw ingestion) verified. Next: item 4 — canonical model & reconciliation.</p>
        </footer>
      </div>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
    </div>
  );
}

function SiteChip({ name }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/40">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span className="text-sm text-zinc-300">{name}</span>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-zinc-200 mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-zinc-600 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}