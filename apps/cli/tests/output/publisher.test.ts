import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import {
  generateBundleFilename,
  type PublishOptions,
} from '../../src/output/publisher.js';

describe('generateBundleFilename', () => {
  it('should return resolved outputPath if it ends with .json', () => {
    const options: PublishOptions = {
      outputPath: 'my-custom-path.json',
      scopeKind: 'organization',
      scopeName: 'test-org',
      runId: '123',
      startedAt: '2024-01-01T12:00:00Z',
    };

    const result = generateBundleFilename(options);
    assert.equal(result, resolve('my-custom-path.json'));
  });

  it('should generate a correct filename for organization scope without trailing slash', () => {
    const options: PublishOptions = {
      outputPath: 'output-dir',
      scopeKind: 'organization',
      scopeName: 'test-org',
      runId: '12345',
      startedAt: '2024-01-01T12:00:00Z',
    };

    const result = generateBundleFilename(options);
    const expectedFilename =
      'ghec-discovery-organization-test-org-20240101T120000Z-12345.json';
    assert.equal(result, join(resolve('output-dir'), expectedFilename));
  });

  it('should generate a correct filename for enterprise scope', () => {
    const options: PublishOptions = {
      outputPath: 'out',
      scopeKind: 'enterprise',
      scopeName: 'my-enterprise',
      runId: '999',
      startedAt: '2024-12-31T23:59:59Z',
    };

    const result = generateBundleFilename(options);
    const expectedFilename =
      'ghec-discovery-enterprise-my-enterprise-20241231T235959Z-999.json';
    assert.equal(result, join(resolve('out'), expectedFilename));
  });

  it('should sanitize scopeName correctly', () => {
    const options: PublishOptions = {
      outputPath: 'dir',
      scopeKind: 'organization',
      scopeName: 'Bad Name!@# $%^',
      runId: '111',
      startedAt: '2024-01-01T12:00:00Z',
    };

    const result = generateBundleFilename(options);
    const expectedFilename =
      'ghec-discovery-organization-Bad_Name_______-20240101T120000Z-111.json';
    assert.equal(result, join(resolve('dir'), expectedFilename));
  });

  it('should correctly process startedAt timestamp with milliseconds', () => {
    const options: PublishOptions = {
      outputPath: 'dir',
      scopeKind: 'organization',
      scopeName: 'org',
      runId: '1',
      startedAt: '2024-05-10T08:30:15.123Z',
    };

    const result = generateBundleFilename(options);
    // The replace(/\..+/, '') in the code removes everything after the period, including the 'Z'
    // It is a bug in the code, but we're writing characterisation tests for existing behavior
    const expectedFilename =
      'ghec-discovery-organization-org-20240510T083015-1.json';
    assert.equal(result, join(resolve('dir'), expectedFilename));
  });

  it('should correctly process startedAt timestamp without Z', () => {
    const options: PublishOptions = {
      outputPath: 'dir',
      scopeKind: 'organization',
      scopeName: 'org',
      runId: '1',
      startedAt: '2024-05-10T08:30:15',
    };

    const result = generateBundleFilename(options);
    const expectedFilename =
      'ghec-discovery-organization-org-20240510T083015-1.json';
    assert.equal(result, join(resolve('dir'), expectedFilename));
  });
});
