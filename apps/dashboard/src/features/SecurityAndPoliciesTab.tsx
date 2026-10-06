import React, { useEffect, useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import { formatCountMetric, resolveOrgName } from '../lib/formatters.js';
import {
  generateSecurityPostureCsv,
  generateIntegrationsCsv,
  downloadCsv,
} from '../lib/export-csv.js';
import { PageHeader } from '../components/ui/index.js';
import { Button, Flash, Label, UnderlineNav } from '@primer/react';
import { DownloadIcon, KeyIcon, ShieldCheckIcon } from '@primer/octicons-react';
import { ModuleTriggerModal } from '../components/ModuleTriggerModal.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Security = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'security' }
>;
type Policy = Extract<DiscoveryBundle['entities'][number], { kind: 'policy' }>;
type Integration = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'integration' }
>;

export const SecurityAndPoliciesTab: React.FC<Props> = ({
  bundle,
  selectedOrgIds,
}) => {
  const [section, setSection] = useState<
    'security' | 'policies' | 'integrations'
  >('security');
  const [activeTrigger, setActiveTrigger] = useState<{
    title: string;
    description: string;
    modules: string[];
    affectedCount?: number;
    entityLabel?: string;
    prerequisites?: string[];
    customOptions?: React.ReactNode;
  } | null>(null);
  const [dispatchedRun, setDispatchedRun] = useState<{
    workflowId: string;
    modules: string[];
    isDryRun: boolean;
  } | null>(null);
  useEffect(() => {
    const focus = (event: Event) => {
      const subview = (event as CustomEvent<{ subview?: string }>).detail
        .subview;
      if (
        subview === 'security' ||
        subview === 'policies' ||
        subview === 'integrations'
      )
        setSection(subview);
    };
    window.addEventListener('ghec:focus-entity', focus);
    return () => window.removeEventListener('ghec:focus-entity', focus);
  }, []);
  const security = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Security =>
          entity.kind === 'security' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const policies = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Policy =>
          entity.kind === 'policy' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const integrations = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Integration =>
          entity.kind === 'integration' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const renderStatusLabel = (value: 'enabled' | 'disabled' | 'unknown') => (
    <Label
      size="small"
      variant={
        value === 'enabled'
          ? 'success'
          : value === 'disabled'
            ? 'danger'
            : 'secondary'
      }
      className="capitalize font-semibold"
    >
      {value}
    </Label>
  );
  const securityColumns = useMemo<readonly VirtualizedColumn<Security>[]>(
    () => [
      {
        header: 'Repository',
        width: '1.3fr',
        className: 'font-mono text-xs font-bold',
        cell: (item) => item.repositoryId,
      },
      {
        header: 'Organization',
        cell: (item) => (
          <span className="text-xs">
            {resolveOrgName(bundle, item.organizationId)}
          </span>
        ),
      },
      {
        header: 'Code Scanning',
        cell: (item) => renderStatusLabel(item.codeScanning),
      },
      {
        header: 'Dependabot',
        cell: (item) => renderStatusLabel(item.dependabot),
      },
      {
        header: 'Open Alerts',
        width: '0.8fr',
        className: 'text-xs font-mono',
        cell: (item) => formatCountMetric(item.openAlertCount),
      },
      {
        header: 'Alert Availability Note',
        width: '1.5fr',
        className: 'text-xs',
        cell: (item) => item.openAlertCount.reason ?? '—',
      },
    ],
    [bundle],
  );
  const policyColumns = useMemo<readonly VirtualizedColumn<Policy>[]>(
    () => [
      {
        header: 'Policy Name',
        width: '1.3fr',
        className: 'font-bold text-xs',
        cell: (item) => item.name,
      },
      {
        header: 'Policy Kind',
        cell: (item) => (
          <Label size="small" variant="secondary" className="font-mono">
            {item.policyKind}
          </Label>
        ),
      },
      {
        header: 'Enforcement',
        cell: (item) => (
          <Label
            size="small"
            variant={
              item.enforcement === 'active'
                ? 'success'
                : item.enforcement === 'evaluate'
                  ? 'attention'
                  : 'secondary'
            }
          >
            {item.enforcement}
          </Label>
        ),
      },
      {
        header: 'Target Scope / Repository',
        width: '1.5fr',
        className: 'font-mono text-xs',
        cell: (item) => item.repositoryId ?? 'Organization-wide',
      },
      {
        header: 'Organization',
        cell: (item) => (
          <span className="text-xs">
            {resolveOrgName(bundle, item.organizationId)}
          </span>
        ),
      },
    ],
    [bundle],
  );
  const integrationColumns = useMemo<readonly VirtualizedColumn<Integration>[]>(
    () => [
      {
        header: 'Label / Identifier',
        width: '1.3fr',
        className: 'font-bold text-xs font-mono',
        cell: (item) => item.label,
      },
      {
        header: 'Integration Kind',
        cell: (item) => (
          <Label size="small" variant="secondary" className="capitalize">
            {item.integrationKind.replace('_', ' ')}
          </Label>
        ),
      },
      {
        header: 'Status',
        cell: (item) => (
          <Label
            size="small"
            variant={item.active === true ? 'success' : 'secondary'}
          >
            {item.active === null
              ? 'Unknown'
              : item.active
                ? 'Active'
                : 'Inactive'}
          </Label>
        ),
      },
      {
        header: 'Target Scope',
        width: '1.5fr',
        className: 'font-mono text-xs',
        cell: (item) => item.repositoryId ?? 'Organization-wide',
      },
      {
        header: 'Organization',
        cell: (item) => (
          <span className="text-xs">
            {resolveOrgName(bundle, item.organizationId)}
          </span>
        ),
      },
    ],
    [bundle],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security, Governance & Integrations"
        description="Review security tool enablement, branch rulesets, and external integration points."
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `security-posture-${bundle.scan.id}.csv`,
                generateSecurityPostureCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Security (CSV)
          </Button>
        }
        secondaryActions={
          <Button
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `integrations-${bundle.scan.id}.csv`,
                generateIntegrationsCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Integrations (CSV)
          </Button>
        }
      />

      {/* 1-Click Module Migration Triggers */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] rounded-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--fgColor-default)] uppercase tracking-wide mr-1">
            Module Actions:
          </span>
          <Button
            size="small"
            leadingVisual={ShieldCheckIcon}
            onClick={() =>
              setActiveTrigger({
                title: 'Sync Rulesets & Branch Protections',
                description:
                  'Reconcile repository rulesets, bypass actors, enforcement statuses, and classic branch protection rules.',
                modules: ['rulesets', 'branch-protection'],
                affectedCount: security.length + policies.length,
                entityLabel: 'rulesets & protections',
                prerequisites: [
                  'Target repositories created',
                  'Default and protected branch refs initialized',
                ],
              })
            }
          >
            Sync Rulesets & Protections
          </Button>
          <Button
            size="small"
            leadingVisual={KeyIcon}
            onClick={() =>
              setActiveTrigger({
                title: 'Reconcile Deploy Keys',
                description:
                  'Rehydrate repository deploy keys with SHA-256 fingerprint deduplication to avoid duplicate key conflicts.',
                modules: ['deploy-keys'],
                affectedCount: integrations.length,
                entityLabel: 'integrations & deploy keys',
                prerequisites: [
                  'Target repositories initialized',
                  'Deploy key administration scope available',
                ],
                customOptions: (
                  <p className="text-xs text-[var(--fgColor-muted)]">
                    Deploy keys will be deduplicated against existing target
                    keys using SHA-256 cryptographic fingerprints to prevent
                    key-in-use errors.
                  </p>
                ),
              })
            }
          >
            Reconcile Deploy Keys
          </Button>
        </div>
      </div>

      {dispatchedRun && (
        <Flash variant="success">
          <div className="flex items-center justify-between text-xs">
            <span>
              Dispatched <strong>{dispatchedRun.modules.join(', ')}</strong> (
              {dispatchedRun.isDryRun ? 'Dry-Run Simulation' : 'Live Apply'}) to
              workflow <code>{dispatchedRun.workflowId}</code>.
            </span>
            <Button size="small" onClick={() => setDispatchedRun(null)}>
              Dismiss
            </Button>
          </div>
        </Flash>
      )}

      <UnderlineNav aria-label="Security, governance and integrations views">
        <UnderlineNav.Item
          as="button"
          aria-current={section === 'security' ? 'page' : 'false'}
          className="cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            setSection('security');
          }}
        >
          Security Posture ({security.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={section === 'policies' ? 'page' : 'false'}
          className="cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            setSection('policies');
          }}
        >
          Policies & Rulesets ({policies.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={section === 'integrations' ? 'page' : 'false'}
          className="cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            setSection('integrations');
          }}
        >
          Integrations & Keys ({integrations.length})
        </UnderlineNav.Item>
      </UnderlineNav>
      {section === 'security' && (
        <VirtualizedTable
          ariaLabel="Security posture table"
          rows={security}
          columns={securityColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No security posture records found."
          minWidth={900}
        />
      )}
      {section === 'policies' && (
        <VirtualizedTable
          ariaLabel="Policies and rulesets table"
          rows={policies}
          columns={policyColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No policy records found."
          minWidth={850}
        />
      )}
      {section === 'integrations' && (
        <VirtualizedTable
          ariaLabel="Integrations table"
          rows={integrations}
          columns={integrationColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No integration records found."
          minWidth={850}
        />
      )}
      {activeTrigger && (
        <ModuleTriggerModal
          isOpen={true}
          onClose={() => setActiveTrigger(null)}
          title={activeTrigger.title}
          description={activeTrigger.description}
          modules={activeTrigger.modules}
          sourceOrg={
            selectedOrgIds[0]
              ? resolveOrgName(bundle, selectedOrgIds[0])
              : bundle.organizations[0]?.login || 'source-org'
          }
          affectedCount={activeTrigger.affectedCount}
          entityLabel={activeTrigger.entityLabel}
          prerequisites={activeTrigger.prerequisites}
          customOptions={activeTrigger.customOptions}
          onDispatched={(res) => {
            setDispatchedRun(res);
            setActiveTrigger(null);
          }}
        />
      )}
    </div>
  );
};
