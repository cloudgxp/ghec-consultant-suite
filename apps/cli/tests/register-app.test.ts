import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error register-app is an mjs script
import {
  isValidManifestCode,
  buildConversionUrl,
} from '../../../scripts/register-app.mjs';

test('isValidManifestCode accepts legitimate GitHub manifest temporary codes', () => {
  assert.equal(isValidManifestCode('abc123XYZ'), true);
  assert.equal(isValidManifestCode('code-with-dashes'), true);
  assert.equal(isValidManifestCode('code_with_underscores-123'), true);
});

test('isValidManifestCode rejects invalid, empty, or malicious code strings', () => {
  assert.equal(isValidManifestCode(''), false);
  assert.equal(isValidManifestCode(null), false);
  assert.equal(isValidManifestCode(undefined), false);
  assert.equal(isValidManifestCode('../escape'), false);
  assert.equal(isValidManifestCode('code;rm -rf /'), false);
  assert.equal(isValidManifestCode('code\nnewline'), false);
  assert.equal(isValidManifestCode('code with spaces'), false);
  assert.equal(isValidManifestCode('code"quote'), false);
});

test('buildConversionUrl builds properly formatted conversion endpoints for valid codes', () => {
  const url = buildConversionUrl('temp-code-123');
  assert.equal(
    url,
    'https://api.github.com/app-manifests/temp-code-123/conversions',
  );
});

test('buildConversionUrl throws on invalid codes', () => {
  assert.throws(
    () => buildConversionUrl('../invalid-path'),
    /Invalid manifest code format/,
  );
});
