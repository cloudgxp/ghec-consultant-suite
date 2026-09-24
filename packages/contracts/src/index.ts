import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0' as const;
export const MODULE_IDS = [
  'orgs',
  'repos',
  'lfs',
  'teams',
  'actions',
  'actions-secrets',
  'policies',
  'security',
  'integrations',
  'users',
  'packages',
] as const;
export const ModuleIdSchema = z.enum(MODULE_IDS);
export type ModuleId = z.infer<typeof ModuleIdSchema>;
const Id = z.string().min(1).max(256);
const Text = z.string().max(2048);
const Timestamp = z.string().datetime({ offset: true });
const Count = z.number().int().nonnegative();
const Metric = z
  .object({
    value: z.number().nonnegative().nullable(),
    unit: z.enum(['bytes', 'count', 'minutes']),
    availability: z.enum(['observed', 'unknown', 'unavailable']),
    reason: Text.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.availability === 'observed') !== (v.value !== null))
      ctx.addIssue({
        code: 'custom',
        message: 'Observed metrics need a value; other metrics must be null',
      });
    if (v.availability !== 'observed' && !v.reason)
      ctx.addIssue({
        code: 'custom',
        message: 'Unknown or unavailable metrics need a reason',
      });
  });
const BytesMetric = Metric.refine((v) => v.unit === 'bytes', 'Expected bytes');
const CountMetric = Metric.refine(
  (v) => v.unit === 'count' && (v.value === null || Number.isInteger(v.value)),
  'Expected integer count',
);
const MinutesMetric = Metric.refine(
  (v) => v.unit === 'minutes',
  'Expected minutes',
);
export const ProvenanceSchema = z
  .object({
    source: z.enum(['graphql', 'rest', 'synthetic']),
    operation: Id,
    observedAt: Timestamp,
    apiVersion: Id.nullable(),
  })
  .strict();
export const ErrorSchema = z
  .object({
    code: z.enum([
      'permission_denied',
      'not_found_or_inaccessible',
      'rate_limited',
      'network',
      'unsupported',
      'validation',
      'not_implemented',
      'unknown',
    ]),
    message: Text,
    retryable: z.boolean(),
  })
  .strict();
const Organization = z
  .object({ id: Id, login: Id, displayName: Text.nullable() })
  .strict();
const base = {
  id: Id,
  organizationId: Id,
  collectorExecutionId: Id,
  provenance: ProvenanceSchema,
};
export const EntitySchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('repository'),
      name: Id,
      visibility: z.enum(['public', 'private', 'internal', 'unknown']),
      archived: z.boolean().nullable(),
      defaultBranch: Id.nullable(),
      size: BytesMetric,
      fork: z.boolean().nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('lfs'),
      repositoryId: Id,
      storage: BytesMetric,
      objectCount: CountMetric,
      indicator: z.enum(['detected', 'not_detected', 'unknown']),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('team'),
      name: Id,
      parentTeamId: Id.nullable(),
      membershipCount: CountMetric,
      repositoryAccess: z.array(
        z
          .object({
            repositoryId: Id,
            permission: z.enum([
              'read',
              'triage',
              'write',
              'maintain',
              'admin',
              'custom',
              'unknown',
            ]),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('actions'),
      repositoryId: Id,
      enabled: z.boolean().nullable(),
      workflowCount: CountMetric,
      runnerCount: CountMetric,
      usage: MinutesMetric,
      workflowNames: z.array(Id),
      runnerTypes: z.array(z.enum(['hosted', 'self-hosted', 'unknown'])),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('actions-secret'),
      repositoryId: Id.nullable(),
      name: Id,
      configurationKind: z.enum(['secret', 'variable']),
      level: z.enum(['organization', 'repository', 'environment']),
      updatedAt: Timestamp.nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('policy'),
      repositoryId: Id.nullable(),
      policyKind: z.enum(['branch_protection', 'ruleset']),
      name: Id,
      enforcement: z.enum(['active', 'evaluate', 'disabled', 'unknown']),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('security'),
      repositoryId: Id,
      codeScanning: z.enum(['enabled', 'disabled', 'unknown']),
      dependabot: z.enum(['enabled', 'disabled', 'unknown']),
      openAlertCount: CountMetric,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('integration'),
      repositoryId: Id.nullable(),
      integrationKind: z.enum([
        'webhook',
        'github_app',
        'deploy_key',
        'ssh_signing',
        'other',
      ]),
      label: Id,
      active: z.boolean().nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('identity'),
      pseudonym: Id,
      outsideCollaborator: z.boolean().nullable(),
      ssoStatus: z.enum(['linked', 'unlinked', 'unknown']),
      membership: z.enum(['member', 'owner', 'outside', 'unknown']),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('asset'),
      repositoryId: Id,
      assetKind: z.enum(['package', 'release', 'large_asset']),
      name: Id,
      size: BytesMetric,
    })
    .strict(),
]);
export const CollectorExecutionSchema = z
  .object({
    id: Id,
    module: ModuleIdSchema,
    organizationId: Id,
    status: z.enum(['complete', 'partial', 'failed', 'skipped', 'unavailable']),
    startedAt: Timestamp,
    completedAt: Timestamp,
    provenance: z.array(ProvenanceSchema),
    warnings: z.array(Text),
    errors: z.array(ErrorSchema),
    coverage: z
      .object({
        state: z.enum(['complete', 'partial', 'unknown', 'none']),
        observed: Count,
        expected: Count.nullable(),
        reason: Text.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (Date.parse(v.completedAt) < Date.parse(v.startedAt))
      ctx.addIssue({
        code: 'custom',
        message: 'Collector completion precedes start',
      });
    if (
      v.coverage.expected !== null &&
      v.coverage.observed > v.coverage.expected
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Observed exceeds expected coverage',
      });
    if (
      v.status === 'complete' &&
      (v.coverage.state !== 'complete' || v.errors.length > 0)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Complete collector must have complete coverage and no errors',
      });
    if (v.status !== 'complete' && !v.coverage.reason)
      ctx.addIssue({
        code: 'custom',
        message: 'Incomplete collector needs a coverage reason',
      });
    if (v.status === 'complete' && !v.provenance.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Complete collector needs source provenance',
      });
    if (v.status === 'failed' && !v.errors.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Failed collector needs an error',
      });
  });
export const FindingSchema = z
  .object({
    id: Id,
    organizationId: Id,
    classification: z.enum(['calculated', 'advisory']),
    ruleId: Id,
    ruleVersion: Id,
    severity: z.enum(['info', 'low', 'medium', 'high']),
    title: Text,
    description: Text,
    entityIds: z.array(Id),
    evidenceExecutionIds: z.array(Id).min(1),
    confidence: z.enum(['high', 'medium', 'low']),
    limitations: z.array(Text),
  })
  .strict();
const BundleShape = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    synthetic: z.boolean(),
    scan: z
      .object({
        id: Id,
        startedAt: Timestamp,
        completedAt: Timestamp,
        producer: z.literal('ghec-consultant-cli'),
        producerVersion: Id,
        status: z.enum(['complete', 'partial', 'failed']),
      })
      .strict(),
    configuration: z
      .object({
        modules: z.array(ModuleIdSchema).min(1),
        format: z.literal('json'),
        includeSensitiveMetadata: z.boolean(),
        redactionProfile: z.enum(['standard', 'minimal']),
        continueOnError: z.boolean(),
      })
      .strict(),
    scope: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('organization'), organizationId: Id })
        .strict(),
      z
        .object({
          kind: z.literal('enterprise'),
          slug: Id,
          enumeration: z.enum(['complete', 'partial', 'unknown']),
          inaccessibleOrganizationCount: Count.nullable(),
        })
        .strict(),
    ]),
    organizations: z.array(Organization),
    collectors: z.array(CollectorExecutionSchema),
    entities: z.array(EntitySchema),
    findings: z.array(FindingSchema),
    limitations: z.array(Text),
    errors: z.array(ErrorSchema),
    summary: z
      .object({
        organizationCount: Count,
        repositoryCount: Count,
        completeCollectorCount: Count,
        incompleteCollectorCount: Count,
      })
      .strict(),
  })
  .strict();
export const DiscoveryBundleSchema = BundleShape.superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const orgs = new Set(b.organizations.map((o) => o.id));
  const executions = new Map(b.collectors.map((c) => [c.id, c]));
  const entities = new Map(b.entities.map((e) => [e.id, e]));
  for (const [name, ids] of [
    ['organizations', b.organizations.map((o) => o.id)],
    ['collectors', b.collectors.map((c) => c.id)],
    ['entities', b.entities.map((e) => e.id)],
    ['findings', b.findings.map((f) => f.id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) issue(`Duplicate IDs in ${name}`);
  }
  if (new Set(b.configuration.modules).size !== b.configuration.modules.length)
    issue('Duplicate modules');
  if (Date.parse(b.scan.completedAt) < Date.parse(b.scan.startedAt))
    issue('Scan completion precedes start');
  if (
    b.scope.kind === 'organization' &&
    (orgs.size !== 1 || !orgs.has(b.scope.organizationId))
  )
    issue('Organization scope must contain exactly its target');
  const pairs = new Set<string>();
  for (const c of b.collectors) {
    if (
      !orgs.has(c.organizationId) ||
      !b.configuration.modules.includes(c.module)
    )
      issue('Collector scope or module mismatch');
    const pair = `${c.organizationId}/${c.module}`;
    if (pairs.has(pair)) issue('Duplicate organization/module execution');
    pairs.add(pair);
    if (
      Date.parse(c.startedAt) < Date.parse(b.scan.startedAt) ||
      Date.parse(c.completedAt) > Date.parse(b.scan.completedAt)
    )
      issue('Collector timestamps outside scan');
  }
  for (const org of orgs)
    for (const module of b.configuration.modules)
      if (!pairs.has(`${org}/${module}`))
        issue('Missing collector execution for selected module');
  const moduleForKind: Record<z.infer<typeof EntitySchema>['kind'], ModuleId> =
    {
      repository: 'repos',
      lfs: 'lfs',
      team: 'teams',
      actions: 'actions',
      'actions-secret': 'actions-secrets',
      policy: 'policies',
      security: 'security',
      integration: 'integrations',
      identity: 'users',
      asset: 'packages',
    };
  for (const e of b.entities) {
    const c = executions.get(e.collectorExecutionId);
    if (
      !orgs.has(e.organizationId) ||
      c?.organizationId !== e.organizationId ||
      c.module !== moduleForKind[e.kind]
    )
      issue('Entity provenance or scope mismatch');
    const checkRef = (id: string, kind: 'repository' | 'team') => {
      const target = entities.get(id);
      if (target?.kind !== kind || target.organizationId !== e.organizationId)
        issue('Missing or cross-organization relationship');
    };
    if ('repositoryId' in e && e.repositoryId !== null)
      checkRef(e.repositoryId, 'repository');
    if (e.kind === 'team') {
      if (e.parentTeamId) checkRef(e.parentTeamId, 'team');
      for (const a of e.repositoryAccess)
        checkRef(a.repositoryId, 'repository');
    }
  }
  for (const f of b.findings) {
    if (!orgs.has(f.organizationId)) issue('Finding organization missing');
    for (const id of f.entityIds)
      if (entities.get(id)?.organizationId !== f.organizationId)
        issue('Finding entity missing or outside organization');
    for (const id of f.evidenceExecutionIds)
      if (executions.get(id)?.organizationId !== f.organizationId)
        issue('Finding evidence missing or outside organization');
  }
  const complete = b.collectors.filter((c) => c.status === 'complete').length;
  if (
    b.summary.organizationCount !== orgs.size ||
    b.summary.repositoryCount !==
      b.entities.filter((e) => e.kind === 'repository').length ||
    b.summary.completeCollectorCount !== complete ||
    b.summary.incompleteCollectorCount !== b.collectors.length - complete
  )
    issue('Summary differs from observed data');
  if (
    b.scan.status === 'complete' &&
    (complete !== b.collectors.length ||
      b.errors.length ||
      (b.scope.kind === 'enterprise' && b.scope.enumeration !== 'complete'))
  )
    issue('Complete scan cannot have incomplete evidence');
  if (
    b.synthetic &&
    [
      ...b.entities.map((e) => e.provenance),
      ...b.collectors.flatMap((c) => c.provenance),
    ].some((p) => p.source !== 'synthetic')
  )
    issue('Synthetic bundles must label their provenance');
});
export type DiscoveryBundle = z.infer<typeof DiscoveryBundleSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type CollectorExecution = z.infer<typeof CollectorExecutionSchema>;
export type BundleValidation =
  | { success: true; data: DiscoveryBundle }
  | {
      success: false;
      code: 'incompatible_version' | 'invalid_bundle';
      message: string;
    };
/** Only 1.0.0 is registered today. Future compatible schemas need explicit readers. Never echo input. */
export function validateBundle(input: unknown): BundleValidation {
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion !== SCHEMA_VERSION
  )
    return {
      success: false,
      code: 'incompatible_version',
      message: 'Unsupported schema version. This reader supports 1.0.0.',
    };
  const result = DiscoveryBundleSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        code: 'invalid_bundle',
        message:
          'Invalid bundle: required fields, relationships, or coverage are inconsistent.',
      };
}
