#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { exec, execSync } from 'node:child_process';

const PORT = 3000;
const INITIAL_ORG =
  process.argv[2]?.trim() || process.env.TARGET_ORG?.trim() || '';
const STATE = randomBytes(16).toString('hex');

// Dynamically determine repository homepage URL from git remote
let repoHomepage = 'https://github.com';
try {
  const remote = execSync('git config --get remote.origin.url', {
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
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
  <h2>Register GHEC Discovery App</h2>
  <p class="subtitle">Automated setup via GitHub App Manifest</p>

  <form id="setup-form" method="post">
    <label>Account Type:</label>
    <div class="radio-group">
      <label style="font-weight: normal; margin: 0; cursor: pointer;">
        <input type="radio" name="accountType" value="org" ${INITIAL_ORG ? 'checked' : 'checked'}> Organization
      </label>
      <label style="font-weight: normal; margin: 0; cursor: pointer;">
        <input type="radio" name="accountType" value="personal" ${!INITIAL_ORG ? '' : ''}> Personal Account
      </label>
    </div>

    <div id="orgGroup">
      <label for="orgInput">Target Organization Name:</label>
      <input type="text" id="orgInput" placeholder="e.g. acme-corp" value="${INITIAL_ORG}" required>
    </div>

    <label for="appNameInput">App Name:</label>
    <input type="text" id="appNameInput" placeholder="ghec-discovery-app" value="ghec-discovery-${Date.now().toString(36)}">

    <div class="box">
      <strong>Preconfigured Read-Only Permissions:</strong>
      <ul>
        <li>Organization: Administration, Members, Custom Properties, Secrets (metadata)</li>
        <li>Repository: Metadata, Administration, Actions, Security Events, Packages</li>
      </ul>
      <em>Webhooks will be disabled automatically.</em>
    </div>

    <input type="hidden" name="manifest" id="manifestInput">
    <button type="submit" id="submitBtn">Continue to GitHub to Create App</button>
  </form>

  <script>
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
      const appName = appNameInput.value.trim() || 'ghec-discovery-app';

      if (isOrg && !org) {
        alert('Please enter an organization name.');
        return;
      }

      const manifest = {
        name: appName,
        url: '${repoHomepage}',
        description: 'Automated discovery scanner for GHEC Consultant Suite',
        hook_attributes: {
          url: 'https://example.com/unused',
          active: false,
        },
        redirect_url: 'http://localhost:${PORT}/callback',
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

    if (!code || returnedState !== STATE) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request or state mismatch.');
      return;
    }

    try {
      console.log(
        'Exchanging temporary manifest code for App ID and Private Key...',
      );
      const response = await fetch(
        `https://api.github.com/app-manifests/${code}/conversions`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ghec-consultant-suite-setup',
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to convert code: ${response.status} ${errorText}`,
        );
      }

      const appData = await response.json();
      const { id, slug, pem, owner } = appData;
      const ownerLogin = owner?.login || 'your organization';

      console.log(
        `\n✔ GitHub App "${slug}" (ID: ${id}) successfully registered!`,
      );

      // Automatically store secrets in GitHub repo using gh CLI
      let secretsSaved = false;
      try {
        console.log(
          'Configuring repository secrets (GHEC_APP_ID and GHEC_APP_PRIVATE_KEY)...',
        );
        execSync(`gh secret set GHEC_APP_ID --body "${id}"`, {
          stdio: 'inherit',
        });
        execSync(`gh secret set GHEC_APP_PRIVATE_KEY --body "${pem}"`, {
          stdio: 'inherit',
        });
        secretsSaved = true;
        console.log('✔ Repository secrets successfully set!');
      } catch {
        console.warn(
          '⚠️ Could not automatically set secrets via gh CLI. You can set them manually in repository settings.',
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
  <p>${secretsSaved ? '✔ Repository secrets <code>GHEC_APP_ID</code> and <code>GHEC_APP_PRIVATE_KEY</code> were configured automatically.' : 'Please configure <code>GHEC_APP_ID</code> and <code>GHEC_APP_PRIVATE_KEY</code> in repository settings.'}</p>
  
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

server.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log(`\n======================================================`);
  console.log(`🚀 GitHub App Manifest Setup Helper`);
  if (INITIAL_ORG) {
    console.log(`Pre-selected Organization: ${INITIAL_ORG}`);
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
  exec(`${opener} ${localUrl}`, (err) => {
    if (err) {
      console.log(`Please open this URL in your browser: ${localUrl}`);
    }
  });
});
