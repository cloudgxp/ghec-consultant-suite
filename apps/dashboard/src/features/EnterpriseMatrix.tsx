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
  // ⚡ Bolt: Optimize metric aggregation by tracking values in a single pass O(N)
  // instead of redundant sequential array operations like `.filter().length` in render.
  const rawRows = useMemo(() => {
    return bundle.organizations.map((organization) => {
      let repositories = 0;
      let privateRepos = 0;
      let internalRepos = 0;
      let publicRepos = 0;
      let storage = 0;
      let lfs = false;
      let workflows = 0;
      let selfHosted = 0;
      let knownSecurityCount = 0;
      let enabledSecurityCount = 0;
      let linked = 0;
      let unlinked = 0;
      let highFindings = 0;
      let mediumFindings = 0;
      let blockers = 0;

      for (const entity of bundle.entities) {
        if (entity.organizationId !== organization.id) continue;

        if (entity.kind === 'repository') {
          repositories++;
          if (entity.visibility === 'private') privateRepos++;
          else if (entity.visibility === 'internal') internalRepos++;
          else if (entity.visibility === 'public') publicRepos++;

          if (entity.size.availability === 'observed') {
            storage += entity.size.value ?? 0;
          }
        } else if (entity.kind === 'actions') {
          if (entity.workflowCount.availability === 'observed') {
            workflows += entity.workflowCount.value ?? 0;
          }
          if (entity.runnerTypes.includes('self-hosted')) {
            selfHosted++;
          }
        } else if (entity.kind === 'security') {
          if (
            entity.codeScanning !== 'unknown' ||
            entity.dependabot !== 'unknown'
          ) {
            knownSecurityCount++;
            if (entity.codeScanning === 'enabled') enabledSecurityCount++;
            if (entity.dependabot === 'enabled') enabledSecurityCount++;
          }
        } else if (entity.kind === 'identity') {
          if (entity.ssoStatus === 'linked') linked++;
          else if (entity.ssoStatus === 'unlinked') unlinked++;
        } else if (entity.kind === 'lfs' && entity.indicator === 'detected') {
          lfs = true;
        }
      }

      for (const finding of insights.findings) {
        if (finding.organizationId !== organization.id) continue;
        if (finding.severity === 'high') {
          highFindings++;
          blockers++;
        } else if (finding.severity === 'medium') {
          mediumFindings++;
          blockers++;
        }
      }

      const denominator = knownSecurityCount * 2;
      return {
        id: organization.id,
        name: resolveOrgName(bundle, organization.id),
        login: organization.login,
        repositories,
        private: privateRepos,
        internal: internalRepos,
        public: publicRepos,
        storage,
        lfs,
        high: highFindings,
        medium: mediumFindings,
        blockers,
        workflows,
        selfHosted,
        security: denominator ? (enabledSecurityCount / denominator) * 100 : -1,
        linked,
        unlinked,
      };
    });
  }, [bundle, insights]);

  // ⚡ Bolt: Decouple sorting into its own memoized block to prevent recalculating aggregations
  const rows = useMemo(
    () =>
      [...rawRows].sort((a, b) => {
        const av = sortKey === 'name' ? a.name : a[sortKey];
        const bv = sortKey === 'name' ? b.name : b[sortKey];
        const result =
          typeof av === 'string' && typeof bv === 'string'
            ? av.localeCompare(bv)
            : Number(av) - Number(bv);
        return descending ? -result : result;
      }),
    [rawRows, sortKey, descending],
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
