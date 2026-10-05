#!/usr/bin/env node
/**
 * Automated provisioning helper for dummy migration test resources on source organization.
 * Conforms to docs/guides/ghec-to-emu-test-migration-setup.md (Section 3).
 */
import { Buffer } from 'node:buffer';

const token =
  process.env.GHEC_TARGET_TOKEN?.trim() ||
  process.env.GHEC_SOURCE_TOKEN?.trim() ||
  process.env.GH_TOKEN?.trim() ||
  process.env.GITHUB_TOKEN?.trim();
const org =
  process.argv
    .find(
      (arg) =>
        !arg.startsWith('--') &&
        arg !== process.argv[0] &&
        arg !== process.argv[1],
    )
    ?.trim() ||
  process.env.GHEC_SOURCE_ORG?.trim() ||
  'demogxp';
const isTargetReposOnly = process.argv.includes('--target-repos-only');

if (!token) {
  console.error(
    'Error: GHEC_SOURCE_TOKEN or GHEC_TARGET_TOKEN environment variable is required.',
  );
  process.exit(1);
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'ghec-consultant-suite-seeder',
};

async function ghRequest(path, method = 'GET', body = null) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const options = {
    method,
    headers: { ...headers },
  };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function ensureRepo(name, isPrivate) {
  console.log(`Checking repository: ${org}/${name}...`);
  const check = await ghRequest(`/repos/${org}/${name}`);
  if (check.ok) {
    console.log(`  ✓ Repository ${org}/${name} already exists.`);
    return check.data;
  }
  console.log(
    `  + Creating repository ${org}/${name} (private: ${isPrivate})...`,
  );
  const create = await ghRequest(`/orgs/${org}/repos`, 'POST', {
    name,
    private: isPrivate,
    auto_init: true,
    description: `Synthetic dummy test repository for GHEC-to-EMU migration validation (${name})`,
  });
  if (!create.ok) {
    console.warn(
      `  ! Warning creating repo: HTTP ${create.status}: ${JSON.stringify(create.data)}`,
    );
  } else {
    console.log(`  ✓ Created ${org}/${name}`);
  }
  return create.data;
}

async function ensureFile(repo, filePath, content, commitMessage) {
  const check = await ghRequest(`/repos/${org}/${repo}/contents/${filePath}`);
  const sha = check.ok ? check.data.sha : undefined;
  const encoded = Buffer.from(content, 'utf8').toString('base64');

  if (sha) {
    console.log(`  ✓ File ${filePath} already exists in ${repo}.`);
    return;
  }

  console.log(`  + Adding file ${filePath} to ${repo}...`);
  const put = await ghRequest(
    `/repos/${org}/${repo}/contents/${filePath}`,
    'PUT',
    {
      message: commitMessage,
      content: encoded,
    },
  );
  if (!put.ok) {
    console.warn(`  ! Warning creating ${filePath}: HTTP ${put.status}`);
  } else {
    console.log(`  ✓ Committed ${filePath} to ${repo}`);
  }
}

async function ensureRepoVariable(repo, name, value) {
  const check = await ghRequest(
    `/repos/${org}/${repo}/actions/variables/${name}`,
  );
  if (check.ok) {
    console.log(`  ✓ Repo variable ${name} already exists in ${repo}.`);
    return;
  }
  console.log(`  + Setting repo variable ${name}=${value} in ${repo}...`);
  const post = await ghRequest(
    `/repos/${org}/${repo}/actions/variables`,
    'POST',
    {
      name,
      value,
    },
  );
  if (post.ok) {
    console.log(`  ✓ Set repo variable ${name}`);
  } else {
    console.warn(
      `  ! Could not set repo variable ${name}: HTTP ${post.status}`,
    );
  }
}

async function ensureEnvironment(repo, envName) {
  console.log(`  + Ensuring environment '${envName}' on ${repo}...`);
  const put = await ghRequest(
    `/repos/${org}/${repo}/environments/${envName}`,
    'PUT',
    {
      wait_timer: 5,
      prevent_self_review: false,
    },
  );
  if (put.ok) {
    console.log(`  ✓ Environment '${envName}' configured on ${repo}`);
  } else {
    console.warn(`  ! Could not configure environment: HTTP ${put.status}`);
  }
}

async function ensureOrgVariable(name, value) {
  const check = await ghRequest(`/orgs/${org}/actions/variables/${name}`);
  if (check.ok) {
    console.log(`  ✓ Org variable ${name} already exists in ${org}.`);
    return;
  }
  console.log(`  + Creating org variable ${name}=${value}...`);
  const post = await ghRequest(`/orgs/${org}/actions/variables`, 'POST', {
    name,
    value,
    visibility: 'all',
  });
  if (post.ok) {
    console.log(`  ✓ Created org variable ${name}`);
  } else {
    console.warn(
      `  ! Warning creating org variable ${name}: HTTP ${post.status}`,
    );
  }
}

async function ensureOrgCustomProperties() {
  console.log(`  + Creating organization custom property schemas in ${org}...`);
  const schemaPayload = {
    properties: [
      {
        property_name: 'environment',
        value_type: 'single_select',
        allowed_values: ['development', 'staging', 'production'],
        description: 'Deployment lifecycle stage',
      },
      {
        property_name: 'cost_center',
        value_type: 'string',
        description: 'Financial billing identifier',
      },
    ],
  };
  const patch = await ghRequest(
    `/orgs/${org}/properties/schema`,
    'PATCH',
    schemaPayload,
  );
  if (patch.ok) {
    console.log('  ✓ Custom property schemas configured.');
  } else {
    console.warn(`  ! Notice on custom property schemas: HTTP ${patch.status}`);
  }
}

async function ensureTeams() {
  console.log(`  + Ensuring teams hierarchy in ${org}...`);
  let parentTeamId = null;

  // 1. Parent team: engineering
  const checkEng = await ghRequest(`/orgs/${org}/teams/engineering`);
  if (checkEng.ok) {
    console.log('  ✓ Parent team "engineering" exists.');
    parentTeamId = checkEng.data.id;
  } else {
    const createEng = await ghRequest(`/orgs/${org}/teams`, 'POST', {
      name: 'engineering',
      privacy: 'closed',
      description: 'Core Engineering Parent Team',
    });
    if (createEng.ok) {
      console.log('  ✓ Created parent team "engineering".');
      parentTeamId = createEng.data.id;
    }
  }

  // 2. Child team: platform-infra
  const checkInfra = await ghRequest(`/orgs/${org}/teams/platform-infra`);
  if (checkInfra.ok) {
    console.log('  ✓ Child team "platform-infra" exists.');
  } else {
    const payload = {
      name: 'platform-infra',
      privacy: 'closed',
      description: 'Platform Infrastructure Child Team',
    };
    if (parentTeamId) payload.parent_team_id = parentTeamId;
    const createInfra = await ghRequest(`/orgs/${org}/teams`, 'POST', payload);
    if (createInfra.ok) {
      console.log('  ✓ Created child team "platform-infra".');
    }
  }
}

async function ensureOrgWebhook() {
  console.log(`  + Checking organization webhook in ${org}...`);
  const check = await ghRequest(`/orgs/${org}/hooks`);
  if (check.ok && Array.isArray(check.data)) {
    const exists = check.data.some((h) =>
      h.config?.url?.includes('httpbin.org'),
    );
    if (exists) {
      console.log('  ✓ Org webhook to httpbin.org already exists.');
      return;
    }
  }
  const create = await ghRequest(`/orgs/${org}/hooks`, 'POST', {
    name: 'web',
    active: true,
    events: ['team', 'repository'],
    config: {
      url: 'https://httpbin.org/post',
      content_type: 'json',
    },
  });
  if (create.ok) {
    console.log('  ✓ Created organization webhook.');
  } else {
    console.warn(`  ! Could not create org webhook: HTTP ${create.status}`);
  }
}

async function main() {
  console.log(`=======================================================`);
  console.log(`🚀 Provisioning Dummy Migration Resources in: ${org}`);
  console.log(`=======================================================`);

  if (isTargetReposOnly) {
    console.log(`Provisioning target placeholder repositories in ${org}...`);
    // Target repos start as private (mirroring GEI initial import state)
    await ensureRepo('dummy-repo-public', true);
    await ensureRepo('dummy-repo-private-lfs', true);
    console.log(`\n=======================================================`);
    console.log(`✅ Target placeholder repositories ready in: ${org}`);
    console.log(`=======================================================`);
    return;
  }

  // 1. Organization Resources
  await ensureOrgVariable('GLOBAL_REGION', 'us-east-1');
  await ensureOrgVariable('ENABLE_MAINTENANCE_MODE', 'false');
  await ensureOrgCustomProperties();
  await ensureTeams();
  await ensureOrgWebhook();

  // 2. Repository 1: dummy-repo-public
  await ensureRepo('dummy-repo-public', false);
  await ensureFile(
    'dummy-repo-public',
    'README.md',
    `# dummy-repo-public\n\nStandard public test repository for GHEC-to-EMU migration verification.`,
    'Initial documentation',
  );
  await ensureFile(
    'dummy-repo-public',
    '.github/workflows/test.yml',
    `name: Test Workflow\non: [push]\njobs:\n  echo:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "Dummy test workflow"`,
    'Add test workflow',
  );
  await ensureRepoVariable('dummy-repo-public', 'APP_ENV', 'staging');
  await ensureRepoVariable('dummy-repo-public', 'LOG_LEVEL', 'debug');
  await ensureEnvironment('dummy-repo-public', 'production');

  // 3. Repository 2: dummy-repo-private-lfs
  await ensureRepo('dummy-repo-private-lfs', true);
  await ensureFile(
    'dummy-repo-private-lfs',
    '.gitattributes',
    `*.bin filter=lfs diff=lfs merge=lfs -text\n`,
    'Configure gitattributes for Git LFS',
  );
  await ensureFile(
    'dummy-repo-private-lfs',
    'README.md',
    `# dummy-repo-private-lfs\n\nPrivate repository with Git LFS attributes and release assets.`,
    'Initial commit',
  );
  await ensureFile(
    'dummy-repo-private-lfs',
    'sample-asset.bin',
    'SYNTHETIC_LFS_BINARY_PAYLOAD_TEST_DATA_0123456789',
    'Add sample binary asset',
  );

  console.log(`\n=======================================================`);
  console.log(`✅ Provisioning sequence completed for: ${org}`);
  console.log(`=======================================================`);
}

main().catch((err) => {
  console.error('Fatal error during provisioning:', err);
  process.exit(1);
});
