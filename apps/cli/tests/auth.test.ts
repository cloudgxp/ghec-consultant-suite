import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createGitHubAppJwt,
  GitHubAppAuthProvider,
} from '../src/github/auth.js';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import { loadConfig, sanitizeDiagnostics } from '../src/config/index.js';
import { HttpGitHubReadAdapter } from '../src/github/http.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';

// Generate a valid RSA keypair offline for cryptographic tests
const { privateKey: testPrivateKey, publicKey: testPublicKey } =
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

test('createGitHubAppJwt generates a valid RS256 JWT verifiable with public key', () => {
  const appId = '123456';
  const token = createGitHubAppJwt(appId, testPrivateKey);

  assert.ok(token);
  const parts = token.split('.');
  assert.equal(parts.length, 3);

  // 1. Verify header
  const header = JSON.parse(
    Buffer.from(parts[0]!, 'base64url').toString('utf8'),
  );
  assert.equal(header.alg, 'RS256');
  assert.equal(header.typ, 'JWT');

  // 2. Verify payload claims
  const payload = JSON.parse(
    Buffer.from(parts[1]!, 'base64url').toString('utf8'),
  );
  assert.equal(payload.iss, appId);
  const now = Math.floor(Date.now() / 1000);
  // iat is issued in past (-60s)
  assert.ok(payload.iat <= now);
  assert.ok(payload.iat >= now - 120);
  // exp is +10 minutes
  assert.ok(payload.exp > now);
  assert.ok(payload.exp <= now + 600);

  // 3. Cryptographically verify signature using public key
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const isValid = verifier.verify(testPublicKey, parts[2]!, 'base64url');
  assert.equal(isValid, true, 'JWT signature must be valid against public key');
});

test('parseDiscoveryOptions and loadConfig parse and resolve GitHub App CLI options and env vars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-auth-config-'));
  try {
    const keyFile = join(dir, 'test-key.pem');
    writeFileSync(keyFile, testPrivateKey, 'utf8');

    // 1. CLI options parsing
    const plan = parseDiscoveryOptions([
      '--organization',
      'acme-corp',
      '--modules',
      'orgs',
      '--app-id',
      '998877',
      '--private-key-path',
      keyFile,
      '--installation-id',
      '554433',
    ]);

    assert.equal(plan.appId, '998877');
    assert.equal(plan.privateKeyPath, keyFile);
    assert.equal(plan.installationId, '554433');

    // 2. Configuration resolution from options
    const config = loadConfig({
      appId: plan.appId,
      privateKeyPath: plan.privateKeyPath,
      installationId: plan.installationId,
    });

    assert.ok(config.app);
    assert.equal(config.app?.appId, '998877');
    assert.equal(config.app?.installationId, '554433');
    assert.equal(config.app?.privateKey, testPrivateKey.trim());

    // 3. Incomplete configuration throws descriptive error
    assert.throws(
      () =>
        loadConfig({
          appId: '998877',
          // missing key and installationId
        }),
      /Incomplete GitHub App configuration/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sanitizeDiagnostics redacts private keys, JWTs, and installation tokens', () => {
  const rawKey = testPrivateKey;
  const rawJwt = createGitHubAppJwt('123', testPrivateKey);
  const rawToken = 'ghs_ABC1234567890abcdef1234567890ABCDEF';

  const logMessage = `Auth failed with key: ${rawKey} and jwt: ${rawJwt} and token: ${rawToken}`;
  const sanitized = sanitizeDiagnostics(logMessage);

  assert.doesNotMatch(sanitized, /BEGIN (?:RSA )?PRIVATE KEY/);
  assert.doesNotMatch(sanitized, /ghs_ABC/);
  assert.match(sanitized, /\[REDACTED_PRIVATE_KEY\]/);
  assert.match(sanitized, /\[REDACTED_JWT\]/);
  assert.match(sanitized, /\[REDACTED_TOKEN\]/);
});

test('GitHubAppAuthProvider exchanges JWT for installation token and caches it', async () => {
  let tokenCallCount = 0;
  const mockFetch: typeof globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/app/installations/777/access_tokens')) {
      tokenCallCount++;
      const authHeader = (init?.headers as Record<string, string>)?.[
        'Authorization'
      ];
      assert.ok(authHeader?.startsWith('Bearer ey'));

      return new Response(
        JSON.stringify({
          token: 'ghs_mockInstallationToken12345',
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour lifetime
          permissions: { organization_administration: 'read' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  };

  const provider = new GitHubAppAuthProvider(
    {
      appId: '12345',
      installationId: '777',
      privateKey: testPrivateKey,
    },
    { fetchImpl: mockFetch },
  );

  // 1. First call: fetches fresh token
  const token1 = await provider.getToken();
  assert.equal(token1, 'ghs_mockInstallationToken12345');
  assert.equal(tokenCallCount, 1);

  // 2. Second call: uses in-memory cache (lifetime > 5m remaining)
  const token2 = await provider.getToken();
  assert.equal(token2, 'ghs_mockInstallationToken12345');
  assert.equal(tokenCallCount, 1); // No new network call
});

test('GitHubAppAuthProvider automatically refreshes token when within 5 minutes of expiration', async () => {
  let tokenCallCount = 0;
  let nextExpiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 minutes remaining (< 5m threshold)

  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/app/installations/777/access_tokens')) {
      tokenCallCount++;
      return new Response(
        JSON.stringify({
          token: `ghs_token_iteration_${tokenCallCount}`,
          expires_at: nextExpiresAt,
          permissions: {},
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  };

  const provider = new GitHubAppAuthProvider(
    {
      appId: '12345',
      installationId: '777',
      privateKey: testPrivateKey,
    },
    { fetchImpl: mockFetch },
  );

  // First fetch gets token expiring in 3 minutes
  const token1 = await provider.getToken();
  assert.equal(token1, 'ghs_token_iteration_1');
  assert.equal(tokenCallCount, 1);

  // Next fetch will notice < 5 minutes remaining and refresh
  nextExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // New token gets 1h
  const token2 = await provider.getToken();
  assert.equal(token2, 'ghs_token_iteration_2');
  assert.equal(tokenCallCount, 2); // Refreshed!
});

test('HttpGitHubReadAdapter seamlessly uses GitHubAppAuthProvider on requests', async () => {
  let receivedAuthHeader: string | undefined;

  const mockFetch: typeof globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/app/installations/999/access_tokens')) {
      return new Response(
        JSON.stringify({
          token: 'ghs_dynamicTokenABC',
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/graphql')) {
      receivedAuthHeader = (init?.headers as Record<string, string>)?.[
        'authorization'
      ];
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4999,
              resetAt: new Date().toISOString(),
            },
            viewer: { login: 'app-bot' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('{}', { status: 200 });
  };

  const authProvider = new GitHubAppAuthProvider(
    {
      appId: '54321',
      installationId: '999',
      privateKey: testPrivateKey,
    },
    { fetchImpl: mockFetch },
  );

  const adapter = new HttpGitHubReadAdapter({
    authProvider,
    fetchImpl: mockFetch,
  });

  const res = await adapter.queryGraphQL<{ viewer: { login: string } }>(
    'query { viewer { login } }',
    {},
    new AbortController().signal,
  );

  assert.equal(res.data.viewer.login, 'app-bot');
  assert.equal(receivedAuthHeader, 'Bearer ghs_dynamicTokenABC');
});

test('DiscoveryOrchestrator capability preflight check verifies probe and outputs executive plan', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'fictional-north',
    '--modules',
    'orgs,repos,teams,actions',
    '--dry-run',
  ]);

  const outputLogs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    outputLogs.push(args.join(' '));
  };

  try {
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (bodyStr.includes('PreflightProbe')) {
        return new Response(
          JSON.stringify({
            data: {
              rateLimit: {
                limit: 5000,
                cost: 1,
                remaining: 4850,
                resetAt: '2026-03-10T14:00:00Z',
              },
              viewer: { login: 'consultant-service-app' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (bodyStr.includes('ProbeOrg')) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                name: 'Fictional North Corp',
                repositories: { totalCount: 25 },
                teams: { totalCount: 6 },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200 });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'valid-test-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'valid-test-token',
      },
      adapter,
    );

    await orchestrator.executeDryRun(new AbortController().signal);

    const fullOutput = outputLogs.join('\n');
    assert.match(fullOutput, /PREFLIGHT DISCOVERY PLAN/);
    assert.match(fullOutput, /Target Scope:\s+ORGANIZATION "fictional-north"/);
    assert.match(fullOutput, /Verified Target Name:\s+Fictional North Corp/);
    assert.match(
      fullOutput,
      /Authenticated Identity:\s+User: @consultant-service-app/,
    );
    assert.match(fullOutput, /Rate Limit Balance:\s+4,850 \/ 5,000 points/);
    assert.match(fullOutput, /Discovered Repositories:\s+25 repositories/);
    assert.match(fullOutput, /Discovered Teams:\s+6 teams/);
    assert.match(fullOutput, /Estimated API Volume:\s+~\d+ API requests/);
    assert.match(fullOutput, /Proven Permissions & Standards:/);
  } finally {
    console.log = originalLog;
  }
});

test('DiscoveryOrchestrator executeDryRun rejects invalid credentials with sanitized diagnostic error', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'fictional-north',
    '--modules',
    'orgs',
    '--dry-run',
  ]);

  const mockFetch: typeof globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        message: 'Bad credentials',
        documentation_url: 'https://docs.github.com/rest',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'invalid-token-12345',
    fetchImpl: mockFetch,
  });

  const orchestrator = new DiscoveryOrchestrator(
    plan,
    {
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
      token: 'invalid-token-12345',
    },
    adapter,
  );

  await assert.rejects(
    () => orchestrator.executeDryRun(new AbortController().signal),
    (err: Error) => {
      assert.match(err.message, /Authentication failed/);
      assert.doesNotMatch(err.message, /invalid-token-12345/);
      return true;
    },
  );
});
