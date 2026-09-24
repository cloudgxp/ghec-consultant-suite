import type { DiscoveryBundle, ModuleId } from '@ghec/contracts';

/** Contract only. Rules must be pure, deterministic, versioned, and evidence-backed. */
export interface AnalysisRule {
  readonly id: string;
  readonly version: string;
  readonly dimension: string;
  readonly requiredModule: ModuleId;
  evaluate(bundle: Readonly<DiscoveryBundle>): DiscoveryBundle['findings'];
}

export type DimensionStatus =
  'review_required' | 'no_issue_observed' | 'unknown' | 'not_applicable';

export interface MigrationDimensionAssessment {
  readonly id: string;
  readonly name: string;
  readonly status: DimensionStatus;
  readonly statusLabel: string;
  readonly summary: string;
  readonly ruleId: string;
  readonly requiredModule: ModuleId;
  readonly findings: DiscoveryBundle['findings'];
  readonly caveats: string[];
}

export interface EvaluatedInsights {
  readonly dimensions: MigrationDimensionAssessment[];
  readonly findings: DiscoveryBundle['findings'];
  readonly scopeLimitations: string[];
  readonly collectorSummary: {
    readonly total: number;
    readonly complete: number;
    readonly partial: number;
    readonly failed: number;
    readonly skipped: number;
    readonly unavailable: number;
  };
}

const RULE_VERSION = '0.1.0';

// 1. Repository Size Rule (MIG-SIZE-001)
export const MigSizeRule: AnalysisRule = {
  id: 'MIG-SIZE-001',
  version: RULE_VERSION,
  dimension: 'Repository Size & Storage',
  requiredModule: 'repos',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:repos`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:repos`);
      if (!execId) continue;

      const repos = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'repository',
      );

      for (const repo of repos) {
        if (repo.kind !== 'repository') continue;

        if (repo.size.availability !== 'observed' || repo.size.value === null) {
          findings.push({
            id: `finding:${org.id}:${repo.id}:size-unknown`,
            organizationId: org.id,
            classification: 'advisory',
            ruleId: 'MIG-SIZE-001',
            ruleVersion: RULE_VERSION,
            severity: 'medium',
            title: `Unknown repository size: ${repo.name}`,
            description: `Repository size is not measurable (${repo.size.reason ?? 'Unknown'}). Rehearsal sizing is required prior to migration.`,
            entityIds: [repo.id],
            evidenceExecutionIds: [execId],
            confidence: 'medium',
            limitations: ['Size metric unavailable from evidence.'],
          });
        } else if (repo.size.value > 5 * 1024 * 1024 * 1024) {
          // > 5 GB
          findings.push({
            id: `finding:${org.id}:${repo.id}:size-critical`,
            organizationId: org.id,
            classification: 'calculated',
            ruleId: 'MIG-SIZE-001',
            ruleVersion: RULE_VERSION,
            severity: 'high',
            title: `Large repository exceeding 5 GB: ${repo.name}`,
            description: `Repository size is ${(repo.size.value / (1024 * 1024 * 1024)).toFixed(2)} GB. Destination transfer limits and migration windows require migration rehearsal.`,
            entityIds: [repo.id],
            evidenceExecutionIds: [execId],
            confidence: 'high',
            limitations: [
              'Network throughput and destination git pack limits may apply.',
            ],
          });
        } else if (repo.size.value > 1024 * 1024 * 1024) {
          // > 1 GB
          findings.push({
            id: `finding:${org.id}:${repo.id}:size-warning`,
            organizationId: org.id,
            classification: 'calculated',
            ruleId: 'MIG-SIZE-001',
            ruleVersion: RULE_VERSION,
            severity: 'low',
            title: `Repository size exceeds 1 GB: ${repo.name}`,
            description: `Repository size is ${(repo.size.value / (1024 * 1024 * 1024)).toFixed(2)} GB. Review history pruning or shallow transfer options.`,
            entityIds: [repo.id],
            evidenceExecutionIds: [execId],
            confidence: 'high',
            limitations: ['Target repository quota should be confirmed.'],
          });
        }
      }
    }
    return findings;
  },
};

// 2. Git LFS Rule (MIG-LFS-001)
export const MigLfsRule: AnalysisRule = {
  id: 'MIG-LFS-001',
  version: RULE_VERSION,
  dimension: 'Git LFS Storage',
  requiredModule: 'lfs',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:lfs`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:lfs`);
      if (!execId) continue;

      const lfsEntities = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'lfs',
      );

      for (const lfs of lfsEntities) {
        if (lfs.kind !== 'lfs') continue;

        if (lfs.indicator === 'detected') {
          const isUnknown =
            lfs.storage.availability !== 'observed' ||
            lfs.storage.value === null;
          findings.push({
            id: `finding:${org.id}:${lfs.id}:lfs-detected`,
            organizationId: org.id,
            classification: 'advisory',
            ruleId: 'MIG-LFS-001',
            ruleVersion: RULE_VERSION,
            severity: isUnknown ? 'medium' : 'low',
            title: `Git LFS detected${isUnknown ? ' with unmeasured storage' : ''}`,
            description: isUnknown
              ? `Git LFS is active on repository ${lfs.repositoryId}, but storage metrics could not be established (${lfs.storage.reason ?? 'Unknown'}). Dedicated LFS measurement required.`
              : `Git LFS is active with ${((lfs.storage.value ?? 0) / (1024 * 1024)).toFixed(1)} MB storage across ${lfs.objectCount.value ?? 0} objects. LFS endpoint migration required.`,
            entityIds: [lfs.id, lfs.repositoryId],
            evidenceExecutionIds: [execId],
            confidence: isUnknown ? 'medium' : 'high',
            limitations: isUnknown
              ? ['Total storage and object count are unconfirmed.']
              : [
                  'Bandwidth limits at destination may affect migration window.',
                ],
          });
        }
      }
    }
    return findings;
  },
};

// 3. Actions & Automation Rule (MIG-ACTIONS-001)
export const MigActionsRule: AnalysisRule = {
  id: 'MIG-ACTIONS-001',
  version: RULE_VERSION,
  dimension: 'Actions & Runners',
  requiredModule: 'actions',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:actions`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:actions`);
      if (!execId) continue;

      const actionsEntities = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'actions',
      );

      for (const action of actionsEntities) {
        if (action.kind !== 'actions') continue;

        if (action.runnerTypes.includes('self-hosted')) {
          findings.push({
            id: `finding:${org.id}:${action.id}:self-hosted-runners`,
            organizationId: org.id,
            classification: 'calculated',
            ruleId: 'MIG-ACTIONS-001',
            ruleVersion: RULE_VERSION,
            severity: 'high',
            title: 'Self-hosted Actions runners detected',
            description: `Repository ${action.repositoryId} utilizes self-hosted runners (${action.runnerCount.value ?? 'unknown'} runners). Runner infrastructure, VPC networking, and runner group memberships must be provisioned in the target enterprise.`,
            entityIds: [action.id, action.repositoryId],
            evidenceExecutionIds: [execId],
            confidence: 'high',
            limitations: [
              'Runner group mapping and OS/architecture details require target discovery.',
            ],
          });
        }
      }
    }
    return findings;
  },
};

// 4. Configuration, Secrets & Variables Rule (MIG-CONFIG-001)
export const MigConfigRule: AnalysisRule = {
  id: 'MIG-CONFIG-001',
  version: RULE_VERSION,
  dimension: 'Secrets & Variables',
  requiredModule: 'actions-secrets',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [
        `${c.organizationId}:actions-secrets`,
        c.id,
      ]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:actions-secrets`);
      if (!execId) continue;

      const secrets = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'actions-secret',
      );

      if (secrets.length > 0) {
        const secretKinds = secrets.filter(
          (s) =>
            s.kind === 'actions-secret' && s.configurationKind === 'secret',
        );
        findings.push({
          id: `finding:${org.id}:secrets-recreation`,
          organizationId: org.id,
          classification: 'advisory',
          ruleId: 'MIG-CONFIG-001',
          ruleVersion: RULE_VERSION,
          severity: secretKinds.length > 0 ? 'medium' : 'info',
          title: `Actions configuration items detected (${secrets.length} items)`,
          description: `Discovered ${secretKinds.length} secret(s) and ${secrets.length - secretKinds.length} variable(s). GitHub does not expose secret values; secrets must be securely re-created and re-populated in the destination organization/enterprise.`,
          entityIds: secrets.map((s) => s.id),
          evidenceExecutionIds: [execId],
          confidence: 'high',
          limitations: [
            'Only metadata names and scopes are collected; secret values are not accessible or stored.',
          ],
        });
      }
    }
    return findings;
  },
};

// 5. Governance & Policies Rule (MIG-POLICY-001)
export const MigPolicyRule: AnalysisRule = {
  id: 'MIG-POLICY-001',
  version: RULE_VERSION,
  dimension: 'Policies & Rulesets',
  requiredModule: 'policies',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:policies`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:policies`);
      if (!execId) continue;

      const policies = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'policy',
      );

      const activeRulesets = policies.filter(
        (p) => p.kind === 'policy' && p.enforcement === 'active',
      );

      if (activeRulesets.length > 0) {
        findings.push({
          id: `finding:${org.id}:active-policies`,
          organizationId: org.id,
          classification: 'advisory',
          ruleId: 'MIG-POLICY-001',
          ruleVersion: RULE_VERSION,
          severity: 'low',
          title: `${activeRulesets.length} active branch protection/ruleset policies discovered`,
          description: `Policies are actively enforced. Ensure target organization permissions and enterprise policy defaults align with source rules.`,
          entityIds: activeRulesets.map((p) => p.id),
          evidenceExecutionIds: [execId],
          confidence: 'high',
          limitations: [
            'Branch rule matching requires destination repository branch creation.',
          ],
        });
      }
    }
    return findings;
  },
};

// 6. Security Posture Rule (MIG-SECURITY-001)
export const MigSecurityRule: AnalysisRule = {
  id: 'MIG-SECURITY-001',
  version: RULE_VERSION,
  dimension: 'Security Posture',
  requiredModule: 'security',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:security`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:security`);
      if (!execId) continue;

      const securityItems = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'security',
      );

      for (const item of securityItems) {
        if (item.kind !== 'security') continue;

        if (
          item.dependabot === 'disabled' ||
          item.codeScanning === 'disabled'
        ) {
          findings.push({
            id: `finding:${org.id}:${item.id}:security-disabled`,
            organizationId: org.id,
            classification: 'calculated',
            ruleId: 'MIG-SECURITY-001',
            ruleVersion: RULE_VERSION,
            severity: 'low',
            title: `Security tooling disabled on repository`,
            description: `Dependabot is ${item.dependabot} and Code Scanning is ${item.codeScanning} on repository ${item.repositoryId}. Destination security baseline should be evaluated.`,
            entityIds: [item.id, item.repositoryId],
            evidenceExecutionIds: [execId],
            confidence: 'high',
            limitations: [
              'Advanced Security license availability at destination is required.',
            ],
          });
        }
      }
    }
    return findings;
  },
};

// 7. Identity & SSO Rule (MIG-IDENTITY-001)
export const MigIdentityRule: AnalysisRule = {
  id: 'MIG-IDENTITY-001',
  version: RULE_VERSION,
  dimension: 'Identities & SSO',
  requiredModule: 'users',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:users`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:users`);
      if (!execId) continue;

      const users = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'identity',
      );

      const outsideCollabs = users.filter(
        (u) => u.kind === 'identity' && u.outsideCollaborator === true,
      );
      const unlinkedSso = users.filter(
        (u) => u.kind === 'identity' && u.ssoStatus === 'unlinked',
      );

      if (outsideCollabs.length > 0 || unlinkedSso.length > 0) {
        findings.push({
          id: `finding:${org.id}:identity-review`,
          organizationId: org.id,
          classification: 'advisory',
          ruleId: 'MIG-IDENTITY-001',
          ruleVersion: RULE_VERSION,
          severity: 'medium',
          title: `Identity and access posture requires review`,
          description: `Identified ${outsideCollabs.length} outside collaborator(s) and ${unlinkedSso.length} unlinked SSO identity(ies). Target enterprise IdP provisioning (SCIM/SAML) must map these users explicitly.`,
          entityIds: [...outsideCollabs, ...unlinkedSso].map((u) => u.id),
          evidenceExecutionIds: [execId],
          confidence: 'high',
          limitations: [
            'Identities are pseudonymized in this discovery bundle to protect PII.',
          ],
        });
      }
    }
    return findings;
  },
};

// 8. Integrations & Keys Rule (MIG-INTEGRATION-001)
export const MigIntegrationRule: AnalysisRule = {
  id: 'MIG-INTEGRATION-001',
  version: RULE_VERSION,
  dimension: 'Integrations & Webhooks',
  requiredModule: 'integrations',
  evaluate(bundle) {
    const findings: DiscoveryBundle['findings'] = [];
    const executionMap = new Map(
      bundle.collectors.map((c) => [`${c.organizationId}:integrations`, c.id]),
    );

    for (const org of bundle.organizations) {
      const execId = executionMap.get(`${org.id}:integrations`);
      if (!execId) continue;

      const integrations = bundle.entities.filter(
        (e) => e.organizationId === org.id && e.kind === 'integration',
      );

      const activeIntegrations = integrations.filter(
        (i) => i.kind === 'integration' && i.active === true,
      );

      if (activeIntegrations.length > 0) {
        findings.push({
          id: `finding:${org.id}:active-integrations`,
          organizationId: org.id,
          classification: 'advisory',
          ruleId: 'MIG-INTEGRATION-001',
          ruleVersion: RULE_VERSION,
          severity: 'low',
          title: `${activeIntegrations.length} active integrations/webhooks require cutover planning`,
          description: `Discovered active integrations (webhooks, GitHub Apps, or deploy keys). Webhook endpoints, secrets, and App installations must be re-registered in the target enterprise.`,
          entityIds: activeIntegrations.map((i) => i.id),
          evidenceExecutionIds: [execId],
          confidence: 'high',
          limitations: [
            'Webhook URLs and secrets are not stored in discovery.',
          ],
        });
      }
    }
    return findings;
  },
};

export const IMPLEMENTED_RULES: readonly AnalysisRule[] = [
  MigSizeRule,
  MigLfsRule,
  MigActionsRule,
  MigConfigRule,
  MigPolicyRule,
  MigSecurityRule,
  MigIdentityRule,
  MigIntegrationRule,
];

/**
 * Pure, deterministic evaluation of an entire discovery bundle.
 * Combines bundle findings with rule-based calculated findings and aggregates
 * migration readiness dimensions.
 */
export function evaluateBundle(
  bundle: Readonly<DiscoveryBundle>,
): EvaluatedInsights {
  // 1. Gather all findings (bundle-supplied + rule-evaluated)
  const existingFindingIds = new Set(bundle.findings.map((f) => f.id));
  const allFindings = [...bundle.findings];

  for (const rule of IMPLEMENTED_RULES) {
    const generated = rule.evaluate(bundle);
    for (const f of generated) {
      if (!existingFindingIds.has(f.id)) {
        existingFindingIds.add(f.id);
        allFindings.push(f);
      }
    }
  }

  // 2. Collector execution counts
  const collectorSummary = {
    total: bundle.collectors.length,
    complete: bundle.collectors.filter((c) => c.status === 'complete').length,
    partial: bundle.collectors.filter((c) => c.status === 'partial').length,
    failed: bundle.collectors.filter((c) => c.status === 'failed').length,
    skipped: bundle.collectors.filter((c) => c.status === 'skipped').length,
    unavailable: bundle.collectors.filter((c) => c.status === 'unavailable')
      .length,
  };

  // 3. Build scope caveats
  const scopeLimitations = [...bundle.limitations];
  if (bundle.scope.kind === 'enterprise') {
    if (bundle.scope.enumeration !== 'complete') {
      scopeLimitations.unshift(
        `Enterprise enumeration is ${bundle.scope.enumeration}. Inaccessible organization count: ${
          bundle.scope.inaccessibleOrganizationCount ?? 'unknown'
        }.`,
      );
    }
  }

  // 4. Evaluate each migration readiness dimension
  const dimensions: MigrationDimensionAssessment[] = IMPLEMENTED_RULES.map(
    (rule) => {
      // Check if the collector for this module ran and its terminal state
      const matchingCollectors = bundle.collectors.filter(
        (c) => c.module === rule.requiredModule,
      );
      const findingsForDimension = allFindings.filter(
        (f) => f.ruleId === rule.id,
      );

      const hasFailed = matchingCollectors.some((c) => c.status === 'failed');
      const hasPartial = matchingCollectors.some((c) => c.status === 'partial');
      const hasSkippedOrUnavailable = matchingCollectors.some(
        (c) => c.status === 'skipped' || c.status === 'unavailable',
      );
      const isMissing = matchingCollectors.length === 0;

      let status: DimensionStatus = 'no_issue_observed';
      let statusLabel = 'No Issue Observed';
      let summary =
        'Assessment completed with no immediate blockers observed in collected evidence.';
      const caveats: string[] = [];

      if (isMissing || hasSkippedOrUnavailable) {
        status = 'unknown';
        statusLabel = 'Unknown (No Evidence)';
        summary = `Collector for module '${rule.requiredModule}' did not run or was unavailable.`;
        caveats.push('Evidence is incomplete; cannot establish readiness.');
      } else if (hasFailed) {
        status = 'review_required';
        statusLabel = 'Review Required (Collector Failed)';
        summary = `Collector for module '${rule.requiredModule}' failed during scan.`;
        caveats.push('Data collection failed; manual assessment required.');
      } else if (hasPartial) {
        status = 'unknown';
        statusLabel = 'Incomplete Evidence';
        summary = `Collector for module '${rule.requiredModule}' produced partial evidence.`;
        caveats.push('Partial collector coverage; some metrics are unknown.');
      }

      // If findings exist with high/medium severity, dimension becomes review_required
      const highMedFindings = findingsForDimension.filter(
        (f) => f.severity === 'high' || f.severity === 'medium',
      );
      if (highMedFindings.length > 0) {
        status = 'review_required';
        statusLabel = 'Review Required';
        summary = `${highMedFindings.length} item(s) require consultant and customer review.`;
      } else if (
        status === 'no_issue_observed' &&
        findingsForDimension.length > 0
      ) {
        statusLabel = 'Advisories Present';
        summary = `${findingsForDimension.length} advisory finding(s) noted.`;
      }

      return {
        id: rule.id,
        name: rule.dimension,
        status,
        statusLabel,
        summary,
        ruleId: rule.id,
        requiredModule: rule.requiredModule,
        findings: findingsForDimension,
        caveats,
      };
    },
  );

  return {
    dimensions,
    findings: allFindings,
    scopeLimitations,
    collectorSummary,
  };
}
