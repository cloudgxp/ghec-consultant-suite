import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { createGitHubAppJwt, GitHubAppAuthProvider } from '../src/index.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

test('creates an RS256 GitHub App JWT using native crypto', () => {
  const jwt = createGitHubAppJwt('12345', privateKey);
  const [header, payload, signature] = jwt.split('.');
  assert.ok(header && payload && signature);
  assert.equal(
    JSON.parse(Buffer.from(header, 'base64url').toString()).alg,
    'RS256',
  );
  assert.equal(
    JSON.parse(Buffer.from(payload, 'base64url').toString()).iss,
    '12345',
  );

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature, 'base64url'), true);
});

test('caches a healthy installation token and refreshes one expiring within five minutes', async () => {
  let calls = 0;
  let expiryMinutes = 60;
  const provider = new GitHubAppAuthProvider(
    { appId: '12345', installationId: '67890', privateKey },
    {
      fetchImpl: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            token: `ghs_${'a'.repeat(24)}${calls}`,
            expires_at: new Date(
              Date.now() + expiryMinutes * 60_000,
            ).toISOString(),
          }),
          { status: 201 },
        );
      },
    },
  );

  const first = await provider.getToken();
  const cached = await provider.getToken();
  assert.equal(first, cached);
  assert.equal(calls, 1);

  expiryMinutes = 3;
  const shortLivedProvider = new GitHubAppAuthProvider(
    { appId: '12345', installationId: '67890', privateKey },
    {
      fetchImpl: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            token: `ghs_${'b'.repeat(24)}${calls}`,
            expires_at: new Date(
              Date.now() + expiryMinutes * 60_000,
            ).toISOString(),
          }),
          { status: 201 },
        );
      },
    },
  );
  await shortLivedProvider.getToken();
  expiryMinutes = 60;
  await shortLivedProvider.getToken();
  assert.equal(calls, 3, 'a short-lived token must be refreshed');
});

test('sanitizes credentials from GitHub App authentication failures', async () => {
  const secretToken = `ghs_${'c'.repeat(30)}`;
  const provider = new GitHubAppAuthProvider(
    { appId: '12345', installationId: '67890', privateKey },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: secretToken }), { status: 401 }),
    },
  );

  await assert.rejects(provider.getToken(), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.doesNotMatch(message, new RegExp(secretToken));
    assert.doesNotMatch(message, /BEGIN PRIVATE KEY/);
    assert.match(message, /REDACTED_TOKEN/);
    return true;
  });
});
