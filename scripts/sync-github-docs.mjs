#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DEST = path.join(REPO_ROOT, 'references', 'github-docs');

/**
 * Curated allowlist of documentation paths from github/docs.
 * Organized by functional domain supporting all 32 GHEC -> GHEC-EMU migration modules,
 * discovery/sizing collectors, GitHub client isolation, and Octokit rehydration modules.
 */
export const ALLOWLIST = [
  // 1. Migrations & GitHub Enterprise Importer (GEI)
  'content/migrations/index.md',
  'content/migrations/overview',
  'content/migrations/using-github-enterprise-importer/index.md',
  'content/migrations/using-github-enterprise-importer/understanding-github-enterprise-importer',
  'content/migrations/using-github-enterprise-importer/migrating-between-github-products',
  'content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer',
  'content/migrations/troubleshooting',

  // 2. Enterprise Administration & Enterprise Managed Users (EMU)
  'content/admin/index.md',
  'content/admin/concepts/identity-and-access-management',
  'content/admin/concepts/enterprise-fundamentals',
  'content/admin/concepts/security-and-compliance',
  'content/admin/managing-iam/index.md',
  'content/admin/managing-iam/understanding-iam-for-enterprises',
  'content/admin/managing-iam/configuring-authentication-for-enterprise-managed-users',
  'content/admin/managing-iam/provisioning-user-accounts-with-scim',
  'content/admin/managing-iam/reconfiguring-iam-for-enterprise-managed-users',
  'content/admin/managing-iam/iam-configuration-reference',
  'content/admin/managing-iam/using-saml-for-enterprise-iam',
  'content/admin/managing-iam/managing-recovery-codes-for-your-enterprise',
  'content/admin/managing-accounts-and-repositories/managing-organizations-in-your-enterprise',
  'content/admin/managing-accounts-and-repositories/managing-repositories-in-your-enterprise',
  'content/admin/managing-accounts-and-repositories/managing-roles-in-your-enterprise',
  'content/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise',
  'content/admin/enforcing-policies/enforcing-policies-for-your-enterprise',
  'content/admin/managing-github-actions-for-your-enterprise',
  'content/admin/managing-github-apps-for-your-enterprise',
  'content/admin/managing-your-enterprise-account',
  'content/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise',

  // 3. Organizations, Teams, Custom Roles, Security Managers & Membership Hierarchy
  'content/organizations/index.md',
  'content/organizations/organizing-members-into-teams',
  'content/organizations/collaborating-with-groups-in-organizations',
  'content/organizations/managing-peoples-access-to-your-organization-with-roles',
  'content/organizations/managing-membership-in-your-organization',
  'content/organizations/managing-programmatic-access-to-your-organization',
  'content/organizations/managing-saml-single-sign-on-for-your-organization',
  'content/organizations/granting-access-to-your-organization-with-saml-single-sign-on',
  'content/organizations/managing-organization-settings',
  'content/organizations/managing-user-access-to-your-organizations-repositories',
  'content/organizations/keeping-your-organization-secure',
  'content/organizations/managing-git-access-to-your-organizations-repositories',
  'content/organizations/managing-oauth-access-to-your-organizations-data',

  // 4. Repositories, Rulesets, Branch Protections, Releases & LFS
  'content/repositories/index.md',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository',
  'content/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges',
  'content/repositories/creating-and-managing-repositories',
  'content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings',
  'content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository',
  'content/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository',
  'content/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration',
  'content/repositories/releasing-projects-on-github',
  'content/repositories/working-with-files/managing-large-files',

  // 5. Actions, Secrets, Variables, Environments & Runners
  'content/actions/index.md',
  'content/actions/concepts/about-actions-policies.md',
  'content/actions/concepts/runners',
  'content/actions/concepts/security',
  'content/actions/concepts/workflows-and-actions',
  'content/actions/how-tos/manage-runners/self-hosted-runners',
  'content/actions/how-tos/manage-runners/larger-runners',
  'content/actions/how-tos/write-workflows/choose-what-workflows-do',
  'content/actions/how-tos/reuse-automations',
  'content/actions/how-tos/secure-your-work',

  // 6. Projects V2, Issues, Pull Requests, Discussions & Packages
  'content/issues/index.md',
  'content/issues/planning-and-tracking-with-projects',
  'content/issues/tracking-your-work-with-issues',
  'content/issues/using-labels-and-milestones-to-track-work',
  'content/pull-requests/index.md',
  'content/pull-requests/concepts',
  'content/pull-requests/reference',
  'content/discussions',
  'content/packages',

  // 7. GHAS & Code Security (Code Scanning, Secret Scanning, Dependabot, Security Configurations)
  'content/code-security/index.md',
  'content/code-security/concepts/code-scanning',
  'content/code-security/concepts/secret-security',
  'content/code-security/concepts/supply-chain-security',
  'content/code-security/concepts/security-at-scale',
  'content/code-security/how-tos/secure-at-scale',
  'content/code-security/reference/permissions',
  'content/code-security/reference/security-at-scale',

  // 8. Webhooks
  'content/webhooks',

  // 9. REST API Endpoints & Guides
  'content/rest/index.md',
  'content/rest/about-the-rest-api',
  'content/rest/using-the-rest-api',
  'content/rest/authentication',
  'content/rest/guides',
  'content/rest/actions',
  'content/rest/apps',
  'content/rest/branches',
  'content/rest/checks',
  'content/rest/code-scanning',
  'content/rest/code-security',
  'content/rest/collaborators',
  'content/rest/commits',
  'content/rest/credentials',
  'content/rest/dependabot',
  'content/rest/dependency-graph',
  'content/rest/deploy-keys',
  'content/rest/deployments',
  'content/rest/enterprise-admin',
  'content/rest/enterprise-teams',
  'content/rest/git',
  'content/rest/interactions',
  'content/rest/issues',
  'content/rest/meta',
  'content/rest/migrations',
  'content/rest/orgs',
  'content/rest/packages',
  'content/rest/private-registries',
  'content/rest/projects',
  'content/rest/pulls',
  'content/rest/rate-limit',
  'content/rest/reactions',
  'content/rest/releases',
  'content/rest/repos',
  'content/rest/scim',
  'content/rest/secret-scanning',
  'content/rest/security-advisories',
  'content/rest/teams',
  'content/rest/users',

  // 10. GraphQL API Queries, Mutations & Reference
  'content/graphql/index.md',
  'content/graphql/overview',
  'content/graphql/guides',
  'content/graphql/reference',

  // 11. GitHub Apps, SSH & Authentication Posture
  'content/apps/index.md',
  'content/apps/overview.md',
  'content/apps/creating-github-apps/index.md',
  'content/apps/creating-github-apps/about-creating-github-apps',
  'content/apps/creating-github-apps/authenticating-with-a-github-app',
  'content/apps/creating-github-apps/registering-a-github-app',
  'content/apps/using-github-apps',
  'content/apps/maintaining-github-apps',
  'content/authentication/index.md',
  'content/authentication/authenticating-with-single-sign-on',
  'content/authentication/connecting-to-github-with-ssh',
  'content/authentication/keeping-your-account-and-data-secure/index.md',
  'content/authentication/keeping-your-account-and-data-secure/about-authentication-to-github.md',
  'content/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens.md',
  'content/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation.md',
  'content/authentication/keeping-your-account-and-data-secure/revoking-your-credentials.md',

  // 12. Supporting Reusables & Variables
  'data/reusables/accounts',
  'data/reusables/actions',
  'data/reusables/advanced-security',
  'data/reusables/apps',
  'data/reusables/audit_log',
  'data/reusables/branches',
  'data/reusables/code-scanning',
  'data/reusables/code-security',
  'data/reusables/credentials',
  'data/reusables/dependabot',
  'data/reusables/dependency-graph',
  'data/reusables/dependency-review',
  'data/reusables/discussions',
  'data/reusables/emus',
  'data/reusables/enterprise',
  'data/reusables/enterprise-accounts',
  'data/reusables/enterprise-data-residency',
  'data/reusables/enterprise-managed',
  'data/reusables/enterprise_migrations',
  'data/reusables/enterprise-migration-tool',
  'data/reusables/enterprise_user_management',
  'data/reusables/gated-features',
  'data/reusables/identity-and-permissions',
  'data/reusables/interactions',
  'data/reusables/issues',
  'data/reusables/large_files',
  'data/reusables/migrations',
  'data/reusables/organizations',
  'data/reusables/package_registry',
  'data/reusables/permissions',
  'data/reusables/policies',
  'data/reusables/project-management',
  'data/reusables/projects',
  'data/reusables/pull_requests',
  'data/reusables/releases',
  'data/reusables/repositories',
  'data/reusables/rest-api',
  'data/reusables/saml',
  'data/reusables/scim',
  'data/reusables/secret-scanning',
  'data/reusables/security',
  'data/reusables/security-advisory',
  'data/reusables/security-configurations',
  'data/reusables/security-overview',
  'data/reusables/shortdesc',
  'data/reusables/ssh',
  'data/reusables/two_fa',
  'data/reusables/user-settings',
  'data/reusables/webhooks',
  'data/variables',
];

function printHelp() {
  console.log(`
Usage: node scripts/sync-github-docs.mjs [options]

Synchronizes a curated local copy of GitHub documentation from github/docs
into references/github-docs/, including hydrating autogenerated REST and
GraphQL API reference pages from upstream GHEC schema definitions.

Options:
  --ref <ref>       Git branch, tag, or commit to sync from (default: main)
  --source <url>    Git remote repository URL (default: https://github.com/github/docs.git)
  --dry-run         Verify allowlist and list target files without copying
  --help, -h        Show this help message
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let ref = 'main';
  let source = 'https://github.com/github/docs.git';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--ref') {
      ref = args[++i];
      if (!ref) throw new Error('Missing argument value for --ref');
    } else if (arg === '--source') {
      source = args[++i];
      if (!source) throw new Error('Missing argument value for --source');
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { ref, source, dryRun };
}

function collectFiles(baseDir, relPath) {
  const fullPath = path.join(baseDir, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Path does not exist upstream: ${relPath}`);
  }
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return [{ relPath, size: stat.size }];
  }
  const files = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const subRel = path.join(relPath, entry.name);
    files.push(...collectFiles(baseDir, subRel));
  }
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatTableCell(text) {
  return stripHtml(text).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

function renderRestEndpointsMarkdown(endpoints) {
  const lines = [
    '',
    '<!-- Hydrated from github/docs src/rest/data/ghec-2022-11-28 -->',
  ];

  for (const ep of endpoints) {
    lines.push('');
    lines.push(`## ${ep.title}`);
    lines.push('');
    lines.push(`\`${String(ep.verb).toUpperCase()} ${ep.requestPath}\``);

    const desc = stripHtml(ep.descriptionHTML);
    if (desc) {
      lines.push('');
      lines.push(desc);
    }

    if (Array.isArray(ep.parameters) && ep.parameters.length > 0) {
      lines.push('');
      lines.push('### Parameters');
      lines.push('');
      lines.push('| Name | In | Type | Required | Description |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const p of ep.parameters) {
        const pType = p.schema?.type || '';
        const pReq = p.required ? 'Yes' : 'No';
        const pDesc = formatTableCell(p.description);
        lines.push(
          `| \`${p.name}\` | ${p.in || ''} | \`${pType}\` | ${pReq} | ${pDesc} |`,
        );
      }
    }

    if (Array.isArray(ep.bodyParameters) && ep.bodyParameters.length > 0) {
      lines.push('');
      lines.push('### Body Parameters');
      lines.push('');
      lines.push('| Name | Type | Required | Description |');
      lines.push('| :--- | :--- | :--- | :--- |');
      for (const bp of ep.bodyParameters) {
        const bpReq = bp.isRequired ? 'Yes' : 'No';
        const bpDesc = formatTableCell(bp.description);
        lines.push(
          `| \`${bp.name}\` | \`${bp.type || ''}\` | ${bpReq} | ${bpDesc} |`,
        );
      }
    }

    if (Array.isArray(ep.statusCodes) && ep.statusCodes.length > 0) {
      lines.push('');
      lines.push('### HTTP Response Status Codes');
      lines.push('');
      lines.push('| Status Code | Description |');
      lines.push('| :--- | :--- |');
      for (const sc of ep.statusCodes) {
        lines.push(
          `| \`${sc.httpStatusCode}\` | ${formatTableCell(sc.description)} |`,
        );
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderGraphqlSchemaMarkdown(schemaData) {
  const lines = [
    '',
    '<!-- Hydrated from github/docs src/graphql/data/ghec -->',
  ];

  if (Array.isArray(schemaData.queries) && schemaData.queries.length > 0) {
    lines.push('');
    lines.push('## Queries');
    for (const q of schemaData.queries) {
      lines.push('');
      lines.push(`### \`${q.name}\`: \`${q.type}\``);
      const desc = stripHtml(q.description);
      if (desc) {
        lines.push('');
        lines.push(desc);
      }
      if (Array.isArray(q.args) && q.args.length > 0) {
        lines.push('');
        lines.push('| Argument | Type | Description |');
        lines.push('| :--- | :--- | :--- |');
        for (const a of q.args) {
          lines.push(
            `| \`${a.name}\` | \`${a.type}\` | ${formatTableCell(a.description)} |`,
          );
        }
      }
    }
  }

  if (Array.isArray(schemaData.mutations) && schemaData.mutations.length > 0) {
    lines.push('');
    lines.push('## Mutations');
    for (const m of schemaData.mutations) {
      lines.push('');
      lines.push(`### \`${m.name}\``);
      const desc = stripHtml(m.description);
      if (desc) {
        lines.push('');
        lines.push(desc);
      }
      if (Array.isArray(m.inputFields) && m.inputFields.length > 0) {
        lines.push('');
        lines.push('**Input Fields:**');
        lines.push('');
        lines.push('| Field | Type | Description |');
        lines.push('| :--- | :--- | :--- |');
        for (const f of m.inputFields) {
          lines.push(
            `| \`${f.name}\` | \`${f.type}\` | ${formatTableCell(f.description)} |`,
          );
        }
      }
      if (Array.isArray(m.returnFields) && m.returnFields.length > 0) {
        lines.push('');
        lines.push('**Return Fields:**');
        lines.push('');
        lines.push('| Field | Type | Description |');
        lines.push('| :--- | :--- | :--- |');
        for (const f of m.returnFields) {
          lines.push(
            `| \`${f.name}\` | \`${f.type}\` | ${formatTableCell(f.description)} |`,
          );
        }
      }
    }
  }

  if (
    Array.isArray(schemaData.inputObjects) &&
    schemaData.inputObjects.length > 0
  ) {
    lines.push('');
    lines.push('## Input Objects');
    for (const io of schemaData.inputObjects) {
      lines.push('');
      lines.push(`### \`${io.name}\``);
      const desc = stripHtml(io.description);
      if (desc) {
        lines.push('');
        lines.push(desc);
      }
      if (Array.isArray(io.inputFields) && io.inputFields.length > 0) {
        lines.push('');
        lines.push('| Field | Type | Description |');
        lines.push('| :--- | :--- | :--- |');
        for (const f of io.inputFields) {
          lines.push(
            `| \`${f.name}\` | \`${f.type}\` | ${formatTableCell(f.description)} |`,
          );
        }
      }
    }
  }

  if (Array.isArray(schemaData.objects) && schemaData.objects.length > 0) {
    lines.push('');
    lines.push('## Objects');
    for (const o of schemaData.objects) {
      lines.push('');
      lines.push(`### \`${o.name}\``);
      const desc = stripHtml(o.description);
      if (desc) {
        lines.push('');
        lines.push(desc);
      }
      if (Array.isArray(o.fields) && o.fields.length > 0) {
        lines.push('');
        lines.push('| Field | Type | Description |');
        lines.push('| :--- | :--- | :--- |');
        for (const f of o.fields) {
          lines.push(
            `| \`${f.name}\` | \`${f.type}\` | ${formatTableCell(f.description)} |`,
          );
        }
      }
    }
  }

  if (Array.isArray(schemaData.enums) && schemaData.enums.length > 0) {
    lines.push('');
    lines.push('## Enums');
    for (const e of schemaData.enums) {
      lines.push('');
      lines.push(`### \`${e.name}\``);
      const desc = stripHtml(e.description);
      if (desc) {
        lines.push('');
        lines.push(desc);
      }
      if (Array.isArray(e.values) && e.values.length > 0) {
        lines.push('');
        lines.push('| Value | Description |');
        lines.push('| :--- | :--- |');
        for (const v of e.values) {
          lines.push(`| \`${v.name}\` | ${formatTableCell(v.description)} |`);
        }
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function hydrateAutogeneratedReferences(tempDir, docsDest) {
  const restDataDir = path.join(
    tempDir,
    'src',
    'rest',
    'data',
    'ghec-2022-11-28',
  );
  const gqlDataDir = path.join(tempDir, 'src', 'graphql', 'data', 'ghec');
  const restContentDest = path.join(docsDest, 'content', 'rest');
  const gqlContentDest = path.join(docsDest, 'content', 'graphql', 'reference');

  let hydratedRestFiles = 0;
  let hydratedRestBytes = 0;
  let hydratedGqlFiles = 0;
  let hydratedGqlBytes = 0;

  if (fs.existsSync(restContentDest) && fs.existsSync(restDataDir)) {
    const restJsonCache = new Map();
    const walkRest = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkRest(fullPath);
        } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (!content.includes('autogenerated: rest')) continue;

          const rel = path.relative(restContentDest, fullPath);
          const parts = rel.replace(/\.md$/, '').split(path.sep);
          const cat = parts[0];
          const subcat = parts[1] || parts[0];
          const jsonPath = path.join(restDataDir, `${cat}.json`);
          if (!fs.existsSync(jsonPath)) continue;

          if (!restJsonCache.has(cat)) {
            restJsonCache.set(
              cat,
              JSON.parse(fs.readFileSync(jsonPath, 'utf8')),
            );
          }
          const catData = restJsonCache.get(cat);
          const endpoints = catData[subcat];
          if (!Array.isArray(endpoints) || endpoints.length === 0) continue;

          const rendered = renderRestEndpointsMarkdown(endpoints);
          const updated = content.trimEnd() + '\n' + rendered;
          fs.writeFileSync(fullPath, updated, 'utf8');
          hydratedRestFiles++;
          hydratedRestBytes += Buffer.byteLength(rendered, 'utf8');
        }
      }
    };
    walkRest(restContentDest);
  }

  if (fs.existsSync(gqlContentDest) && fs.existsSync(gqlDataDir)) {
    for (const entry of fs.readdirSync(gqlContentDest, {
      withFileTypes: true,
    })) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.md') ||
        entry.name === 'index.md'
      ) {
        continue;
      }
      const fullPath = path.join(gqlContentDest, entry.name);
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('autogenerated: graphql')) continue;

      const slug = entry.name.replace(/\.md$/, '');
      const jsonPath = path.join(gqlDataDir, `schema-${slug}.json`);
      if (!fs.existsSync(jsonPath)) continue;

      const schemaData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const rendered = renderGraphqlSchemaMarkdown(schemaData);
      const updated = content.trimEnd() + '\n' + rendered;
      fs.writeFileSync(fullPath, updated, 'utf8');
      hydratedGqlFiles++;
      hydratedGqlBytes += Buffer.byteLength(rendered, 'utf8');
    }
  }

  return {
    hydratedRestFiles,
    hydratedRestBytes,
    hydratedGqlFiles,
    hydratedGqlBytes,
  };
}

function sync() {
  const { ref, source, dryRun } = parseArgs();

  console.log(`Starting GitHub documentation synchronization...`);
  console.log(`Source Repository: ${source}`);
  console.log(`Requested Ref:     ${ref}`);
  console.log(`Mode:              ${dryRun ? 'DRY RUN' : 'LIVE SYNC'}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-docs-import-'));

  try {
    console.log(
      `Cloning/fetching upstream tree into temporary workspace (${tempDir})...`,
    );
    execFileSync(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        '--branch',
        ref,
        source,
        tempDir,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    const sparseDirs = Array.from(
      new Set([
        ...ALLOWLIST.map((p) =>
          p.endsWith('.md') || p.endsWith('.yml') ? path.dirname(p) : p,
        ),
        'src/rest/data/ghec-2022-11-28',
        'src/graphql/data/ghec',
      ]),
    );

    execFileSync(
      'git',
      ['sparse-checkout', 'set', '--skip-checks', ...sparseDirs],
      { cwd: tempDir, stdio: ['pipe', 'inherit', 'inherit'] },
    );

    const resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim();
    console.log(`Resolved exact commit SHA: ${resolvedSha}`);

    // Verify all allowlist paths exist upstream
    console.log(`Verifying ${ALLOWLIST.length} allowlisted paths...`);
    const missing = [];
    for (const relPath of ALLOWLIST) {
      if (!fs.existsSync(path.join(tempDir, relPath))) {
        missing.push(relPath);
      }
    }

    if (missing.length > 0) {
      console.error(
        `\n✖ Synchronization aborted! ${missing.length} allowlisted path(s) not found upstream:`,
      );
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
      process.exit(1);
    }

    // Verify license files exist upstream
    const licenseSrc = path.join(tempDir, 'LICENSE');
    const licenseCodeSrc = path.join(tempDir, 'LICENSE-CODE');
    if (!fs.existsSync(licenseSrc) || !fs.existsSync(licenseCodeSrc)) {
      console.error(
        `✖ Synchronization aborted! License files (LICENSE, LICENSE-CODE) not found upstream.`,
      );
      process.exit(1);
    }

    // Collect all matched files
    const fileMap = new Map();
    for (const relPath of ALLOWLIST) {
      const files = collectFiles(tempDir, relPath);
      for (const f of files) {
        fileMap.set(f.relPath, f.size);
      }
    }

    console.log(
      `Allowlist verified. Total files to synchronize: ${fileMap.size}`,
    );

    if (dryRun) {
      console.log(
        `\n[DRY RUN] Would copy ${fileMap.size} files to ${DOCS_DEST} and hydrate REST/GraphQL reference stubs.`,
      );
      return;
    }

    // Prepare destination directories
    const contentDest = path.join(DOCS_DEST, 'content');
    const dataDest = path.join(DOCS_DEST, 'data');
    const licensesDest = path.join(DOCS_DEST, 'LICENSES');

    // Remove previously synchronized directories to eliminate stale files
    if (fs.existsSync(contentDest)) {
      fs.rmSync(contentDest, { recursive: true, force: true });
    }
    if (fs.existsSync(dataDest)) {
      fs.rmSync(dataDest, { recursive: true, force: true });
    }
    if (fs.existsSync(licensesDest)) {
      fs.rmSync(licensesDest, { recursive: true, force: true });
    }

    fs.mkdirSync(contentDest, { recursive: true });
    fs.mkdirSync(dataDest, { recursive: true });
    fs.mkdirSync(licensesDest, { recursive: true });

    // Copy allowlisted files preserving relative structure
    let totalBytes = 0;
    const groupStats = {};
    const fileEntries = [];

    for (const [relPath, size] of fileMap.entries()) {
      const srcFile = path.join(tempDir, relPath);
      const dstFile = path.join(DOCS_DEST, relPath);

      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);

      totalBytes += size;
      fileEntries.push({ relPath, size });

      const topGroup = relPath.split('/').slice(0, 2).join('/');
      groupStats[topGroup] = groupStats[topGroup] || { count: 0, size: 0 };
      groupStats[topGroup].count += 1;
      groupStats[topGroup].size += size;
    }

    // Hydrate autogenerated REST and GraphQL stubs in content/rest and content/graphql/reference
    const hydration = hydrateAutogeneratedReferences(tempDir, DOCS_DEST);
    totalBytes += hydration.hydratedRestBytes + hydration.hydratedGqlBytes;
    if (groupStats['content/rest']) {
      groupStats['content/rest'].size += hydration.hydratedRestBytes;
    }
    if (groupStats['content/graphql']) {
      groupStats['content/graphql'].size += hydration.hydratedGqlBytes;
    }

    // Copy license files
    fs.copyFileSync(
      licenseSrc,
      path.join(licensesDest, 'LICENSE-CC-BY-4.0.txt'),
    );
    fs.copyFileSync(licenseCodeSrc, path.join(licensesDest, 'LICENSE-MIT.txt'));

    // Write VERSION file
    const syncedAt = new Date().toISOString();
    const versionContent = [
      `source_repository=${source}`,
      `source_branch=${ref}`,
      `source_commit=${resolvedSha}`,
      `synced_at=${syncedAt}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(DOCS_DEST, 'VERSION'), versionContent, 'utf8');

    // Sort top 5 largest files
    fileEntries.sort((a, b) => b.size - a.size);
    const topFiles = fileEntries.slice(0, 5);

    // Print summary
    console.log(`\n========================================================`);
    console.log(` GITHUB DOCUMENTATION SYNCHRONIZATION COMPLETE`);
    console.log(`========================================================`);
    console.log(`Target Directory: ${DOCS_DEST}`);
    console.log(`Resolved SHA:     ${resolvedSha}`);
    console.log(`Source Branch:    ${ref}`);
    console.log(`Total Files:      ${fileMap.size}`);
    console.log(
      `Hydrated Stubs:   ${hydration.hydratedRestFiles} REST pages (${formatBytes(hydration.hydratedRestBytes)}), ${hydration.hydratedGqlFiles} GraphQL pages (${formatBytes(hydration.hydratedGqlBytes)})`,
    );
    console.log(
      `Total Size:       ${formatBytes(totalBytes)} (${totalBytes} bytes)`,
    );
    console.log(`\nDocumentation Groups:`);
    for (const [grp, stats] of Object.entries(groupStats)) {
      console.log(
        `  - ${grp.padEnd(25)} ${String(stats.count).padStart(4)} files   ${formatBytes(stats.size).padStart(9)}`,
      );
    }
    console.log(`\nLargest Copied Files:`);
    for (const tf of topFiles) {
      console.log(
        `  - ${tf.relPath.padEnd(65)} ${formatBytes(tf.size).padStart(9)}`,
      );
    }
    console.log(`========================================================\n`);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

sync();
