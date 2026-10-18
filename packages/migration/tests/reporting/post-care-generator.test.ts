import assert from 'node:assert/strict';
import test from 'node:test';
import type { DiscoveryBundle, MigrationPlan } from '@ghec/contracts';
import {
  extractSecretDomain,
  resolveTargetSettingsLinks,
  sanitizePostCareCsvCell,
  generatePostCareDeliverables,
} from '../../src/reporting/post-care-generator.js';

test('extractSecretDomain identifies actions, dependabot, codespaces, and agents secret domains', () => {
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
      operationId: 'repo-secrets:demo:agents:SUPER_AGENT_SECRET1',
      resourceType: 'repo-secret',
      resourceName: 'SUPER_AGENT_SECRET1',
    }),
    'agents',
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

  // 2b. Org & Repo Agents secret & variable
  const orgAgentSecret = resolveTargetSettingsLinks({
    moduleId: 'org-secrets',
    targetOrg: 'acme-emu',
    operationId: 'org-secrets:acme-emu:agents:SUPER_AGENT_ORG_SECRET2212',
    resourceType: 'organization-secret',
    resourceName: 'agents:SUPER_AGENT_ORG_SECRET2212',
  });
  assert.equal(
    orgAgentSecret.settingsUrl,
    'https://github.com/organizations/acme-emu/settings/secrets/agents/SUPER_AGENT_ORG_SECRET2212',
  );
  assert.equal(orgAgentSecret.subDomain, 'agents');
  assert.equal(orgAgentSecret.cleanResourceName, 'SUPER_AGENT_ORG_SECRET2212');

  const repoAgentVar = resolveTargetSettingsLinks({
    moduleId: 'repo-variables',
    targetOrg: 'acme-emu',
    targetRepo: 'demo',
    operationId: 'repo-variables:demo:agents:SUPER_AGENT_VARIBLE_1',
    resourceType: 'repo-variable',
    resourceName: 'agents:SUPER_AGENT_VARIBLE_1',
  });
  assert.equal(
    repoAgentVar.settingsUrl,
    'https://github.com/acme-emu/demo/settings/variables/agents',
  );
  assert.equal(repoAgentVar.subDomain, 'agents-variable');
  assert.equal(repoAgentVar.cleanResourceName, 'SUPER_AGENT_VARIBLE_1');

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

test('post-care CSV headers start with resource_type,resource_name,action_required and checklist includes cutover, billing, IdP, and Marketplace/Custom Recreate Link columns', () => {
  const plan: MigrationPlan = {
    schemaVersion: '1.0.0',
    id: 'plan-enhancements',
    createdAt: '2026-10-17T12:00:00Z',
    scopeName: 'wave-enhancements',
    modules: [
      {
        moduleId: 'apps-inventory',
        targetIdentifier: 'target-emu',
        scopeLevel: 'organization',
        operations: [
          {
            id: 'op-advisory-app-custom-bot',
            resourceType: 'github_app_installation',
            resourceName: 'custom-bot',
            operation: 'warn',
            reason:
              'GitHub Apps cannot be installed programmatically via API. "custom-bot" (ID: 99) is a private custom app and must be recreated on target-emu as "custom-bot-target-emu" (Selected repositories: api-core, web-ui). Recreate URL: https://github.com/organizations/target-emu/settings/apps/new?name=custom-bot-target-emu',
            dependencies: [],
          },
          {
            id: 'op-advisory-app-hackmd-hub',
            resourceType: 'github_app_installation',
            resourceName: 'hackmd-hub',
            operation: 'warn',
            reason:
              'GitHub Apps cannot be installed programmatically via API. An organization administrator must authorize and install "hackmd-hub" (ID: 859894) on target-emu.',
            dependencies: [],
          },
          {
            id: 'op-advisory-app-org-public-bot',
            resourceType: 'github_app_installation',
            resourceName: 'org-public-bot',
            operation: 'warn',
            reason:
              'GitHub Apps cannot be installed programmatically via API. "org-public-bot" (ID: 100) is a public organization-owned app; install the existing app on target-emu or recreate it as "org-public-bot-target-emu". Install URL: https://github.com/apps/org-public-bot/installations/new | Recreate URL: https://github.com/organizations/target-emu/settings/apps/new?name=org-public-bot-target-emu',
            dependencies: [],
          },
        ],
        warnings: [],
      },
      {
        moduleId: 'actions-runners',
        targetIdentifier: 'target-emu',
        scopeLevel: 'organization',
        operations: [
          {
            id: 'op-create-hosted-runner-ubuntu-16core',
            resourceType: 'hosted-runner',
            resourceName: 'ubuntu-16core',
            operation: 'create',
            reason:
              'Create larger GitHub-hosted runner "ubuntu-16core" (size: 16-core, image: ubuntu-24.04) on target-emu; verify Actions spending limits are configured so runner machines can spin up.',
            dependencies: [],
          },
        ],
        warnings: [],
      },
      {
        moduleId: 'teams',
        targetIdentifier: 'target-emu',
        scopeLevel: 'organization',
        operations: [
          {
            id: 'op-create-team-plain',
            resourceType: 'team',
            resourceName: 'plain-team',
            operation: 'create',
            reason: 'Team does not exist on target organization',
            dependencies: [],
          },
          {
            id: 'op-bind-team-idp-secops',
            resourceType: 'team-idp-group',
            resourceName: 'secops:Okta-SecOps',
            operation: 'update',
            reason:
              'Auto-binding team "secops" to IdP group(s): Okta-SecOps (ID: 42)',
            dependencies: [],
          },
        ],
        warnings: [],
      },
      {
        moduleId: 'deploy-keys',
        targetIdentifier: 'target-emu/demo',
        scopeLevel: 'repository',
        operations: [
          {
            id: 'deploy-key:skip:demo:Demogxp-test-deploy',
            resourceType: 'deploy-key',
            resourceName: 'Demogxp-test-deploy',
            operation: 'skip',
            reason:
              'SSH deploy key "Demogxp-test-deploy" is locked to source repository by global SSH key uniqueness',
            dependencies: [],
          },
        ],
        warnings: [],
      },
      {
        moduleId: 'webhooks',
        targetIdentifier: 'target-emu/demo',
        scopeLevel: 'repository',
        operations: [
          {
            // Placed first in input to verify that sorting moves active-no-secret (low priority) AFTER inactive-webhook (high priority)
            id: 'webhook:noop:https://httpbin.org/post',
            resourceType: 'webhook',
            resourceName: 'https://httpbin.org/post',
            operation: 'noop',
            reason:
              'Webhook `https://httpbin.org/post` configuration matches target (active; no signing secret configured on source)',
            sourceState: {
              url: 'https://httpbin.org/post',
              active: true,
              secretConfigured: false,
            },
            dependencies: [],
          },
          {
            id: 'webhook:create:https://ci.example.com/hook',
            resourceType: 'webhook',
            resourceName: 'https://ci.example.com/hook',
            operation: 'create',
            reason:
              'Create repository webhook (created INACTIVE because source had an HMAC secret configured)',
            sourceState: {
              url: 'https://ci.example.com/hook',
              active: true,
              secretConfigured: true,
            },
            dependencies: [],
          },
        ],
        warnings: [],
      },
    ],
    executionOrder: [
      'apps-inventory',
      'actions-runners',
      'teams',
      'deploy-keys',
      'webhooks',
    ],
  };

  const deliverables = generatePostCareDeliverables({
    sourceOrg: 'source-org',
    targetOrg: 'target-emu',
    mode: 'dry-run',
    generatedAt: '2026-10-17T12:00:00Z',
    plan,
  });

  // 1. Verify CSV column order starts with resource_type,resource_name,action_required and ends with item_id
  for (const [csvPath, csvContent] of Object.entries(deliverables.csvFiles)) {
    const headerLine = csvContent.split('\n')[0];
    if (csvPath.endsWith('migration-operations-full.csv')) {
      assert.ok(headerLine?.startsWith('resource_type,resource_name,'));
    } else {
      assert.equal(
        headerLine,
        'resource_type,resource_name,action_required,priority,category,migration_status,scope_level,target_org,target_repo,environment_name,module_id,sub_domain,settings_url,secondary_url,cli_command,notes,mode,item_id',
      );
    }
  }

  // Verify all hierarchical CSV files exist at top-level and in subfolders
  const expectedCsvPaths = [
    'exports/post-care-items.csv',
    'exports/secrets-to-populate.csv',
    'exports/github-apps-reinstall.csv',
    'exports/webhooks-reconfiguration.csv',
    'exports/runners-registration.csv',
    'exports/identity-and-access.csv',
    'exports/identity-and-access/teams-idp-sync.csv',
    'exports/identity-and-access/mannequins-reclaim.csv',
    'exports/identity-and-access/collaborators-review.csv',
    'exports/identity-and-access/deploy-keys-cutover.csv',
    'exports/governance-and-remediation.csv',
    'exports/governance-and-remediation/policies-and-rulesets.csv',
    'exports/governance-and-remediation/packages-migration.csv',
    'exports/governance-and-remediation/security-settings.csv',
    'exports/governance-and-remediation/failed-and-skipped-items.csv',
    'exports/migration-operations-full.csv',
  ];
  for (const expectedPath of expectedCsvPaths) {
    assert.ok(
      expectedPath in deliverables.csvFiles,
      `Missing expected CSV export: ${expectedPath}`,
    );
  }

  // Verify identity-and-access.csv has 2 rows (secops team + deploy key) while focused subfolders each have 1 row
  assert.equal(
    deliverables.csvFiles['exports/identity-and-access.csv']!.trim().split('\n')
      .length,
    2 + 1,
  );
  assert.equal(
    deliverables.csvFiles[
      'exports/identity-and-access/teams-idp-sync.csv'
    ]!.trim().split('\n').length,
    1 + 1,
  );
  assert.equal(
    deliverables.csvFiles[
      'exports/identity-and-access/deploy-keys-cutover.csv'
    ]!.trim().split('\n').length,
    1 + 1,
  );

  const md = deliverables.checklistMarkdown;
  assert.doesNotMatch(md, /DEC-\d+/i);

  // 2. Verify GitHub Apps table offers only the appropriate link based on classification
  assert.ok(
    md.includes(
      '| App Slug | Classification | Action Required | Marketplace Link | Custom Recreate Link |',
    ),
  );
  // custom_private -> only Custom Recreate Link
  assert.ok(
    md.includes(
      '| — | [Recreate Custom App (Pre-Filled) ↗](https://github.com/organizations/target-emu/settings/apps/new?name=custom-bot-target-emu) |',
    ),
  );
  // third_party -> only Marketplace Link
  assert.ok(
    md.includes(
      '| [Install App on target-emu ↗](https://github.com/apps/hackmd-hub/installations/new) | — |',
    ),
  );
  // custom_public -> both Marketplace Link and Custom Recreate Link
  assert.ok(
    md.includes(
      '| [Install App on target-emu ↗](https://github.com/apps/org-public-bot/installations/new) | [Recreate Custom App (Pre-Filled) ↗](https://github.com/organizations/target-emu/settings/apps/new?name=org-public-bot-target-emu) |',
    ),
  );

  // 3. Verify Larger GitHub-Hosted Runners billing warning callout
  assert.ok(
    md.includes(
      'Billing & Spending Limits Required for Larger GitHub-Hosted Runners',
    ),
  );
  assert.ok(md.includes('/organizations/target-emu/settings/billing)'));

  // 4. Verify IdP team filtering: plain-team without IdP group is omitted, while secops with Okta-SecOps is included with formatted Markdown /Sync link
  const idpItems = deliverables.items.filter((i) => i.category === 'idp-team');
  assert.equal(idpItems.length, 1);
  assert.equal(idpItems[0]?.resourceName, 'secops');
  assert.ok(md.includes('Okta-SecOps'));
  assert.ok(
    md.includes(
      '[Team IdP Sync Settings ↗](https://github.com/orgs/target-emu/teams/secops/Sync)',
    ),
  );

  // 5. Verify SSH Deploy Keys post-migration cutover workflow & CLI instructions
  assert.ok(md.includes('Automated Post-Migration Source-Detach Cutover'));
  assert.ok(md.includes('post-migration-cutover.yml'));
  assert.ok(md.includes('ghec-consultant-cli cutover'));
  assert.ok(
    deliverables.csvFiles[
      'exports/identity-and-access/deploy-keys-cutover.csv'
    ]!.includes(
      'ghec-consultant-cli cutover --source-org source-org --target-org target-emu --repos demo --include-deploy-keys',
    ),
  );

  // 6. Verify Webhooks developer HMAC guide and priority sorting (inactive-webhook first, active-no-secret last)
  assert.ok(md.includes('check the **[x] Active** checkbox'));
  assert.ok(md.includes('How Developers Should Populate Webhook HMAC Secrets'));
  assert.ok(md.includes('-f "config[secret]=<SECRET>" -F active=true'));

  const webhookItems = deliverables.items.filter(
    (i) => i.category === 'webhook',
  );
  assert.equal(webhookItems.length, 2);
  assert.equal(webhookItems[0]?.resourceName, 'https://ci.example.com/hook');
  assert.equal(webhookItems[0]?.migrationStatus, 'inactive-webhook');
  assert.equal(webhookItems[0]?.priority, 'high');
  assert.equal(webhookItems[1]?.resourceName, 'https://httpbin.org/post');
  assert.equal(webhookItems[1]?.migrationStatus, 'active-no-secret');
  assert.equal(webhookItems[1]?.priority, 'low');
  assert.ok(
    md.indexOf('https://ci.example.com/hook') <
      md.indexOf('https://httpbin.org/post'),
  );
});
