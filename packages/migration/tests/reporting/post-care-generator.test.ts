import assert from 'node:assert/strict';
import test from 'node:test';
import type { DiscoveryBundle, MigrationPlan } from '@ghec/contracts';
import {
  extractSecretDomain,
  resolveTargetSettingsLinks,
  sanitizePostCareCsvCell,
  generatePostCareDeliverables,
} from '../../src/reporting/post-care-generator.js';

test('extractSecretDomain identifies actions, dependabot, and codespaces secret domains', () => {
  assert.equal(
    extractSecretDomain({
      operationId: 'org-secret:dependabot:NPM_TOKEN',
      resourceType: 'org-secret',
      resourceName: 'NPM_TOKEN',
    }),
    'dependabot',
  );

  assert.equal(
    extractSecretDomain({
      operationId: 'repo-secret:codespaces:DEV_KEY',
      resourceType: 'repo-secret',
      resourceName: 'DEV_KEY',
    }),
    'codespaces',
  );

  assert.equal(
    extractSecretDomain({
      operationId: 'org-secret:create:SONAR_TOKEN',
      resourceType: 'org-secret',
      resourceName: 'SONAR_TOKEN',
      notes:
        'Create sealed empty placeholder for actions organization secret SONAR_TOKEN',
    }),
    'actions',
  );
});

test('resolveTargetSettingsLinks resolves direct GitHub Settings URLs and gh CLI commands across all modules', () => {
  // 1. Org Dependabot secret
  const orgDepSecret = resolveTargetSettingsLinks({
    moduleId: 'org-secrets',
    targetOrg: 'acme-emu',
    operationId: 'org-secret:dependabot:NPM_TOKEN',
    resourceType: 'org-secret',
    resourceName: 'dependabot:NPM_TOKEN',
  });
  assert.equal(
    orgDepSecret.settingsUrl,
    'https://github.com/organizations/acme-emu/settings/secrets/dependabot/NPM_TOKEN',
  );
  assert.equal(
    orgDepSecret.secondaryUrl,
    'https://github.com/organizations/acme-emu/settings/secrets/dependabot',
  );
  assert.equal(orgDepSecret.subDomain, 'dependabot');
  assert.equal(orgDepSecret.cleanResourceName, 'NPM_TOKEN');
  assert.ok(
    orgDepSecret.cliCommand?.includes(
      'gh secret set NPM_TOKEN --org acme-emu --app dependabot',
    ),
  );

  // 2. Repo Codespaces secret
  const repoCsSecret = resolveTargetSettingsLinks({
    moduleId: 'repo-secrets',
    targetOrg: 'acme-emu',
    targetRepo: 'payments-api',
    operationId: 'repo-secret:codespaces:CODESPACE_PAT',
    resourceType: 'repo-secret',
    resourceName: 'codespaces:CODESPACE_PAT',
  });
  assert.equal(
    repoCsSecret.settingsUrl,
    'https://github.com/acme-emu/payments-api/settings/secrets/codespaces/CODESPACE_PAT',
  );
  assert.equal(
    repoCsSecret.secondaryUrl,
    'https://github.com/acme-emu/payments-api/settings/secrets/codespaces',
  );
  assert.equal(repoCsSecret.subDomain, 'codespaces');
  assert.ok(
    repoCsSecret.cliCommand?.includes(
      'gh secret set CODESPACE_PAT --repo acme-emu/payments-api --app codespaces',
    ),
  );

  // 3. Environment secret
  const envSecret = resolveTargetSettingsLinks({
    moduleId: 'environments',
    targetOrg: 'acme-emu',
    targetRepo: 'payments-api',
    operationId: 'env-secret:production:AWS_SECRET_KEY',
    resourceType: 'environment-secret',
    resourceName: 'production/AWS_SECRET_KEY',
  });
  assert.equal(
    envSecret.settingsUrl,
    'https://github.com/acme-emu/payments-api/settings/environments',
  );
  assert.equal(envSecret.subDomain, 'environment');
  assert.equal(envSecret.environmentName, 'production');
  assert.equal(envSecret.cleanResourceName, 'AWS_SECRET_KEY');
  assert.ok(
    envSecret.cliCommand?.includes(
      'gh secret set AWS_SECRET_KEY --repo acme-emu/payments-api --env "production"',
    ),
  );

  // 4. GitHub App with pre-filled recreation URL embedded in notes
  const appLink = resolveTargetSettingsLinks({
    moduleId: 'apps-inventory',
    targetOrg: 'acme-emu',
    operationId: 'app-install:release-bot',
    resourceType: 'github-app-installation',
    resourceName: 'release-bot',
    notes:
      'Manual re-authorization required. Recreate URL: https://github.com/organizations/acme-emu/settings/apps/new?name=release-bot-acme-emu&contents=write | Install URL: https://github.com/organizations/acme-emu/settings/installations',
  });
  assert.equal(
    appLink.settingsUrl,
    'https://github.com/organizations/acme-emu/settings/installations',
  );
  assert.equal(
    appLink.secondaryUrl,
    'https://github.com/organizations/acme-emu/settings/apps/new?name=release-bot-acme-emu&contents=write',
  );

  // 5. Repo Webhook
  const hookLink = resolveTargetSettingsLinks({
    moduleId: 'webhooks',
    targetOrg: 'acme-emu',
    targetRepo: 'payments-api',
    operationId: 'webhook:create:https://ci.example.com/hook',
    resourceType: 'webhook',
    resourceName: 'https://ci.example.com/hook',
  });
  assert.equal(
    hookLink.settingsUrl,
    'https://github.com/acme-emu/payments-api/settings/hooks',
  );

  // 6. Self-hosted runner
  const runnerLink = resolveTargetSettingsLinks({
    moduleId: 'actions-runners',
    targetOrg: 'acme-emu',
    operationId: 'runner:advisory:linux-gpu-01',
    resourceType: 'action-runner',
    resourceName: 'linux-gpu-01',
  });
  assert.equal(
    runnerLink.settingsUrl,
    'https://github.com/organizations/acme-emu/settings/actions/runners/new',
  );
});

test('sanitizePostCareCsvCell prevents formula injection and redacts tokens', () => {
  assert.equal(sanitizePostCareCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(sanitizePostCareCsvCell('+cmd|/c calc'), "'+cmd|/c calc");
  assert.equal(sanitizePostCareCsvCell('-2+3'), "'-2+3");
  assert.equal(sanitizePostCareCsvCell('@import'), "'@import");
  const redacted = sanitizePostCareCsvCell(
    'https://x-access-token:ghp_1234567890abcdefghijklmnopqrstuvwx@github.com/org/repo',
  );
  assert.ok(!redacted.includes('ghp_1234567890abcdefghijklmnopqrstuvwx'));
  assert.equal(
    sanitizePostCareCsvCell('Value with "quotes", commas, and\nnewlines'),
    '"Value with ""quotes"", commas, and newlines"',
  );
});

test('generatePostCareDeliverables produces POST-CARE-CHECKLIST.md and CSV exports in discovery and dry-run modes', () => {
  // 1. Discovery mode using DiscoveryBundle entities
  const discoveryBundle = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-10-16T12:00:00Z',
    entities: [
      {
        kind: 'repository',
        id: 'repo:api-service',
        name: 'api-service',
      },
      {
        kind: 'configuration-metadata',
        id: 'secret:org:ORG_DEPLOY_TOKEN',
        name: 'ORG_DEPLOY_TOKEN',
        configurationKind: 'secret',
        level: 'organization',
        domain: 'actions',
        accessMode: 'write-only',
      },
      {
        kind: 'configuration-metadata',
        id: 'secret:org:ORG_DEP_TOKEN',
        name: 'ORG_DEP_TOKEN',
        configurationKind: 'secret',
        level: 'organization',
        domain: 'dependabot',
        accessMode: 'write-only',
      },
      {
        kind: 'configuration-metadata',
        id: 'secret:repo:DATABASE_URL',
        name: 'DATABASE_URL',
        configurationKind: 'secret',
        level: 'repository',
        repositoryId: 'repo:api-service',
        domain: 'actions',
        accessMode: 'write-only',
      },
      {
        kind: 'configuration-metadata',
        id: 'secret:repo:CS_TOKEN',
        name: 'CS_TOKEN',
        configurationKind: 'secret',
        level: 'repository',
        repositoryId: 'repo:api-service',
        domain: 'codespaces',
        accessMode: 'write-only',
      },
      {
        kind: 'configuration-metadata',
        id: 'secret:env:PROD_API_KEY',
        name: 'PROD_API_KEY',
        configurationKind: 'secret',
        level: 'environment',
        repositoryId: 'repo:api-service',
        environmentName: 'production',
        accessMode: 'write-only',
      },
      {
        kind: 'integration',
        id: 'app:datadog-ci',
        integrationKind: 'github_app',
        label: 'datadog-ci',
      },
      {
        kind: 'integration',
        id: 'hook:org:slack',
        integrationKind: 'webhook',
        label: 'https://hooks.slack.com/services/T00',
      },
      {
        kind: 'integration',
        id: 'hook:repo:jenkins',
        integrationKind: 'webhook',
        repositoryId: 'repo:api-service',
        label: 'https://jenkins.internal/gh',
      },
      {
        kind: 'action-runner',
        id: 'runner:prod-01',
        name: 'runner-prod-01',
        runnerType: 'self-hosted',
        operatingSystem: 'Linux',
        labels: ['self-hosted', 'linux'],
      },
    ],
  } as unknown as DiscoveryBundle;

  const discoveryPostCare = generatePostCareDeliverables({
    sourceOrg: 'source-org',
    targetOrg: 'target-emu',
    mode: 'discovery',
    generatedAt: '2026-10-16T12:00:00Z',
    discoveryBundle,
  });

  assert.equal(discoveryPostCare.items.length, 9);
  assert.equal(
    discoveryPostCare.items.filter((i) => i.category === 'secret').length,
    5,
  );
  assert.equal(
    discoveryPostCare.items.filter((i) => i.category === 'github-app').length,
    1,
  );
  assert.equal(
    discoveryPostCare.items.filter((i) => i.category === 'webhook').length,
    2,
  );
  assert.equal(
    discoveryPostCare.items.filter((i) => i.category === 'runner').length,
    1,
  );

  assert.ok(
    discoveryPostCare.checklistMarkdown.includes(
      'https://github.com/organizations/target-emu/settings/secrets/actions/ORG_DEPLOY_TOKEN',
    ),
  );
  assert.ok(
    discoveryPostCare.checklistMarkdown.includes(
      'https://github.com/organizations/target-emu/settings/secrets/dependabot/ORG_DEP_TOKEN',
    ),
  );
  assert.ok(
    discoveryPostCare.checklistMarkdown.includes(
      'https://github.com/target-emu/api-service/settings/secrets/codespaces/CS_TOKEN',
    ),
  );
  assert.ok(
    discoveryPostCare.checklistMarkdown.includes(
      'https://github.com/target-emu/api-service/settings/environments',
    ),
  );

  // Verify CSV exports match postCareItems count (+1 header line)
  const postCareCsvLines = (
    discoveryPostCare.csvFiles['exports/post-care-items.csv'] ?? ''
  )
    .trim()
    .split('\n');
  assert.equal(postCareCsvLines.length, discoveryPostCare.items.length + 1);

  const secretsCsvLines = (
    discoveryPostCare.csvFiles['exports/secrets-to-populate.csv'] ?? ''
  )
    .trim()
    .split('\n');
  assert.equal(secretsCsvLines.length, 5 + 1);

  // 2. Plan / Dry-Run mode
  const plan: MigrationPlan = {
    schemaVersion: '1.0.0',
    id: 'plan-001',
    createdAt: '2026-10-16T12:00:00Z',
    scopeName: 'wave-1',
    modules: [
      {
        moduleId: 'org-secrets',
        targetIdentifier: 'target-emu',
        scopeLevel: 'organization',
        operations: [
          {
            id: 'org-secret:create:NPM_AUTH_TOKEN',
            resourceType: 'org-secret',
            resourceName: 'dependabot:NPM_AUTH_TOKEN',
            operation: 'create',
            reason:
              'Create sealed empty placeholder for dependabot organization secret NPM_AUTH_TOKEN (visibility: all)',
            dependencies: [],
          },
        ],
        warnings: [],
      },
      {
        moduleId: 'apps-inventory',
        targetIdentifier: 'target-emu',
        scopeLevel: 'organization',
        operations: [
          {
            id: 'app-install:skip:org:target-emu:sonarcloud',
            resourceType: 'github-app-installation',
            resourceName: 'sonarcloud',
            operation: 'skip',
            reason:
              'GitHub App installation sonarcloud requires manual re-authorization. Recreate URL: https://github.com/organizations/target-emu/settings/apps/new?name=sonarcloud-target-emu | Install URL: https://github.com/organizations/target-emu/settings/installations',
            dependencies: [],
          },
        ],
        warnings: [],
      },
    ],
    executionOrder: ['org-secrets', 'apps-inventory'],
  };

  const dryRunPostCare = generatePostCareDeliverables({
    sourceOrg: 'source-org',
    targetOrg: 'target-emu',
    mode: 'dry-run',
    generatedAt: '2026-10-16T12:00:00Z',
    plan,
  });

  assert.equal(
    dryRunPostCare.items.filter((i) => i.category === 'secret').length,
    1,
  );
  assert.equal(
    dryRunPostCare.items.filter((i) => i.category === 'github-app').length,
    1,
  );
  assert.ok(
    dryRunPostCare.checklistMarkdown.includes(
      'https://github.com/organizations/target-emu/settings/apps/new?name=sonarcloud-target-emu',
    ),
  );
  assert.ok(
    (
      dryRunPostCare.csvFiles['exports/github-apps-reinstall.csv'] ?? ''
    ).includes(
      'https://github.com/organizations/target-emu/settings/apps/new?name=sonarcloud-target-emu',
    ),
  );
});
