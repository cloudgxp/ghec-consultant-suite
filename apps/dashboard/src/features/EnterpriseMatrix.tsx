import React, { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import { formatBytes, resolveOrgName } from '../lib/formatters.js';
import { DataTableFrame, SeverityBadge } from '../components/ui/index.js';

interface Props {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
  onSelectOrganization: (organizationId: string) => void;
}

type SortKey = 'name' | 'repositories' | 'storage' | 'blockers' | 'security';

export const EnterpriseMatrix: React.FC<Props> = ({
  bundle,
  insights,
  selectedOrgIds,
  onSelectOrganization,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('blockers');
  const [descending, setDescending] = useState(true);
  const rows = useMemo(
    () =>
      bundle.organizations
        .map((organization) => {
          const entities = bundle.entities.filter(
            (entity) => entity.organizationId === organization.id,
          );
          const repositories = entities.filter(
            (entity) => entity.kind === 'repository',
          );
          const actions = entities.filter(
            (entity) => entity.kind === 'actions',
          );
          const security = entities.filter(
            (entity) => entity.kind === 'security',
          );
          const identities = entities.filter(
            (entity) => entity.kind === 'identity',
          );
          const findings = insights.findings.filter(
            (finding) => finding.organizationId === organization.id,
          );
          const knownSecurity = security.filter(
            (item) =>
              item.kind === 'security' &&
              (item.codeScanning !== 'unknown' ||
                item.dependabot !== 'unknown'),
          );
          const enabledSecurity = knownSecurity.reduce(
            (count, item) =>
              count +
              (item.kind === 'security' && item.codeScanning === 'enabled'
                ? 1
                : 0) +
              (item.kind === 'security' && item.dependabot === 'enabled'
                ? 1
                : 0),
            0,
          );
          const denominator = knownSecurity.length * 2;
          return {
            id: organization.id,
            name: resolveOrgName(bundle, organization.id),
            login: organization.login,
            repositories: repositories.length,
            private: repositories.filter(
              (item) =>
                item.kind === 'repository' && item.visibility === 'private',
            ).length,
            internal: repositories.filter(
              (item) =>
                item.kind === 'repository' && item.visibility === 'internal',
            ).length,
            public: repositories.filter(
              (item) =>
                item.kind === 'repository' && item.visibility === 'public',
            ).length,
            storage: repositories.reduce(
              (sum, item) =>
                sum +
                (item.kind === 'repository' &&
                item.size.availability === 'observed'
                  ? (item.size.value ?? 0)
                  : 0),
              0,
            ),
            lfs: entities.some(
              (item) => item.kind === 'lfs' && item.indicator === 'detected',
            ),
            high: findings.filter((item) => item.severity === 'high').length,
            medium: findings.filter((item) => item.severity === 'medium')
              .length,
            blockers: findings.filter(
              (item) => item.severity === 'high' || item.severity === 'medium',
            ).length,
            workflows: actions.reduce(
              (sum, item) =>
                sum +
                (item.kind === 'actions' &&
                item.workflowCount.availability === 'observed'
                  ? (item.workflowCount.value ?? 0)
                  : 0),
              0,
            ),
            selfHosted: actions.filter(
              (item) =>
                item.kind === 'actions' &&
                item.runnerTypes.includes('self-hosted'),
            ).length,
            security: denominator ? (enabledSecurity / denominator) * 100 : -1,
            linked: identities.filter(
              (item) => item.kind === 'identity' && item.ssoStatus === 'linked',
            ).length,
            unlinked: identities.filter(
              (item) =>
                item.kind === 'identity' && item.ssoStatus === 'unlinked',
            ).length,
          };
        })
        .sort((a, b) => {
          const av = sortKey === 'name' ? a.name : a[sortKey];
          const bv = sortKey === 'name' ? b.name : b[sortKey];
          const result =
            typeof av === 'string' && typeof bv === 'string'
              ? av.localeCompare(bv)
              : Number(av) - Number(bv);
          return descending ? -result : result;
        }),
    [bundle, insights, sortKey, descending],
  );
  const sort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };
  const heading = (label: string, key: SortKey) => (
    <button
      type="button"
      className="font-bold hover:text-primary"
      onClick={() => sort(key)}
    >
      {label}
      {sortKey === key ? (descending ? ' ↓' : ' ↑') : ''}
    </button>
  );
  return (
    <DataTableFrame
      caption="Enterprise organization comparison"
      className="p-6"
    >
      <div className="mb-4">
        <h3 id="enterprise-matrix-title" className="text-lg font-bold">
          Enterprise Organization Comparison
        </h3>
        <p className="text-xs text-[var(--fgColor-muted)]">
          Select a row to scope the entire dashboard to that organization.
        </p>
      </div>
      <table className="w-full text-left border-collapse text-sm min-w-[1150px]">
        <thead className="bg-[var(--bgColor-muted)] text-xs text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
          <tr>
            <th className="px-3 py-2.5">{heading('Organization', 'name')}</th>
            <th className="px-3 py-2.5">
              {heading('Repositories', 'repositories')}
            </th>
            <th className="px-3 py-2.5">
              {heading('Storage & LFS', 'storage')}
            </th>
            <th className="px-3 py-2.5">{heading('Blockers', 'blockers')}</th>
            <th className="px-3 py-2.5">Actions & Runners</th>
            <th className="px-3 py-2.5">
              {heading('Security Adoption', 'security')}
            </th>
            <th className="px-3 py-2.5">SSO Links</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--borderColor-muted)]">
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              aria-selected={selectedOrgIds.includes(row.id)}
              onClick={() => onSelectOrganization(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ')
                  onSelectOrganization(row.id);
              }}
              className={`cursor-pointer border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)] ${selectedOrgIds.includes(row.id) ? 'bg-[var(--bgColor-accent-muted)]' : ''}`}
            >
              <td className="px-3 py-2.5">
                <div className="font-bold">{row.name}</div>
                <div className="text-xs font-mono text-[var(--fgColor-muted)]">
                  {row.login}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <strong>{row.repositories}</strong>
                <div className="text-[11px]">
                  {row.private} private · {row.internal} internal · {row.public}{' '}
                  public
                </div>
              </td>
              <td className="px-3 py-2.5">
                <strong>{formatBytes(row.storage)}</strong>
                <div className="text-[11px]">
                  LFS: {row.lfs ? 'Detected' : 'Not observed'}
                </div>
              </td>
              <td className="px-3 py-2.5">
                {row.high > 0 && (
                  <>
                    <SeverityBadge severity="high" />{' '}
                    <span className="text-xs">× {row.high}</span>
                  </>
                )}{' '}
                {row.medium > 0 && (
                  <>
                    <SeverityBadge severity="medium" />{' '}
                    <span className="text-xs">× {row.medium}</span>
                  </>
                )}
              </td>
              <td className="px-3 py-2.5">
                <strong>{row.workflows}</strong> workflows
                <div className="text-[11px]">
                  {row.selfHosted} self-hosted exposure(s)
                </div>
              </td>
              <td className="px-3 py-2.5">
                {row.security < 0 ? 'Unknown' : `${row.security.toFixed(0)}%`}
              </td>
              <td className="px-3 py-2.5">
                {row.linked} linked · {row.unlinked} unlinked
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableFrame>
  );
};
