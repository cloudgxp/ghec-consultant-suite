import type { DiscoveryBundle } from '@ghec/contracts';
import type { AnalysisOptions, EvaluatedInsights } from '@ghec/analysis';
import { sanitizeCsvField } from './export-csv.js';

export type FindingDeltaStatus = 'resolved' | 'persistent' | 'new';

export interface FindingDelta {
  status: FindingDeltaStatus;
  key: string;
  ruleId: string;
  dimension: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  title: string;
  description: string;
  organizationId: string;
  entityIds: string[];
}

export interface EntityInventoryDelta {
  kind: 'repository' | 'team' | 'integration';
  added: string[];
  removed: string[];
}

export interface ScanDiff {
  options: AnalysisOptions;
  baselineScanId: string;
  currentScanId: string;
  findings: FindingDelta[];
  resolved: number;
  persistent: number;
  new: number;
  baselineBlockers: number;
  currentBlockers: number;
  reductionPercent: number;
  metrics: {
    baselineStorageBytes: number;
    currentStorageBytes: number;
    storageDeltaBytes: number;
    criticalBlockerDelta: number;
    protectedRepositoryDelta: number;
  };
  entities: EntityInventoryDelta[];
}

export function scopesMatch(
  baseline: DiscoveryBundle,
  current: DiscoveryBundle,
): boolean {
  if (baseline.scope.kind !== current.scope.kind) return false;
  return baseline.scope.kind === 'enterprise' &&
    current.scope.kind === 'enterprise'
    ? baseline.scope.slug === current.scope.slug
    : baseline.scope.kind === 'organization' &&
        current.scope.kind === 'organization' &&
        baseline.scope.organizationId === current.scope.organizationId;
}

function findingKey(finding: EvaluatedInsights['findings'][number]): string {
  return `${finding.ruleId}|${[...finding.entityIds].sort().join('|')}`;
}

function storage(bundle: DiscoveryBundle): number {
  return bundle.entities.reduce(
    (total, entity) =>
      total +
      (entity.kind === 'repository' && entity.size.availability === 'observed'
        ? (entity.size.value ?? 0)
        : 0),
    0,
  );
}

function protectedRepositories(bundle: DiscoveryBundle): number {
  return new Set(
    bundle.entities
      .filter(
        (entity) =>
          entity.kind === 'policy' &&
          entity.repositoryId !== null &&
          entity.enforcement === 'active',
      )
      .map((entity) => (entity.kind === 'policy' ? entity.repositoryId : null)),
  ).size;
}

function inventory(
  bundle: DiscoveryBundle,
  kind: EntityInventoryDelta['kind'],
): Set<string> {
  return new Set(
    bundle.entities
      .filter((entity) => entity.kind === kind)
      .map((entity) => entity.id),
  );
}

export function diffScans(
  baselineBundle: DiscoveryBundle,
  baselineInsights: EvaluatedInsights,
  currentBundle: DiscoveryBundle,
  currentInsights: EvaluatedInsights,
): ScanDiff {
  if (!scopesMatch(baselineBundle, currentBundle)) {
    throw new Error(
      'Scan scopes do not match. Compare bundles from the same organization or enterprise.',
    );
  }
  const baseline = new Map(
    baselineInsights.findings.map((finding) => [findingKey(finding), finding]),
  );
  const current = new Map(
    currentInsights.findings.map((finding) => [findingKey(finding), finding]),
  );
  const dimensions = new Map(
    [...baselineInsights.dimensions, ...currentInsights.dimensions].map(
      (dimension) => [dimension.ruleId, dimension.name],
    ),
  );
  const findings: FindingDelta[] = [];
  for (const [key, finding] of baseline) {
    findings.push({
      status: current.has(key) ? 'persistent' : 'resolved',
      key,
      ruleId: finding.ruleId,
      dimension: dimensions.get(finding.ruleId) ?? 'Other',
      severity: finding.severity,
      title: finding.title,
      description: current.get(key)?.description ?? finding.description,
      organizationId: finding.organizationId,
      entityIds: finding.entityIds,
    });
  }
  for (const [key, finding] of current) {
    if (baseline.has(key)) continue;
    findings.push({
      status: 'new',
      key,
      ruleId: finding.ruleId,
      dimension: dimensions.get(finding.ruleId) ?? 'Other',
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      organizationId: finding.organizationId,
      entityIds: finding.entityIds,
    });
  }
  const resolved = findings.filter(
    (finding) => finding.status === 'resolved',
  ).length;
  const persistent = findings.filter(
    (finding) => finding.status === 'persistent',
  ).length;
  const newlyIntroduced = findings.filter(
    (finding) => finding.status === 'new',
  ).length;
  const isBlocker = (finding: EvaluatedInsights['findings'][number]) =>
    finding.severity === 'high' || finding.severity === 'medium';
  const baselineBlockers = baselineInsights.findings.filter(isBlocker).length;
  const currentBlockers = currentInsights.findings.filter(isBlocker).length;
  const entityDeltas = (['repository', 'team', 'integration'] as const).map(
    (kind): EntityInventoryDelta => {
      const before = inventory(baselineBundle, kind);
      const after = inventory(currentBundle, kind);
      return {
        kind,
        added: [...after].filter((id) => !before.has(id)),
        removed: [...before].filter((id) => !after.has(id)),
      };
    },
  );
  const beforeStorage = storage(baselineBundle);
  const afterStorage = storage(currentBundle);
  return {
    options: currentInsights.options,
    baselineScanId: baselineBundle.scan.id,
    currentScanId: currentBundle.scan.id,
    findings,
    resolved,
    persistent,
    new: newlyIntroduced,
    baselineBlockers,
    currentBlockers,
    reductionPercent:
      baselineBlockers === 0
        ? currentBlockers === 0
          ? 0
          : -100
        : ((baselineBlockers - currentBlockers) / baselineBlockers) * 100,
    metrics: {
      baselineStorageBytes: beforeStorage,
      currentStorageBytes: afterStorage,
      storageDeltaBytes: afterStorage - beforeStorage,
      criticalBlockerDelta:
        currentInsights.findings.filter(
          (finding) => finding.severity === 'high',
        ).length -
        baselineInsights.findings.filter(
          (finding) => finding.severity === 'high',
        ).length,
      protectedRepositoryDelta:
        protectedRepositories(currentBundle) -
        protectedRepositories(baselineBundle),
    },
    entities: entityDeltas,
  };
}

export function generateRemediationCsv(diff: ScanDiff): string {
  const rows = [
    ['Active Target Platform', diff.options.targetPlatform],
    ['Critical Repository Size (Bytes)', diff.options.repoSizeCriticalBytes],
    ['Warning Repository Size (Bytes)', diff.options.repoSizeWarningBytes],
    ['LFS Cutover Strictness', diff.options.lfsCutoverStrictness],
    ['Branch Protection Policy', diff.options.branchProtectionPolicy],
    ['Security Severity Cutoff', diff.options.securitySeverityCutoff],
    [],
    [
      'Status',
      'Dimension',
      'Rule ID',
      'Severity',
      'Organization',
      'Affected Entities',
      'Title',
      'Resolution Details',
    ],
    ...diff.findings.map((finding) => [
      finding.status,
      finding.dimension,
      finding.ruleId,
      finding.severity,
      finding.organizationId,
      finding.entityIds.join('; '),
      finding.title,
      finding.description,
    ]),
  ];
  return rows
    .map((row) => row.map((cell) => sanitizeCsvField(cell)).join(','))
    .join('\r\n');
}
