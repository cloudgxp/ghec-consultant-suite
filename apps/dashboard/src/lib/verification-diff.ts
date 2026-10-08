/**
 * Post-migration Verification Diff & Discrepancy Engine
 *
 * Provides pure TypeScript logic to parse, classify, and diff verification reports,
 * categorize discrepancy severity, generate side-by-side diff models, and construct
 * copyable CLI remediation commands for every module.
 */

import type {
  VerificationReport,
  VerificationDiscrepancy,
} from '@ghec/contracts';

export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ClassifiedDiscrepancy {
  id: string;
  moduleId: string;
  resourceName: string;
  severity: DiscrepancySeverity;
  message: string;
  expected: unknown;
  actual: unknown;
  expectedFormatted: string;
  actualFormatted: string;
  remediationCommand: string;
  remediationRationale: string;
  diffLines: Array<{ type: 'same' | 'added' | 'removed'; text: string }>;
}

export interface VerificationStats {
  verifiedModuleCount: number;
  unverifiedModuleCount: number;
  totalModules: number;
  discrepancyCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  compliancePercentage: number;
}

/**
 * Categorizes the operational severity of a post-migration verification discrepancy.
 */
export function categorizeDiscrepancySeverity(
  moduleId: string,
  discrepancy: VerificationDiscrepancy,
): DiscrepancySeverity {
  const msg = (discrepancy.message || '').toLowerCase();
  const res = (discrepancy.resourceName || '').toLowerCase();

  // Critical: Security bypasses, credential leakage, missing admin rights, branch protection absent
  if (
    moduleId === 'rulesets' ||
    moduleId === 'branch-protection' ||
    moduleId === 'org-secrets' ||
    moduleId === 'repo-secrets'
  ) {
    if (
      msg.includes('bypass') ||
      msg.includes('protection') ||
      msg.includes('missing') ||
      msg.includes('unencrypted')
    ) {
      return 'critical';
    }
    return 'high';
  }

  // High: Deploy key with unexpected write access, missing LFS binary blob, unreclaimed mannequins, direct collaborator missing
  if (moduleId === 'deploy-keys') {
    if (msg.includes('write') || msg.includes('read_only: false')) {
      return 'critical';
    }
    return 'high';
  }

  if (moduleId === 'lfs') {
    if (
      msg.includes('missing oid') ||
      msg.includes('corrupted') ||
      msg.includes('not found')
    ) {
      return 'high';
    }
    return 'medium';
  }

  if (moduleId === 'collaborators') {
    if (msg.includes('admin') || msg.includes('maintain')) {
      return 'high';
    }
    return 'medium';
  }

  if (moduleId === 'post-migration-mannequins') {
    if (msg.includes('unreclaimed') || msg.includes('unmapped')) {
      return 'high';
    }
    return 'medium';
  }

  if (moduleId === 'releases') {
    if (
      msg.includes('missing release') ||
      msg.includes('asset count mismatch')
    ) {
      return 'high';
    }
    return 'medium';
  }

  if (moduleId === 'teams') {
    if (
      msg.includes('parent') ||
      msg.includes('hierarchy') ||
      msg.includes('admin')
    ) {
      return 'high';
    }
    return 'medium';
  }

  // Low: Description mismatches, minor non-blocking variable drift, timestamp drift
  if (
    msg.includes('description') ||
    msg.includes('timestamp') ||
    msg.includes('order') ||
    res.includes('description')
  ) {
    return 'low';
  }

  return 'medium';
}

/**
 * Formats unknown values into formatted strings and calculates line diffs.
 */
export function formatValue(val: unknown): string {
  if (val === undefined) return '<undefined>';
  if (val === null) return '<null>';
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return val;
    }
  }
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2);
  }
  return String(val);
}

/**
 * Generates simple line diffs between expected and actual strings.
 */
export function computeLineDiff(
  expectedStr: string,
  actualStr: string,
): Array<{ type: 'same' | 'added' | 'removed'; text: string }> {
  const expLines = expectedStr.split('\n');
  const actLines = actualStr.split('\n');

  if (expLines.length === 1 && actLines.length === 1) {
    const e = expLines[0] ?? '';
    const a = actLines[0] ?? '';
    if (e === a) {
      return [{ type: 'same', text: e }];
    }
    return [
      { type: 'removed', text: e },
      { type: 'added', text: a },
    ];
  }

  const diff: Array<{ type: 'same' | 'added' | 'removed'; text: string }> = [];
  const max = Math.max(expLines.length, actLines.length);

  for (let i = 0; i < max; i++) {
    const exp = expLines[i];
    const act = actLines[i];

    if (exp !== undefined && act !== undefined) {
      if (exp === act) {
        diff.push({ type: 'same', text: exp });
      } else {
        diff.push({ type: 'removed', text: exp });
        diff.push({ type: 'added', text: act });
      }
    } else if (exp !== undefined) {
      diff.push({ type: 'removed', text: exp });
    } else if (act !== undefined) {
      diff.push({ type: 'added', text: act });
    }
  }

  return diff;
}

/**
 * Generates actionable copyable CLI remediation command for any given discrepancy.
 */
export function generateCliRemediationCommand(
  moduleId: string,
  discrepancy: VerificationDiscrepancy,
  context?: {
    scopePath?: string | undefined;
    targetOrg?: string | undefined;
  },
): { command: string; rationale: string } {
  const scope = context?.scopePath ?? 'scopes/remediation-scope.json';
  const resource = discrepancy.resourceName;

  switch (moduleId) {
    case 'deploy-keys':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules deploy-keys --force',
        rationale:
          'Re-registers missing or permission-drifted deploy key \x27' +
          resource +
          '\x27 with read-only restriction.',
      };

    case 'collaborators':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules collaborators',
        rationale:
          'Re-applies direct outside collaborator permissions on target repository for \x27' +
          resource +
          '\x27.',
      };

    case 'releases':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules releases --retry-failed-assets',
        rationale:
          'Re-streams missing release assets or recreates release tag \x27' +
          resource +
          '\x27 without size limit bottlenecks.',
      };

    case 'lfs':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules lfs --verify-oids',
        rationale:
          'Re-transfers unmigrated Git LFS objects and validates SHA-256 pointer checksums for \x27' +
          resource +
          '\x27.',
      };

    case 'rulesets':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules rulesets --overwrite-drift',
        rationale:
          'Reconciles divergent ruleset \x27' +
          resource +
          '\x27, restoring required branch protection conditions and bypass actors.',
      };

    case 'branch-protection':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules branch-protection',
        rationale:
          'Applies branch protection policies for \x27' +
          resource +
          '\x27 on target repository.',
      };

    case 'post-migration-mannequins':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules post-migration-mannequins --skip-invitation',
        rationale:
          'Attributes unmapped mannequin contributor \x27' +
          resource +
          '\x27 to EMU corporate identity.',
      };

    case 'org-variables':
    case 'repo-variables':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules ' +
          moduleId +
          ' --reconcile',
        rationale:
          'Synchronizes missing configuration variable \x27' +
          resource +
          '\x27 to match expected migration state.',
      };

    case 'org-secrets':
    case 'repo-secrets':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules ' +
          moduleId +
          ' --prompt-missing',
        rationale:
          'Re-encrypts and syncs public-key secret \x27' +
          resource +
          '\x27 onto target organization/repository.',
      };

    case 'teams':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules teams --sync-hierarchy',
        rationale:
          'Reconstructs team hierarchy, privacy, and permission grants for team \x27' +
          resource +
          '\x27.',
      };

    case 'packages':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules packages',
        rationale:
          'Re-syncs container images and package versions for package \x27' +
          resource +
          '\x27.',
      };

    case 'custom-properties':
    case 'org-custom-properties':
    case 'repo-custom-properties':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules custom-properties',
        rationale:
          'Updates target custom property schema definition or value for \x27' +
          resource +
          '\x27.',
      };

    case 'webhooks':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules webhooks',
        rationale:
          'Re-creates webhook configuration \x27' +
          resource +
          '\x27 with active status and subscribed events.',
      };

    case 'environments':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules environments',
        rationale:
          'Recreates deployment environment and protection rules for \x27' +
          resource +
          '\x27.',
      };

    case 'issues':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules issues',
        rationale:
          'Re-imports issues and milestone metadata for \x27' +
          resource +
          '\x27 via Issue Import API or REST fallback.',
      };

    case 'pull-requests':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules pull-requests',
        rationale:
          'Recreates active open pull requests or archives closed PR history for \x27' +
          resource +
          '\x27.',
      };

    case 'repo-settings':
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules repo-settings',
        rationale:
          'Re-applies repository features and general metadata settings for \x27' +
          resource +
          '\x27.',
      };

    case 'gei-repo': {
      const resLower = resource.toLowerCase();
      if (resLower === 'issues' || resLower.includes('issue')) {
        return {
          command:
            'npx ghec-consultant-cli migrate --scope ' +
            scope +
            ' --modules issues',
          rationale:
            'Re-imports issues dropped during GEI migration for \x27' +
            resource +
            '\x27.',
        };
      }
      if (
        resLower === 'pull-requests' ||
        resLower.includes('pull') ||
        resLower.includes('pr')
      ) {
        return {
          command:
            'npx ghec-consultant-cli migrate --scope ' +
            scope +
            ' --modules pull-requests',
          rationale:
            'Recreates active open PRs or archives closed PRs dropped during GEI migration for \x27' +
            resource +
            '\x27.',
        };
      }
      if (resLower === 'releases' || resLower.includes('release')) {
        return {
          command:
            'npx ghec-consultant-cli migrate --scope ' +
            scope +
            ' --modules releases',
          rationale:
            'Re-migrates releases skipped during GEI migration for \x27' +
            resource +
            '\x27.',
        };
      }
      if (
        resLower === 'repo-settings' ||
        resLower === 'default-branch' ||
        resLower.includes('setting')
      ) {
        return {
          command:
            'npx ghec-consultant-cli migrate --scope ' +
            scope +
            ' --modules repo-settings',
          rationale:
            'Re-applies repository settings dropped during GEI migration for \x27' +
            resource +
            '\x27.',
        };
      }
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules gei-repo',
        rationale:
          'Re-runs repository GEI migration or verification for \x27' +
          resource +
          '\x27.',
      };
    }

    default:
      return {
        command:
          'npx ghec-consultant-cli migrate --scope ' +
          scope +
          ' --modules ' +
          moduleId,
        rationale:
          'Runs remediation migration pass for module \x27' +
          moduleId +
          '\x27 addressing discrepancy in \x27' +
          resource +
          '\x27.',
      };
  }
}

/**
 * Classifies all discrepancies in a VerificationReport.
 */
export function classifyReportDiscrepancies(
  report: VerificationReport,
): ClassifiedDiscrepancy[] {
  const result = [];
  let counter = 0;

  for (const mod of report.modules) {
    for (const disc of mod.discrepancies) {
      counter++;
      const id =
        mod.moduleId +
        '-' +
        counter +
        '-' +
        disc.resourceName.replace(/[^\w-]/g, '_');
      const severity = categorizeDiscrepancySeverity(mod.moduleId, disc);
      const expectedFormatted = formatValue(disc.expected);
      const actualFormatted = formatValue(disc.actual);
      const diffLines = computeLineDiff(expectedFormatted, actualFormatted);
      const { command, rationale } = generateCliRemediationCommand(
        mod.moduleId,
        disc,
        { targetOrg: report.targetOrg },
      );

      result.push({
        id,
        moduleId: mod.moduleId,
        resourceName: disc.resourceName,
        severity,
        message: disc.message,
        expected: disc.expected,
        actual: disc.actual,
        expectedFormatted,
        actualFormatted,
        remediationCommand: command,
        remediationRationale: rationale,
        diffLines,
      });
    }
  }

  return result;
}

/**
 * Computes high-level verification stats from a VerificationReport.
 */
export function computeVerificationStats(
  report: VerificationReport,
  classified: ClassifiedDiscrepancy[],
): VerificationStats {
  const verifiedModuleCount = report.modules.filter((m) => m.verified).length;
  const unverifiedModuleCount = report.modules.length - verifiedModuleCount;
  const totalModules = report.modules.length;

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const item of classified) {
    if (item.severity === 'critical') criticalCount++;
    else if (item.severity === 'high') highCount++;
    else if (item.severity === 'medium') mediumCount++;
    else if (item.severity === 'low') lowCount++;
  }

  const compliancePercentage =
    totalModules > 0
      ? Math.round((verifiedModuleCount / totalModules) * 100)
      : 100;

  return {
    verifiedModuleCount,
    unverifiedModuleCount,
    totalModules,
    discrepancyCount: classified.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    compliancePercentage,
  };
}

/**
 * Generates a downloadable CSV audit report of all discrepancies.
 */
export function generateVerificationCsv(
  report: VerificationReport,
  classified: ClassifiedDiscrepancy[],
): string {
  const headers = [
    'Module',
    'Resource Name',
    'Severity',
    'Discrepancy Message',
    'Expected Value',
    'Actual Value',
    'Remediation Command',
  ];

  const escapeCsv = (val: unknown): string => {
    const escaped = String(val).replace(/"/g, '""');
    return '"' + escaped + '"';
  };

  const rows = classified.map((c) => [
    escapeCsv(c.moduleId),
    escapeCsv(c.resourceName),
    escapeCsv(c.severity),
    escapeCsv(c.message),
    escapeCsv(c.expectedFormatted.replace(/\n/g, ' ')),
    escapeCsv(c.actualFormatted.replace(/\n/g, ' ')),
    escapeCsv(c.remediationCommand),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Generates a targeted remediation scope JSON containing only the affected resources/modules.
 */
export function generateRemediationScopeJson(
  report: VerificationReport,
  classified: ClassifiedDiscrepancy[],
): object {
  const affectedModules = Array.from(
    new Set(classified.map((c) => c.moduleId)),
  );

  return {
    $schema:
      'https://raw.githubusercontent.com/cloudgxp/ghec-consultant-suite/main/packages/contracts/src/schemas/migration-scope.json',
    scopeName: 'remediation-' + (report.scopeName || 'scope'),
    description:
      'Auto-generated remediation scope addressing ' +
      classified.length +
      ' discrepancies from report ' +
      report.reportId,
    sourceOrganization: report.sourceOrg,
    targetOrganization: report.targetOrg,
    generatedAt: new Date().toISOString(),
    selectedModules: affectedModules,
    discrepanciesCount: classified.length,
    resourcesToReconcile: classified.map((c) => ({
      module: c.moduleId,
      resource: c.resourceName,
      severity: c.severity,
    })),
  };
}

/**
 * Sample Clean Verification Report (100% compliant, 0 discrepancies)
 */
export const sampleCleanVerificationReport: VerificationReport = {
  schemaVersion: '1.0.0',
  reportId: 'vr-clean-wave-01',
  verifiedAt: '2026-10-06T12:00:00.000Z',
  scopeName: 'cloudgxp-production-wave-1',
  sourceOrg: 'cloudgxp-source',
  targetOrg: 'cloudgxp-target',
  modules: [
    { moduleId: 'teams', verified: true, discrepancies: [] },
    { moduleId: 'rulesets', verified: true, discrepancies: [] },
    { moduleId: 'branch-protection', verified: true, discrepancies: [] },
    { moduleId: 'repo-variables', verified: true, discrepancies: [] },
    { moduleId: 'repo-secrets', verified: true, discrepancies: [] },
    { moduleId: 'org-variables', verified: true, discrepancies: [] },
    { moduleId: 'org-secrets', verified: true, discrepancies: [] },
    { moduleId: 'environments', verified: true, discrepancies: [] },
    { moduleId: 'webhooks', verified: true, discrepancies: [] },
    { moduleId: 'custom-properties', verified: true, discrepancies: [] },
    { moduleId: 'deploy-keys', verified: true, discrepancies: [] },
    { moduleId: 'collaborators', verified: true, discrepancies: [] },
    { moduleId: 'releases', verified: true, discrepancies: [] },
    { moduleId: 'lfs', verified: true, discrepancies: [] },
    { moduleId: 'packages', verified: true, discrepancies: [] },
    {
      moduleId: 'post-migration-mannequins',
      verified: true,
      discrepancies: [],
    },
    { moduleId: 'codeowners', verified: true, discrepancies: [] },
  ],
  summary: {
    verifiedModuleCount: 17,
    unverifiedModuleCount: 0,
    discrepancyCount: 0,
  },
};

/**
 * Sample Verification Report with realistic post-migration discrepancies
 */
export const sampleDiscrepantVerificationReport: VerificationReport = {
  schemaVersion: '1.0.0',
  reportId: 'vr-audit-wave-02',
  verifiedAt: '2026-10-06T12:30:00.000Z',
  scopeName: 'cloudgxp-wave-2-core-apps',
  sourceOrg: 'cloudgxp-source',
  targetOrg: 'cloudgxp-target',
  modules: [
    {
      moduleId: 'deploy-keys',
      verified: false,
      discrepancies: [
        {
          resourceName: 'frontend-service-ci-key',
          expected: { read_only: true, fingerprint: 'SHA256:abc123xyz' },
          actual: { read_only: false, fingerprint: 'SHA256:abc123xyz' },
          message:
            'Deploy key has unexpected write access on target repository; expected read_only: true.',
        },
      ],
    },
    {
      moduleId: 'collaborators',
      verified: false,
      discrepancies: [
        {
          resourceName: 'octocat-consultant',
          expected: { permission: 'write', role_name: 'push' },
          actual: { permission: 'none', role_name: 'missing' },
          message:
            'Outside collaborator octocat-consultant is missing on target repository.',
        },
      ],
    },
    {
      moduleId: 'releases',
      verified: false,
      discrepancies: [
        {
          resourceName: 'v2.4.0-stable',
          expected: {
            tag_name: 'v2.4.0',
            asset_count: 3,
            total_bytes: 52428800,
          },
          actual: { tag_name: 'v2.4.0', asset_count: 2, total_bytes: 20971520 },
          message:
            'Release binary asset archive.tar.gz (31.4 MB) missing on target release.',
        },
      ],
    },
    {
      moduleId: 'lfs',
      verified: false,
      discrepancies: [
        {
          resourceName: 'models/v1-weights.bin',
          expected: {
            oid: '4b825dc642cb6eb9a060e54bf8d69288fbee4904ce7e1ab641d4b999def24a5c',
            size: 157286400,
          },
          actual: null,
          message:
            'Git LFS pointer object OID not found in target LFS storage store.',
        },
      ],
    },
    {
      moduleId: 'rulesets',
      verified: false,
      discrepancies: [
        {
          resourceName: 'Production Protected Branches',
          expected: {
            enforcement: 'active',
            bypass_actors: ['Repository migrations'],
            bypass_mode: 'exempt',
          },
          actual: {
            enforcement: 'active',
            bypass_actors: [],
            bypass_mode: 'none',
          },
          message:
            'Ruleset missing required "Repository migrations" exempt bypass actor.',
        },
      ],
    },
    {
      moduleId: 'post-migration-mannequins',
      verified: false,
      discrepancies: [
        {
          resourceName: 'former-engineer-ghost',
          expected: { emuLogin: 'former-engineer_gxp', status: 'reclaimed' },
          actual: { emuLogin: null, status: 'unmapped_mannequin' },
          message:
            'Mannequin former-engineer-ghost has not been reclaimed or mapped to an EMU target user.',
        },
      ],
    },
    {
      moduleId: 'teams',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'branch-protection',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'repo-variables',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'repo-secrets',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'org-variables',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'org-secrets',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'environments',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'webhooks',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'custom-properties',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'packages',
      verified: true,
      discrepancies: [],
    },
    {
      moduleId: 'codeowners',
      verified: true,
      discrepancies: [],
    },
  ],
  summary: {
    verifiedModuleCount: 11,
    unverifiedModuleCount: 6,
    discrepancyCount: 6,
  },
};
