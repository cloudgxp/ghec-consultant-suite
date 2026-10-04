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
 * Organized by functional domain supporting GHEC -> GHEC-EMU migration,
 * discovery, GitHub client isolation, and Octokit rehydration modules.
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
  'content/admin/managing-github-apps-for-your-enterprise',

  // 3. Organizations, Teams & Membership Hierarchy
  'content/organizations/index.md',
  'content/organizations/organizing-members-into-teams',
  'content/organizations/collaborating-with-groups-in-organizations',
  'content/organizations/managing-peoples-access-to-your-organization-with-roles',
  'content/organizations/managing-membership-in-your-organization',
  'content/organizations/managing-programmatic-access-to-your-organization',
  'content/organizations/managing-saml-single-sign-on-for-your-organization',
  'content/organizations/managing-organization-settings',
  'content/organizations/managing-user-access-to-your-organizations-repositories',

  // 4. Repositories, Rulesets & Branch Protections
  'content/repositories/index.md',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches',
  'content/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository',
  'content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings',
  'content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository',
  'content/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository',

  // 5. Actions, Secrets, Variables & Runners
  'content/actions/index.md',
  'content/actions/concepts/about-actions-policies.md',
  'content/actions/concepts/runners',
  'content/actions/concepts/security',
  'content/actions/concepts/workflows-and-actions',
  'content/actions/how-tos/manage-runners/self-hosted-runners',
  'content/actions/how-tos/write-workflows/choose-what-workflows-do',
  'content/actions/how-tos/reuse-automations',

  // 6. Webhooks
  'content/webhooks',

  // 7. REST API Endpoints & Guides
  'content/rest/index.md',
  'content/rest/about-the-rest-api',
  'content/rest/using-the-rest-api',
  'content/rest/authentication',
  'content/rest/guides/encrypting-secrets-for-the-rest-api.md',
  'content/rest/guides/scripting-with-the-rest-api-and-javascript.md',
  'content/rest/actions',
  'content/rest/orgs',
  'content/rest/repos',
  'content/rest/teams',
  'content/rest/scim',
  'content/rest/enterprise-admin',
  'content/rest/enterprise-teams',
  'content/rest/migrations',
  'content/rest/rate-limit',
  'content/rest/collaborators',
  'content/rest/branches',
  'content/rest/deployments',

  // 8. GraphQL API Queries & Reference
  'content/graphql/index.md',
  'content/graphql/overview',
  'content/graphql/guides/forming-calls-with-graphql.md',
  'content/graphql/guides/managing-enterprise-accounts.md',
  'content/graphql/guides/using-pagination-in-the-graphql-api.md',
  'content/graphql/guides/using-global-node-ids.md',
  'content/graphql/guides/using-graphql-clients.md',
  'content/graphql/guides/migrating-from-rest-to-graphql.md',
  'content/graphql/guides/index.md',
  'content/graphql/reference/index.md',
  'content/graphql/reference/migrations.md',
  'content/graphql/reference/orgs.md',
  'content/graphql/reference/repos.md',
  'content/graphql/reference/teams.md',
  'content/graphql/reference/enterprise-admin.md',
  'content/graphql/reference/actions.md',
  'content/graphql/reference/apps.md',
  'content/graphql/reference/branches.md',

  // 9. GitHub Apps & Authentication Posture
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
  'content/authentication/keeping-your-account-and-data-secure/index.md',
  'content/authentication/keeping-your-account-and-data-secure/about-authentication-to-github.md',
  'content/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens.md',
  'content/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation.md',
  'content/authentication/keeping-your-account-and-data-secure/revoking-your-credentials.md',

  // 10. Supporting Reusables & Product Variables
  'data/reusables/enterprise-migration-tool',
  'data/variables/product.yml',
];

function printHelp() {
  console.log(`
Usage: node scripts/sync-github-docs.mjs [options]

Synchronizes a curated local copy of GitHub documentation from github/docs
into references/github-docs/.

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

function sync() {
  const { ref, source, dryRun } = parseArgs();

  console.log(`Starting GitHub documentation synchronization...`);
  console.log(`Source Repository: ${source}`);
  console.log(`Requested Ref:     ${ref}`);
  console.log(`Mode:              ${dryRun ? 'DRY RUN' : 'LIVE SYNC'}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghec-gh-docs-sync-'));

  try {
    console.log(`Cloning/fetching upstream tree into temporary workspace...`);
    execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    execFileSync('git', ['remote', 'add', 'origin', source], {
      cwd: tempDir,
      stdio: 'pipe',
    });
    execFileSync(
      'git',
      ['fetch', '--depth', '1', '--filter=blob:none', 'origin', ref],
      { cwd: tempDir, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    execFileSync('git', ['checkout', 'FETCH_HEAD'], {
      cwd: tempDir,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

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
        `\n[DRY RUN] Would copy ${fileMap.size} files to ${DOCS_DEST}`,
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
