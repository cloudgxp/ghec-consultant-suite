import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error register-app is an mjs script
import {
  isValidManifestCode,
  buildConversionUrl,
  parseRegisterAppArgs,
  extractManifestFromArtifact,
  buildSecretNamesForApp,
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

test('parseRegisterAppArgs parses --org, --manifest-file, --app, and --port flags', () => {
  const parsed = parseRegisterAppArgs([
    '--org',
    'target-emu-org',
    '--manifest-file',
    './migration-output/advisory/migration-advisory-report.json',
    '--app',
    'internal-deploy-bot',
    '--port',
    '4100',
  ]);

  assert.equal(parsed.targetOrg, 'target-emu-org');
  assert.equal(
    parsed.manifestFile,
    './migration-output/advisory/migration-advisory-report.json',
  );
  assert.equal(parsed.appSlug, 'internal-deploy-bot');
  assert.equal(parsed.port, 4100);
});

test('extractManifestFromArtifact extracts manifest from advisory report and migration plan JSON', () => {
  const advisoryReport = {
    reportVersion: '1.0.0',
    sourceOrg: 'source-org',
    targetOrg: 'target-emu-org',
    apps: [
      {
        slug: 'internal-deploy-bot',
        recreatedSlug: 'internal-deploy-bot-target-emu',
        manifest: {
          name: 'internal-deploy-bot-target-emu',
          url: 'https://github.com',
          public: false,
          default_permissions: { deployments: 'write' },
          default_events: ['deployment'],
        },
      },
    ],
  };

  const fromAdvisory = extractManifestFromArtifact(
    advisoryReport,
    'internal-deploy-bot',
  );
  assert.equal(fromAdvisory.targetOrg, 'target-emu-org');
  assert.equal(fromAdvisory.sourceSlug, 'internal-deploy-bot');
  assert.equal(fromAdvisory.manifest.name, 'internal-deploy-bot-target-emu');

  const migrationPlan = {
    schemaVersion: '1.0.0',
    modulePlans: [
      {
        moduleId: 'apps-inventory',
        targetIdentifier: 'target-emu-org',
        operations: [
          {
            id: 'op-advisory-app-release-bot',
            resourceName: 'release-bot',
            operation: 'warn',
            payload: {
              app_slug: 'release-bot',
              recreated_app_slug: 'release-bot-target-emu-org',
              manifest: {
                name: 'release-bot-target-emu-org',
                url: 'https://github.com',
                public: false,
                default_permissions: { contents: 'write' },
                default_events: ['release'],
              },
            },
          },
        ],
      },
    ],
  };

  const fromPlan = extractManifestFromArtifact(migrationPlan, 'release-bot');
  assert.equal(fromPlan.targetOrg, 'target-emu-org');
  assert.equal(fromPlan.sourceSlug, 'release-bot');
  assert.equal(fromPlan.manifest.name, 'release-bot-target-emu-org');
});

test('buildSecretNamesForApp generates collision-safe GitHub secret names', () => {
  assert.deepEqual(buildSecretNamesForApp(''), {
    idSecret: 'GHEC_APP_ID',
    keySecret: 'GHEC_APP_PRIVATE_KEY',
  });
  assert.deepEqual(buildSecretNamesForApp('internal-deploy-bot'), {
    idSecret: 'GHEC_APP_INTERNAL_DEPLOY_BOT_ID',
    keySecret: 'GHEC_APP_INTERNAL_DEPLOY_BOT_PRIVATE_KEY',
  });
});
