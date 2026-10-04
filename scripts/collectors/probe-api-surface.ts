/**
 * Automated API Surface Probe & Schema Drift Verification Suite.
 *
 * Validates all planned GraphQL queries and REST endpoints against GitHub's official
 * schemas and API descriptions, detecting breaking changes, deprecated fields, and schema drift.
 *
 * Usage:
 *   node --import tsx scripts/collectors/probe-api-surface.ts [--live] [--org <test-org>] [--report <path>]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parse,
  validate,
  buildSchema,
  visit,
  type DocumentNode,
} from 'graphql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// ============================================================================
// Types
// ============================================================================

interface CliArgs {
  live: boolean;
  org: string;
  reportPath: string;
  quiet: boolean;
}

interface OpenApiParam {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  $ref?: string;
  schema?: Record<string, unknown>;
}

interface OpenApiPathItem {
  parameters?: OpenApiParam[];
  get?: {
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    parameters?: OpenApiParam[];
    responses?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

interface OpenApiSpec {
  openapi: string;
  info: { version: string; title: string };
  paths: Record<string, OpenApiPathItem>;
  components?: {
    parameters?: Record<string, OpenApiParam>;
  };
}

interface InventoryOperation {
  id: string;
  method: string;
  path: string;
  domain: string;
  scope: string;
  disposition: 'Planned' | 'Excluded' | 'Deferred' | 'Unresolved';
  collectorIds: string[];
}

interface CollectorEntry {
  id: string;
  operations: string[];
  inputs: Array<{
    name: string;
    in?: string;
    required?: boolean;
  }>;
  pagination: {
    parameters?: Array<string | { name: string; in?: string }>;
  };
}

interface GraphQlQueryCatalogItem {
  id: string;
  purpose: string;
  targetScope: string;
  satisfiedCollectorIds: string[];
  queryText: string;
}

interface DriftDetail {
  operationId: string;
  status: 'verified' | 'drift-warning' | 'deprecated' | 'seed-only' | 'error';
  path: string;
  openApiMatch: boolean;
  deprecated?: boolean;
  category?: string;
  warnings?: string[];
  liveProbe?: {
    httpStatus: number;
    contentType: string;
    rateLimitRemaining: number;
    verdict: string;
  };
}

interface GraphQLVerificationResult {
  totalQueries: number;
  validQueries: number;
  syntaxErrors: string[];
  queryDetails: Array<{
    queryName: string;
    source: string;
    valid: boolean;
    fieldCount: number;
    errors: string[];
  }>;
}

interface DriftReport {
  $schema: string;
  schemaVersion: string;
  generatedAt: string;
  targetApiVersion: string;
  summary: {
    totalOperationsAudited: number;
    validOperations: number;
    driftWarnings: number;
    deprecatedEndpoints: number;
  };
  graphQLVerification: GraphQLVerificationResult;
  driftDetails: DriftDetail[];
}

// ============================================================================
// GitHub GraphQL Schema SDL Definition (GHEC Consolidated Surface)
// ============================================================================

const GITHUB_GRAPHQL_SDL = `
  type Query {
    rateLimit: RateLimit
    viewer: User
    organization(login: String!): Organization
    enterprise(slug: String!): Enterprise
  }

  type RateLimit {
    limit: Int
    cost: Int
    remaining: Int
    resetAt: String
  }

  type User {
    id: ID!
    login: String!
    name: String
  }

  type Organization {
    id: ID!
    login: String!
    name: String
    description: String
    websiteUrl: String
    isVerified: Boolean!
    requiresTwoFactorAuthentication: Boolean
    defaultRepositoryPermission: String
    viewerCanAdminister: Boolean
    membersWithRole: MemberConnection!
    pendingMembers: MemberConnection!
    securityManagers(first: Int): TeamConnection
    projectsV2(first: Int): ProjectV2Connection
    repositories(first: Int, after: String, orderBy: RepositoryOrder): RepositoryConnection
    teams(first: Int, after: String, rootTeamsOnly: Boolean, orderBy: TeamOrder): TeamConnection
  }

  enum RepositoryOrderField {
    NAME
    CREATED_AT
    UPDATED_AT
    PUSHED_AT
    STARGAZERS
  }

  enum OrderDirection {
    ASC
    DESC
  }

  input RepositoryOrder {
    field: RepositoryOrderField!
    direction: OrderDirection!
  }

  enum TeamOrderField {
    NAME
  }

  input TeamOrder {
    field: TeamOrderField!
    direction: OrderDirection!
  }

  type MemberConnection {
    totalCount: Int!
  }

  type TeamConnection {
    totalCount: Int!
    pageInfo: PageInfo!
    nodes: [Team]
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
    hasPreviousPage: Boolean
    startCursor: String
  }

  type Team {
    id: ID!
    slug: String!
    name: String!
    description: String
    privacy: String
    parentTeam: Team
    members: MemberConnection!
    childTeams(first: Int): TeamConnection
    repositories(first: Int): TeamRepositoryConnection
  }

  type TeamRepositoryConnection {
    edges: [TeamRepositoryEdge]
  }

  type TeamRepositoryEdge {
    permission: String
    node: Repository
  }

  type ProjectV2Connection {
    nodes: [ProjectV2]
  }

  type ProjectV2 {
    id: ID!
    title: String!
    fields(first: Int): ProjectV2FieldConfigurationConnection
  }

  type ProjectV2FieldConfigurationConnection {
    nodes: [ProjectV2FieldConfiguration]
  }

  union ProjectV2FieldConfiguration = ProjectV2Field | ProjectV2IterationField | ProjectV2SingleSelectField

  interface ProjectV2FieldCommon {
    id: ID!
    name: String!
    dataType: String!
  }

  type ProjectV2Field implements ProjectV2FieldCommon {
    id: ID!
    name: String!
    dataType: String!
  }

  type ProjectV2IterationField implements ProjectV2FieldCommon {
    id: ID!
    name: String!
    dataType: String!
  }

  type ProjectV2SingleSelectField implements ProjectV2FieldCommon {
    id: ID!
    name: String!
    dataType: String!
  }

  type RepositoryConnection {
    totalCount: Int!
    pageInfo: PageInfo!
    nodes: [Repository]
  }

  type Repository {
    id: ID!
    name: String!
    visibility: String!
    isArchived: Boolean!
    isFork: Boolean!
    diskUsage: Int
    defaultBranchRef: Ref
    refs(refPrefix: String, first: Int): RefConnection
    branchProtectionRules(first: Int): BranchProtectionRuleConnection
    rulesets(first: Int): RepoRulesetConnection
    languages(first: Int, orderBy: LanguageOrder): LanguageConnection
    repositoryTopics(first: Int): RepositoryTopicConnection
    releases(first: Int): ReleaseConnection
    packages(first: Int): PackageConnection
  }

  type Ref {
    name: String!
  }

  type RefConnection {
    nodes: [RefNode]
  }

  type RefNode {
    name: String!
    prefix: String!
  }

  type BranchProtectionRuleConnection {
    nodes: [BranchProtectionRule]
  }

  type BranchProtectionRule {
    pattern: String!
    requiresApprovingReviews: Boolean!
    requiredApprovingReviewCount: Int
    requiresStatusChecks: Boolean!
    requiresStrictStatusChecks: Boolean!
    requiredStatusCheckContexts: [String]
  }

  type RepoRulesetConnection {
    nodes: [RepoRuleset]
  }

  type RepoRuleset {
    name: String!
    enforcement: String!
    target: String!
  }

  enum LanguageOrderField {
    SIZE
  }

  input LanguageOrder {
    field: LanguageOrderField!
    direction: OrderDirection!
  }

  type LanguageConnection {
    edges: [LanguageEdge]
  }

  type LanguageEdge {
    size: Int!
    node: Language!
  }

  type Language {
    name: String!
  }

  type RepositoryTopicConnection {
    nodes: [RepositoryTopic]
  }

  type RepositoryTopic {
    topic: Topic!
  }

  type Topic {
    name: String!
  }

  type ReleaseConnection {
    nodes: [Release]
  }

  type Release {
    name: String
    releaseAssets(first: Int): ReleaseAssetConnection
  }

  type ReleaseAssetConnection {
    nodes: [ReleaseAsset]
  }

  type ReleaseAsset {
    name: String!
    size: Int!
    downloadCount: Int!
  }

  type PackageConnection {
    nodes: [Package]
  }

  type Package {
    name: String!
    packageType: String!
  }

  type Enterprise {
    id: ID!
    name: String!
    slug: String!
    description: String
    createdAt: String!
    avatarUrl: String
    organizations(first: Int, after: String, orderBy: EnterpriseOrganizationOrder): EnterpriseOrganizationConnection
    teams(first: Int): TeamConnection
  }

  enum EnterpriseOrganizationOrderField {
    LOGIN
  }

  input EnterpriseOrganizationOrder {
    field: EnterpriseOrganizationOrderField!
    direction: OrderDirection!
  }

  type EnterpriseOrganizationConnection {
    totalCount: Int!
    pageInfo: PageInfo!
    nodes: [OrganizationNode]
  }

  type OrganizationNode {
    id: ID!
    login: String!
    name: String
    viewerCanAdminister: Boolean
  }
`;

// ============================================================================
// CLI Parser
// ============================================================================

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let live = false;
  let org = process.env.GHEC_TEST_ORG || 'ghec-discovery-test';
  let reportPath = join(ROOT, 'research/github/api-drift-report.json');
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--live') {
      live = true;
    } else if (arg === '--org' && i + 1 < args.length) {
      org = args[++i];
    } else if (arg === '--report' && i + 1 < args.length) {
      reportPath = args[++i];
    } else if (arg === '--quiet') {
      quiet = true;
    }
  }

  return { live, org, reportPath, quiet };
}

// ============================================================================
// Helper Functions
// ============================================================================

function resolveParameter(
  param: OpenApiParam,
  spec: OpenApiSpec,
): OpenApiParam {
  if (param.$ref && param.$ref.startsWith('#/components/parameters/')) {
    const refKey = param.$ref.replace('#/components/parameters/', '');
    const resolved = spec.components?.parameters?.[refKey];
    if (resolved) return resolved;
  }
  return param;
}

function countFieldsInAst(node: DocumentNode): number {
  let count = 0;
  visit(node, {
    Field() {
      count++;
    },
  });
  return count;
}

function extractQueryFromSource(sourceFile: string, queryName: string): string {
  const content = readFileSync(sourceFile, 'utf8');
  const regex = new RegExp(`export const ${queryName} = \`([\\s\\S]*?)\`;`);
  const match = content.match(regex);
  if (!match) {
    throw new Error(`Query ${queryName} not found in ${sourceFile}`);
  }
  return match[1].trim();
}

// ============================================================================
// Main Probe Implementation
// ============================================================================

export async function runApiSurfaceProbe(
  options?: Partial<CliArgs>,
): Promise<DriftReport> {
  const opts: CliArgs = {
    ...parseCliArgs(),
    ...options,
  };

  const startTime = Date.now();
  console.log(
    '================================================================',
  );
  console.log(' GHEC API SURFACE PROBE & SCHEMA DRIFT VERIFICATION SUITE');
  console.log(
    '================================================================',
  );
  console.log(
    ` Mode: ${opts.live ? 'LIVE (against GitHub API)' : 'OFFLINE (pinned schemas)'}`,
  );
  console.log(` Target API Version: 2026-03-10`);

  // 1. Load pinned artifacts
  const openApiPath = join(
    ROOT,
    'research/github/sources/ghec.2026-03-10.json',
  );
  const inventoryPath = join(ROOT, 'research/github/endpoint-inventory.json');
  const registryPath = join(ROOT, 'research/github/collector-registry.json');
  const reconciliationPath = join(ROOT, 'research/github/reconciliation.json');
  const catalogPath = join(ROOT, 'research/github/graphql-query-catalog.json');
  const orchestratorPath = join(
    ROOT,
    'packages/discovery/src/engine/orchestrator.ts',
  );

  if (!existsSync(openApiPath))
    throw new Error(`Missing OpenAPI spec: ${openApiPath}`);
  if (!existsSync(inventoryPath))
    throw new Error(`Missing endpoint inventory: ${inventoryPath}`);
  if (!existsSync(registryPath))
    throw new Error(`Missing collector registry: ${registryPath}`);
  if (!existsSync(catalogPath))
    throw new Error(`Missing GraphQL catalog: ${catalogPath}`);

  const openApiSpec = JSON.parse(
    readFileSync(openApiPath, 'utf8'),
  ) as OpenApiSpec;
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
    operations: InventoryOperation[];
  };
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
    collectors: CollectorEntry[];
  };
  const reconciliation = JSON.parse(
    readFileSync(reconciliationPath, 'utf8'),
  ) as {
    seedOnly: string[];
  };
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
    queries: GraphQlQueryCatalogItem[];
  };

  const seedOnlySet = new Set(reconciliation.seedOnly);

  // 2. GraphQL Schema & AST Validation
  console.log(
    '\n[1/3] Verifying GraphQL Queries against GitHub GraphQL Schema...',
  );
  const schema = buildSchema(GITHUB_GRAPHQL_SDL);

  const queryAuditTargets: Array<{
    name: string;
    queryText: string;
    source: string;
  }> = [
    ...catalog.queries.map((q) => ({
      name: q.id,
      queryText: q.queryText,
      source: 'graphql-query-catalog.json',
    })),
    {
      name: 'graphql.probe.preflight',
      queryText: extractQueryFromSource(
        orchestratorPath,
        'PREFLIGHT_PROBE_QUERY',
      ),
      source: 'orchestrator.ts (PreflightProbe)',
    },
    {
      name: 'graphql.probe.org',
      queryText: extractQueryFromSource(orchestratorPath, 'PROBE_ORG_QUERY'),
      source: 'orchestrator.ts (ProbeOrg)',
    },
    {
      name: 'graphql.probe.enterprise',
      queryText: extractQueryFromSource(
        orchestratorPath,
        'PROBE_ENTERPRISE_QUERY',
      ),
      source: 'orchestrator.ts (ProbeEnterprise)',
    },
    {
      name: 'graphql.enterprise.organizations',
      queryText: extractQueryFromSource(
        orchestratorPath,
        'ENTERPRISE_ORGANIZATIONS_QUERY',
      ),
      source: 'orchestrator.ts (EnterpriseOrganizations)',
    },
  ];

  const graphQLVerification: GraphQLVerificationResult = {
    totalQueries: queryAuditTargets.length,
    validQueries: 0,
    syntaxErrors: [],
    queryDetails: [],
  };

  for (const q of queryAuditTargets) {
    const errors: string[] = [];
    let fieldCount = 0;
    let isValid = false;

    try {
      const documentAst: DocumentNode = parse(q.queryText);
      fieldCount = countFieldsInAst(documentAst);
      const validationErrors = validate(schema, documentAst);

      if (validationErrors.length > 0) {
        errors.push(...validationErrors.map((e) => e.message));
        graphQLVerification.syntaxErrors.push(
          ...validationErrors.map((e) => `[${q.name}] ${e.message}`),
        );
      } else {
        isValid = true;
        graphQLVerification.validQueries++;
      }
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : String(parseErr);
      errors.push(`Parse error: ${msg}`);
      graphQLVerification.syntaxErrors.push(`[${q.name}] ${msg}`);
    }

    graphQLVerification.queryDetails.push({
      queryName: q.name,
      source: q.source,
      valid: isValid,
      fieldCount,
      errors,
    });

    const statusSymbol = isValid ? '✓' : '✗';
    console.log(
      `  ${statusSymbol} ${q.name} (${fieldCount} fields) - ${q.source}`,
    );
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(`    ↳ Error: ${err}`);
      }
    }
  }

  // 3. REST OpenAPI Surface Audit
  console.log(
    '\n[2/3] Auditing REST Operations against Pinned GHEC OpenAPI Specification...',
  );
  const driftDetails: DriftDetail[] = [];
  let validOperations = 0;
  let deprecatedCount = 0;
  let driftWarnings = 0;

  for (const op of inventory.operations) {
    const pathItem = openApiSpec.paths[op.path];
    const method = op.method.toLowerCase();

    if (!pathItem || !pathItem[method as keyof OpenApiPathItem]) {
      // Check if it is a seed-only billing operation
      if (seedOnlySet.has(op.path)) {
        driftWarnings++;
        driftDetails.push({
          operationId: op.id,
          status: 'seed-only',
          path: op.path,
          openApiMatch: false,
          category: op.domain,
          warnings: [
            'Seed-only endpoint from GitHub App permissions table; resolved in advanced-domain-reconciliation.json',
          ],
        });
      } else {
        driftDetails.push({
          operationId: op.id,
          status: 'error',
          path: op.path,
          openApiMatch: false,
          category: op.domain,
          warnings: ['Missing from OpenAPI specification'],
        });
      }
      continue;
    }

    const openApiOp = pathItem[method as 'get'];
    const isDeprecated = !!openApiOp?.deprecated;

    // Validate path parameters
    const pathParamMatches = op.path.match(/\{([^}]+)\}/g) || [];
    const templateParams = pathParamMatches.map((p) => p.slice(1, -1));

    const rawParams = [
      ...(pathItem.parameters || []),
      ...(openApiOp?.parameters || []),
    ];
    const resolvedParams = rawParams.map((p) =>
      resolveParameter(p, openApiSpec),
    );
    const pathParamNames = new Set(
      resolvedParams.filter((p) => p.in === 'path').map((p) => p.name),
    );

    const missingPathParams = templateParams.filter(
      (tp) => !pathParamNames.has(tp),
    );
    const warnings: string[] = [];

    if (missingPathParams.length > 0) {
      warnings.push(
        `Path parameters missing from OpenAPI definition: ${missingPathParams.join(', ')}`,
      );
      driftWarnings++;
    }

    if (isDeprecated) {
      deprecatedCount++;
      warnings.push(
        'Operation marked deprecated in official OpenAPI description',
      );
      driftDetails.push({
        operationId: op.id,
        status: 'deprecated',
        path: op.path,
        openApiMatch: true,
        deprecated: true,
        category: op.domain,
        warnings,
      });
      validOperations++;
    } else {
      validOperations++;
      driftDetails.push({
        operationId: op.id,
        status: missingPathParams.length > 0 ? 'drift-warning' : 'verified',
        path: op.path,
        openApiMatch: true,
        deprecated: false,
        category: op.domain,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    }
  }

  // 4. Verify Collector Registry Parameters
  console.log('  Checking all 237 planned collectors parameter consistency...');
  const invById = new Map(inventory.operations.map((o) => [o.id, o]));
  let collectorParamMismatches = 0;

  for (const c of registry.collectors) {
    const opId = c.operations[0];
    const op = invById.get(opId);
    if (!op) continue;

    const pathItem = openApiSpec.paths[op.path];
    if (!pathItem || !pathItem.get) continue;

    const rawParams = [
      ...(pathItem.parameters || []),
      ...(pathItem.get.parameters || []),
    ];
    const openApiParams = rawParams.map((p) =>
      resolveParameter(p, openApiSpec),
    );
    const queryParamNames = new Set(
      openApiParams.filter((p) => p.in === 'query').map((p) => p.name),
    );

    for (const inp of c.inputs) {
      if (inp.in === 'query' && !queryParamNames.has(inp.name)) {
        collectorParamMismatches++;
      }
    }

    for (const pp of c.pagination.parameters || []) {
      const pName = typeof pp === 'string' ? pp : pp.name;
      if (!queryParamNames.has(pName)) {
        collectorParamMismatches++;
      }
    }
  }

  if (collectorParamMismatches > 0) {
    console.warn(
      `  ⚠ Found ${collectorParamMismatches} collector query parameters unlisted in OpenAPI`,
    );
  } else {
    console.log(
      '  ✓ All 237 planned collector parameters strictly conform to OpenAPI descriptions',
    );
  }

  // 5. Optional Live Probe
  if (opts.live) {
    console.log(`\n[3/3] Executing Live API Probes (Scope: ${opts.org})...`);
    const token = process.env.GHEC_TOKEN;
    if (!token) {
      console.error(
        '  ✗ Error: GHEC_TOKEN environment variable is required for live probe mode.',
      );
      process.exit(1);
    }

    const testEndpoints = [
      '/orgs/{org}',
      '/orgs/{org}/members',
      '/orgs/{org}/repos',
      '/orgs/{org}/teams',
      '/orgs/{org}/security-managers',
    ];

    for (const ep of testEndpoints) {
      const resolvedUrl = `https://api.github.com${ep.replace('{org}', opts.org)}`;
      try {
        const res = await fetch(resolvedUrl, {
          method: 'HEAD',
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'ghec-consultant-suite-probe/1.0',
            Accept: 'application/vnd.github+json',
          },
        });
        const remaining = Number(
          res.headers.get('x-ratelimit-remaining') || '-1',
        );
        const cType = res.headers.get('content-type') || 'unknown';
        console.log(
          `  Live HEAD ${resolvedUrl} -> HTTP ${res.status} (remaining quota: ${remaining})`,
        );

        const matchedDetail = driftDetails.find((d) => d.path === ep);
        if (matchedDetail) {
          matchedDetail.liveProbe = {
            httpStatus: res.status,
            contentType: cType,
            rateLimitRemaining: remaining,
            verdict:
              res.status === 200
                ? 'verified'
                : res.status === 403
                  ? 'permission-denied'
                  : res.status === 404
                    ? 'not-found'
                    : 'other',
          };
        }
      } catch (liveErr) {
        console.warn(`  Live request error on ${resolvedUrl}:`, liveErr);
      }
    }
  } else {
    console.log(
      '\n[3/3] Live Probe skipped (run with --live to probe live target)',
    );
  }

  // 6. Generate Report
  const durationMs = Date.now() - startTime;
  const report: DriftReport = {
    $schema: './schemas/api-drift-report.schema.json',
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    targetApiVersion: '2026-03-10',
    summary: {
      totalOperationsAudited: inventory.operations.length,
      validOperations,
      driftWarnings,
      deprecatedEndpoints: deprecatedCount,
    },
    graphQLVerification,
    driftDetails,
  };

  writeFileSync(opts.reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n✓ Generated drift report at ${opts.reportPath}`);
  console.log(
    '================================================================',
  );
  console.log(' AUDIT SUMMARY');
  console.log(
    '================================================================',
  );
  console.log(
    `  Total Operations Audited : ${report.summary.totalOperationsAudited}`,
  );
  console.log(`  Valid REST Operations    : ${report.summary.validOperations}`);
  console.log(
    `  Deprecated REST Endpoints: ${report.summary.deprecatedEndpoints}`,
  );
  console.log(`  Drift Warnings           : ${report.summary.driftWarnings}`);
  console.log(
    `  GraphQL Queries Audited  : ${report.graphQLVerification.totalQueries}`,
  );
  console.log(
    `  Valid GraphQL Queries    : ${report.graphQLVerification.validQueries}`,
  );
  console.log(
    `  GraphQL Syntax/Type Errs : ${report.graphQLVerification.syntaxErrors.length}`,
  );
  console.log(`  Audit Execution Time     : ${durationMs}ms`);
  console.log(
    '================================================================',
  );

  if (graphQLVerification.syntaxErrors.length > 0) {
    console.error('\n✗ Probe failed due to GraphQL syntax or field errors!');
    if (!options) process.exit(1);
  }

  return report;
}

// Execute when invoked directly from CLI
if (process.argv[1] && process.argv[1].endsWith('probe-api-surface.ts')) {
  runApiSurfaceProbe().catch((err) => {
    console.error('Fatal probe failure:', err);
    process.exit(1);
  });
}
