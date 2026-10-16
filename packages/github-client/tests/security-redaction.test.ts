import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeDiagnostics } from '../src/index.js';

describe('Security & Diagnostic Scrubbing (DEC-004)', () => {
  it('redacts classic and GitHub personal access tokens', () => {
    const raw =
      'Error authenticating with ghp_123456789012345678901234567890123456';
    const sanitized = sanitizeDiagnostics(raw);
    assert.doesNotMatch(sanitized, /ghp_/);
    assert.match(sanitized, /\[REDACTED_TOKEN\]/);

    const rawPat =
      'Error authenticating with github_pat_11AAAAAAA0000000000000_12345678901234567890123456789012345678901234567890123456789012';
    const sanitizedPat = sanitizeDiagnostics(rawPat);
    assert.doesNotMatch(sanitizedPat, /github_pat_/);
    assert.match(sanitizedPat, /\[REDACTED_TOKEN\]/);
  });

  it('redacts URL-embedded access tokens', () => {
    const raw =
      'Cloning from https://x-access-token:ghp_secretTokenVal1234567890@github.com/org/repo.git failed';
    const sanitized = sanitizeDiagnostics(raw);
    assert.doesNotMatch(sanitized, /secretTokenVal/);
    assert.match(sanitized, /https:\/\/\*\*\*@github\.com\/org\/repo\.git/);
  });

  it('redacts Authorization bearer and token headers', () => {
    const bearer =
      'Failed request with header Authorization: Bearer abcdef1234567890xyz';
    const sanitizedBearer = sanitizeDiagnostics(bearer);
    assert.doesNotMatch(sanitizedBearer, /abcdef1234567890xyz/);
    assert.match(sanitizedBearer, /Bearer\s+\[REDACTED_TOKEN\]/);

    const token = 'Header Authorization: token 1234567890abcdef123456';
    const sanitizedToken = sanitizeDiagnostics(token);
    assert.doesNotMatch(sanitizedToken, /1234567890abcdef123456/);
    assert.match(sanitizedToken, /token\s+\[REDACTED_TOKEN\]/);
  });

  it('redacts private keys and JSON Web Tokens', () => {
    const pk =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    const sanitizedPk = sanitizeDiagnostics(pk);
    assert.doesNotMatch(sanitizedPk, /MIIEow/);
    assert.match(sanitizedPk, /\[REDACTED_PRIVATE_KEY\]/);
  });
});
