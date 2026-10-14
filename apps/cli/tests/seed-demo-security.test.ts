import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sodium from 'libsodium-wrappers';
import { encryptSecret } from '../src/commands/seeder/client.js';
import { sanitizeDiagnostics } from '@ghec/github-client';

describe('Seed Demo Security & Zero-Exposure (DEC-004)', () => {
  it('encrypts secrets via libsodium sealed-box ensuring write-only confidentiality', async () => {
    await sodium.ready;
    const keypair = sodium.crypto_box_keypair();
    const publicKeyBase64 = sodium.to_base64(
      keypair.publicKey,
      sodium.base64_variants.ORIGINAL,
    );

    const plaintext = 'super-sensitive-secret-token-12345';
    const ciphertextBase64 = await encryptSecret(plaintext, publicKeyBase64);

    assert.ok(ciphertextBase64.length > 0);
    assert.ok(
      !ciphertextBase64.includes(plaintext),
      'Ciphertext must NEVER contain plaintext',
    );

    // Decrypt using private key to verify validity of the sealed box
    const ciphertextBytes = sodium.from_base64(
      ciphertextBase64,
      sodium.base64_variants.ORIGINAL,
    );
    const decryptedBytes = sodium.crypto_box_seal_open(
      ciphertextBytes,
      keypair.publicKey,
      keypair.privateKey,
    );
    const decryptedText = sodium.to_string(decryptedBytes);
    assert.equal(decryptedText, plaintext);
  });

  it('redacts tokens and credentials from diagnostic outputs and errors', () => {
    const rawError =
      'Failed connecting to https://ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com with token ghp_111122223333444455556666777788889999';
    const sanitized = sanitizeDiagnostics(rawError);

    assert.ok(!sanitized.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
    assert.ok(!sanitized.includes('ghp_111122223333444455556666777788889999'));
    assert.ok(sanitized.includes('***@github.com'));
    assert.ok(sanitized.includes('[REDACTED_TOKEN]'));
  });

  it('redacts Authorization headers with bearer tokens', () => {
    const rawAuth = 'Authorization: Bearer ghp_sampletokenstring1234567890';
    const sanitized = sanitizeDiagnostics(rawAuth);

    assert.ok(!sanitized.includes('ghp_sampletokenstring1234567890'));
    assert.ok(sanitized.includes('Bearer [REDACTED_TOKEN]'));
  });
});
