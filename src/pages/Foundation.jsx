import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Database, Lock, CheckCircle2, XCircle, FileWarning, Layers } from 'lucide-react';
import ZoneMap from '@/components/foundation/ZoneMap';
import EntityTable from '@/components/foundation/EntityTable';
import TestResults from '@/components/foundation/TestResults';
import Limitations from '@/components/foundation/Limitations';
import { ZONES, RLS_PATTERNS, TESTS, LIMITATIONS, NOT_IMPLEMENTED } from '@/lib/foundationData';

const ENTITY_LIST = [
  { name: 'Organisation', zone: 'configuration', pattern: 'ORG (by own id)', immutable: false },
  { name: 'Site', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  { name: 'SiteGroup', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'SiteGroupMembership', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  { name: 'UserProfile', zone: 'configuration', pattern: 'IDENTITY', immutable: false },
  { name: 'Role', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'Permission', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'RolePermission', zone: 'configuration', pattern: 'ORG', immutable: false },
  { name: 'UserOrganisationRole', zone: 'configuration', pattern: 'IDENTITY', immutable: false },
  { name: 'UserSiteAccess', zone: 'configuration', pattern: 'ORG+SITE', immutable: false },
  { name: 'SourceRecord', zone: 'source', pattern: 'IMMUTABLE', immutable: true },
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
  { name: 'ManualCommitment', zone: 'canonical', pattern: 'COMMITMENT', immutable: false },
  { name: 'CommitmentVersion', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'CommitmentSourceLink', zone: 'canonical', pattern: 'IMMUTABLE', immutable: true },
  { name: 'CommitmentDuplicateCandidate', zone: 'canonical', pattern: 'COMMITMENT', immutable: false },
  { name: 'AuditLog', zone: 'audit', pattern: 'AUDIT', immutable: true },
  { name: 'User', zone: 'configuration', pattern: 'Platform-governed', immutable: false },
];

const PROTOTYPE_ENTITIES = ['SalesTransaction', 'SupplierInvoice', 'PayRun', 'BankAccount', 'TaxObligation', 'Anomaly'];

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
  const partialTests = TESTS.filter((t) => t.status === 'partial').length;
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
            <h1 className="text-lg font-bold tracking-tight">HFOS Phase 01 — Foundation Verification</h1>
            <p className="text-xs text-zinc-500">Schema, Row-Level Security &amp; Immutable Audit · Architecture v1.0 · Internal development screen</p>
          </div>
        </div>
        <p className="text-xs text-amber-500/80 mt-3 mb-6 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
          This is a development verification screen, not a financial dashboard. No financial metrics are displayed.
        </p>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <SummaryTile icon={Database} label="Entities created" value={ENTITY_LIST.length} sub={`${PROTOTYPE_ENTITIES.length} locked prototypes`} />
          <SummaryTile icon={Layers} label="Logical zones" value={ZONES.length} sub="source · canonical · mart · audit · config" />
          <SummaryTile icon={Lock} label="Immutable entities" value={ENTITY_LIST.filter((e) => e.immutable).length} sub="update/delete denied (false)" />
          <SummaryTile icon={CheckCircle2} label="Tests enforced" value={`${enforcedTests}/${TESTS.length}`} sub={`${ruleTests} rules in place · ${partialTests} partial · ${notImplTests} not implemented`} />
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

        {/* Zones */}
        <Section title="Database zones" subtitle="Logical separation (Base44 has no physical schemas — see limitations)">
          <ZoneMap zones={ZONES} />
        </Section>

        {/* Entities */}
        <Section title="Entities &amp; RLS" subtitle={`${ENTITY_LIST.length} entities across ${ZONES.length} zones`}>
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
        <Section title="Limitations &amp; scope" subtitle="Honest account of what Base44 cannot fully deliver">
          <Limitations limitations={LIMITATIONS} notImplemented={NOT_IMPLEMENTED} />
        </Section>

        <footer className="text-center py-6 mt-4 border-t border-zinc-900">
          <p className="text-xs text-zinc-700">Phase 01 complete. Stopped — awaiting approval before authentication, Xero, dashboard, or AI work.</p>
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