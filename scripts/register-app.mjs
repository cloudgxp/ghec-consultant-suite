#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isValidManifestCode(code) {
  return typeof code === 'string' && /^[a-zA-Z0-9_-]+$/.test(code);
}

export function buildConversionUrl(code) {
  if (!isValidManifestCode(code)) {
    throw new Error('Invalid manifest code format');
  }
  return `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`;
}

export function parseRegisterAppArgs(argv = process.argv.slice(2)) {
  let targetOrg = '';
  let manifestFile = '';
  let appSlug = '';
  let port = 3000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]?.trim() ?? '';
    if (!arg) continue;

    if (arg === '--org' && argv[i + 1]) {
      targetOrg = argv[++i].trim();
    } else if (arg === '--manifest-file' && argv[i + 1]) {
      manifestFile = argv[++i].trim();
    } else if (arg === '--app' && argv[i + 1]) {
      appSlug = argv[++i].trim();
    } else if (arg === '--port' && argv[i + 1]) {
      const parsedPort = Number.parseInt(argv[++i].trim(), 10);
      if (Number.isFinite(parsedPort) && parsedPort > 0) {
        port = parsedPort;
      }
    } else if (!arg.startsWith('--') && !targetOrg) {
      targetOrg = arg;
    }
  }

  if (!targetOrg && process.env.TARGET_ORG?.trim()) {
    targetOrg = process.env.TARGET_ORG.trim();
  }

  return { targetOrg, manifestFile, appSlug, port };
}

export function extractManifestFromArtifact(parsedJson, appSlug = '') {
  if (!parsedJson || typeof parsedJson !== 'object') {
    throw new Error('Manifest artifact must be a valid JSON object');
  }

  const normalizedSlug = appSlug.trim().toLowerCase();

  // Case 1: Direct GitHub App Manifest JSON
  if (
    typeof parsedJson.name === 'string' &&
    parsedJson.default_permissions &&
    typeof parsedJson.default_permissions === 'object'
  ) {
    return {
      manifest: parsedJson,
      targetOrg: undefined,
      sourceSlug: appSlug.trim() || parsedJson.name,
    };
  }

  // Case 2: MigrationAdvisoryReport JSON (`apps` array)
  if (Array.isArray(parsedJson.apps)) {
    const candidates = parsedJson.apps.filter(
      (a) => a && typeof a === 'object' && a.manifest,
    );
    const matched = normalizedSlug
      ? candidates.find(
          (a) =>
            String(a.slug ?? '').toLowerCase() === normalizedSlug ||
            String(a.recreatedSlug ?? '').toLowerCase() === normalizedSlug ||
            String(a.name ?? '').toLowerCase() === normalizedSlug,
        )
      : candidates[0];

    if (!matched || !matched.manifest) {
      throw new Error(
        normalizedSlug
          ? `Could not find GitHub App manifest for "${appSlug}" in advisory report`
          : 'No GitHub App manifests found in advisory report',
      );
    }

    return {
      manifest: matched.manifest,
      targetOrg:
        typeof parsedJson.targetOrg === 'string'
          ? parsedJson.targetOrg
          : undefined,
      sourceSlug: String(matched.slug ?? matched.manifest.name),
    };
  }

  // Case 3: MigrationPlan JSON (`modulePlans` array with `apps-inventory`)
  if (Array.isArray(parsedJson.modulePlans)) {
    const appsPlan = parsedJson.modulePlans.find(
      (m) => m && typeof m === 'object' && m.moduleId === 'apps-inventory',
    );
    const operations = Array.isArray(appsPlan?.operations)
      ? appsPlan.operations
      : [];
    const candidates = operations.filter(
      (op) => op && typeof op === 'object' && op.payload?.manifest,
    );
    const matched = normalizedSlug
      ? candidates.find(
          (op) =>
            String(op.resourceName ?? '').toLowerCase() === normalizedSlug ||
            String(op.payload?.app_slug ?? '').toLowerCase() ===
              normalizedSlug ||
            String(op.payload?.recreated_app_slug ?? '').toLowerCase() ===
              normalizedSlug,
        )
      : candidates[0];

    if (!matched || !matched.payload?.manifest) {
      throw new Error(
        normalizedSlug
          ? `Could not find GitHub App manifest for "${appSlug}" in migration plan`
          : 'No GitHub App manifests found in migration plan',
      );
    }

    return {
      manifest: matched.payload.manifest,
      targetOrg:
        typeof appsPlan?.targetIdentifier === 'string'
          ? appsPlan.targetIdentifier
          : typeof parsedJson.targetOrg === 'string'
            ? parsedJson.targetOrg
            : undefined,
      sourceSlug: String(
        matched.payload.app_slug ??
          matched.resourceName ??
          matched.payload.manifest.name,
      ),
    };
  }

  throw new Error(
    'Unrecognized manifest file format. Expected a raw GitHub App Manifest JSON, migration-advisory-report.json, or migration-plan.json.',
  );
}

export function buildSecretNamesForApp(customSourceSlug = '') {
  const cleaned = customSourceSlug
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned) {
    return {
      idSecret: 'GHEC_APP_ID',
      keySecret: 'GHEC_APP_PRIVATE_KEY',
    };
  }

  return {
    idSecret: `GHEC_APP_${cleaned}_ID`,
    keySecret: `GHEC_APP_${cleaned}_PRIVATE_KEY`,
  };
}

const cliArgs = parseRegisterAppArgs();
const PORT = cliArgs.port;
let loadedCustomManifest = null;
let loadedSourceSlug = '';
let inferredTargetOrg = '';

if (cliArgs.manifestFile) {
  const rawContent = readFileSync(cliArgs.manifestFile, 'utf8');
  const parsed = JSON.parse(rawContent);
  const extracted = extractManifestFromArtifact(parsed, cliArgs.appSlug);
  loadedCustomManifest = extracted.manifest;
  loadedSourceSlug = extracted.sourceSlug;
  if (extracted.targetOrg) {
    inferredTargetOrg = extracted.targetOrg;
  }
}

const INITIAL_ORG = cliArgs.targetOrg || inferredTargetOrg || '';
const STATE = randomBytes(16).toString('hex');

// Dynamically determine repository homepage URL from git remote
let repoHomepage = 'https://github.com';
try {
  const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8',
  }).trim();
  if (remote.startsWith('git@github.com:')) {
    repoHomepage = `https://github.com/${remote.slice('git@github.com:'.length).replace(/\.git$/, '')}`;
  } else if (remote.startsWith('https://github.com/')) {
    repoHomepage = remote.replace(/\.git$/, '');
  }
} catch {
  // Use fallback
}

const defaultManifestTemplate = loadedCustomManifest ?? {
  name: `ghec-discovery-${Date.now().toString(36)}`,
  url: repoHomepage,
  description: 'Automated discovery scanner for GHEC Consultant Suite',
  hook_attributes: {
    url: 'https://example.com/unused',
    active: false,
  },
  public: true,
  default_permissions: {
    organization_administration: 'read',
    members: 'read',
    organization_custom_properties: 'read',
    secrets: 'read',
    metadata: 'read',
    administration: 'read',
    actions: 'read',
    security_events: 'read',
    packages: 'read',
  },
  default_events: [],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    const permissionsSummary = Object.entries(
      defaultManifestTemplate.default_permissions ?? {},
    )
      .map(([k, v]) => `<li><code>${k}</code>: ${v}</li>`)
      .join('');
    const titleText = loadedCustomManifest
      ? `Recreate Custom GitHub App (${loadedSourceSlug})`
      : 'Register GHEC Discovery App';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Register GitHub App — GHEC Consultant Suite</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 40px auto; padding: 24px; line-height: 1.5; color: #24292f; }
    h2 { margin-bottom: 6px; }
    p.subtitle { color: #57606a; margin-top: 0; margin-bottom: 20px; }
    label { font-weight: 600; display: block; margin-top: 14px; margin-bottom: 6px; font-size: 14px; }
    input[type="text"] { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 14px; }
    input[type="text"]:focus { outline: none; border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,0.3); }
    .radio-group { display: flex; gap: 16px; margin-bottom: 12px; font-size: 14px; }
    .box { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 14px 16px; margin: 18px 0; font-size: 13px; }
    .box ul { margin: 6px 0; padding-left: 18px; }
    button { background-color: #2da44e; color: white; border: 1px solid rgba(27,31,36,0.15); border-radius: 6px; padding: 10px 20px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 16px; }
    button:hover { background-color: #2c974b; }
  </style>
</head>
<body>
  <h2>${titleText}</h2>
  <p class="subtitle">Automated setup via GitHub App Manifest</p>

  <form id="setup-form" method="post">
    <label>Account Type:</label>
    <div class="radio-group">
      <label style="font-weight: normal; margin: 0; cursor: pointer;">
        <input type="radio" name="accountType" value="org" checked> Organization
      </label>
      <label style="font-weight: normal; margin: 0; cursor: pointer;">
        <input type="radio" name="accountType" value="personal"> Personal Account
      </label>
    </div>

    <div id="orgGroup">
      <label for="orgInput">Target Organization Name:</label>
      <input type="text" id="orgInput" placeholder="e.g. acme-corp" value="${INITIAL_ORG}" required>
    </div>

    <label for="appNameInput">App Name (max 34 chars):</label>
    <input type="text" id="appNameInput" maxlength="34" placeholder="ghec-discovery-app" value="${defaultManifestTemplate.name}">

    <div class="box">
      <strong>Preconfigured Manifest Permissions:</strong>
      <ul>
        ${permissionsSummary || '<li><em>No special permissions requested</em></li>'}
      </ul>
      <em>Events: ${(defaultManifestTemplate.default_events ?? []).join(', ') || 'none'}</em>
    </div>

    <input type="hidden" name="manifest" id="manifestInput">
    <button type="submit" id="submitBtn">Continue to GitHub to Create App</button>
  </form>

  <script>
    const baseManifest = ${JSON.stringify(defaultManifestTemplate)};
    const form = document.getElementById('setup-form');
    const orgGroup = document.getElementById('orgGroup');
    const orgInput = document.getElementById('orgInput');
    const appNameInput = document.getElementById('appNameInput');
    const manifestInput = document.getElementById('manifestInput');
    const accountRadios = document.getElementsByName('accountType');

    function updateVisibility() {
      const isOrg = document.querySelector('input[name="accountType"]:checked').value === 'org';
      orgGroup.style.display = isOrg ? 'block' : 'none';
      orgInput.required = isOrg;
    }

    accountRadios.forEach(r => r.addEventListener('change', updateVisibility));
    updateVisibility();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const isOrg = document.querySelector('input[name="accountType"]:checked').value === 'org';
      const org = orgInput.value.trim();
      const appName = (appNameInput.value.trim() || baseManifest.name || 'ghec-discovery-app').slice(0, 34);

      if (isOrg && !org) {
        alert('Please enter an organization name.');
        return;
      }

      const manifest = {
        ...baseManifest,
        name: appName,
        redirect_url: 'http://localhost:${PORT}/callback',
      };

      manifestInput.value = JSON.stringify(manifest);

      let actionUrl = '';
      if (isOrg) {
        actionUrl = 'https://github.com/organizations/' + encodeURIComponent(org) + '/settings/apps/new?state=${STATE}';
      } else {
        actionUrl = 'https://github.com/settings/apps/new?state=${STATE}';
      }

      form.action = actionUrl;
      document.getElementById('submitBtn').disabled = true;
      document.getElementById('submitBtn').textContent = 'Redirecting to GitHub...';
      form.submit();
    });
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (!code || returnedState !== STATE || !isValidManifestCode(code)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request, invalid code format, or state mismatch.');
      return;
    }

    try {
      console.log(
        'Exchanging temporary manifest code for App ID and Private Key...',
      );
      const conversionUrl = buildConversionUrl(code);
      const response = await fetch(conversionUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-suite-setup',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to convert code: ${response.status} ${errorText}`,
        );
      }

      const appData = await response.json();
      const { id, slug, pem, owner } = appData;
      const ownerLogin = owner?.login || 'your organization';
      const { idSecret, keySecret } = buildSecretNamesForApp(loadedSourceSlug);

      console.log(
        `\n✔ GitHub App "${slug}" (ID: ${id}) successfully registered!`,
      );

      // Automatically store secrets in GitHub repo using gh CLI (DEC-004: never write pem to disk)
      let secretsSaved = false;
      try {
        console.log(
          `Configuring repository secrets (${idSecret} and ${keySecret})...`,
        );
        execFileSync('gh', ['secret', 'set', idSecret], {
          input: String(id),
          stdio: ['pipe', 'inherit', 'inherit'],
        });
        execFileSync('gh', ['secret', 'set', keySecret], {
          input: pem,
          stdio: ['pipe', 'inherit', 'inherit'],
        });
        secretsSaved = true;
        console.log('✔ Repository secrets successfully set!');
      } catch {
        console.warn(
          `⚠️ Could not automatically set secrets via gh CLI. You can set ${idSecret} and ${keySecret} manually in repository settings.`,
        );
      }

      const installUrl = `https://github.com/apps/${slug}/installations/new`;
      console.log(`\n👉 Next Step: Install the App on "${ownerLogin}":`);
      console.log(`   ${installUrl}\n`);

      const successHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>App Registered Successfully</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; line-height: 1.5; color: #24292f; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #dafbe1; color: #1a7f37; font-weight: 600; margin-bottom: 12px; }
    .btn { display: inline-block; background-color: #0969da; color: white; text-decoration: none; border-radius: 6px; padding: 12px 24px; font-weight: 600; margin-top: 16px; }
    .btn:hover { background-color: #0860ca; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="badge">✔ Registration Complete</div>
  <h2>GitHub App Registered: <code>${slug}</code></h2>
  <p>App ID: <strong>${id}</strong></p>
  <p>${secretsSaved ? `✔ Repository secrets <code>${idSecret}</code> and <code>${keySecret}</code> were configured automatically.` : `Please configure <code>${idSecret}</code> and <code>${keySecret}</code> in repository settings.`}</p>
  
  <h3>Final Step:</h3>
  <p>Install the app on your organization or account:</p>
  <a class="btn" href="${installUrl}" target="_blank">Install App</a>
  
  <p style="margin-top: 30px; font-size: 13px; color: #57606a;">You can close this tab and return to your terminal.</p>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(successHtml);

      // Gracefully close server after 2 seconds
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 2000);
    } catch (err) {
      console.error('Error during app conversion:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error creating app: ${err.message}`);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

export function startServer(port = PORT) {
  return server.listen(port, () => {
    const localUrl = `http://localhost:${port}`;
    console.log(`\n======================================================`);
    console.log(`🚀 GitHub App Manifest Setup Helper`);
    if (INITIAL_ORG) {
      console.log(`Pre-selected Organization: ${INITIAL_ORG}`);
    }
    if (loadedCustomManifest) {
      console.log(
        `Loaded Custom App Manifest: ${loadedCustomManifest.name} (from ${loadedSourceSlug})`,
      );
    }
    console.log(`Opening setup page in your browser: ${localUrl}`);
    console.log(`======================================================\n`);

    // Try opening browser automatically
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    execFile(opener, [localUrl], (err) => {
      if (err) {
        console.log(`Please open this URL in your browser: ${localUrl}`);
      }
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer(PORT);
}
