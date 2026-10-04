import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateCustomPropertyMapping,
  validateMannequinReclamationPlan,
  validateModuleExecutionResult,
  validateVerificationReport,
} from '../src/index.js';

test('execution, mannequin, custom-property, and verification artifacts validate', () => {
  assert.equal(
    validateModuleExecutionResult({
      schemaVersion: '1.0.0',
      moduleId: 'repo-variables',
      status: 'complete',
      durationMs: 120,
      results: [
        {
          operationId: 'variable-1',
          status: 'succeeded',
          httpStatus: 201,
          completedAt: '2026-10-04T12:01:00Z',
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    validateMannequinReclamationPlan({
      schemaVersion: '1.0.0',
      targetOrg: 'contoso-engineering',
      identityStrategy: 'emu-saml',
      skipInvitation: true,
      entries: [
        {
          mannequinUser: 'monalisa',
          mannequinId: '123',
          targetUser: 'monalisa_contoso',
          status: 'completed',
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    validateCustomPropertyMapping({
      schemaVersion: '1.0.0',
      sourceOrg: 'acme-engineering',
      targetOrg: 'contoso-engineering',
      properties: [
        {
          sourceName: 'data-classification',
          targetName: 'data-classification',
          valueType: 'single_select',
          sourceValue: 'restricted',
          targetValue: 'restricted',
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    validateVerificationReport({
      schemaVersion: '1.0.0',
      reportId: 'verify-001',
      verifiedAt: '2026-10-04T12:02:00Z',
      scopeName: 'acme-to-contoso',
      sourceOrg: 'acme-engineering',
      targetOrg: 'contoso-engineering',
      modules: [
        { moduleId: 'repo-variables', verified: true, discrepancies: [] },
      ],
      summary: {
        verifiedModuleCount: 1,
        unverifiedModuleCount: 0,
        discrepancyCount: 0,
      },
    }).success,
    true,
  );
});

test('migration result artifacts reject malformed and inconsistent fields', () => {
  assert.equal(
    validateModuleExecutionResult({
      schemaVersion: '1.0.0',
      moduleId: 'repo-variables',
      status: 'failed',
      durationMs: 1,
      results: [
        {
          operationId: 'variable-1',
          status: 'failed',
          completedAt: '2026-10-04T12:01:00Z',
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    validateMannequinReclamationPlan({
      schemaVersion: '1.0.0',
      targetOrg: 'contoso-engineering',
      identityStrategy: 'emu-saml',
      skipInvitation: false,
      entries: [],
    }).success,
    false,
  );
  assert.equal(
    validateVerificationReport({
      schemaVersion: '1.0.0',
      reportId: 'verify-001',
      verifiedAt: '2026-10-04T12:02:00Z',
      scopeName: 'acme-to-contoso',
      sourceOrg: 'acme-engineering',
      targetOrg: 'contoso-engineering',
      modules: [
        { moduleId: 'repo-variables', verified: true, discrepancies: [] },
      ],
      summary: {
        verifiedModuleCount: 0,
        unverifiedModuleCount: 0,
        discrepancyCount: 0,
      },
    }).success,
    false,
  );
});
