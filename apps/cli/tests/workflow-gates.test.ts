import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('User Story 2: Workflow Aggregation & Strict Final Exit Gates', () => {
  const rootDir = resolve(import.meta.dirname, '../../..');
  const e2eWorkflowPath = resolve(
    rootDir,
    '.github/workflows/migration-e2e-autonomous.yml',
  );
  const executeWavePath = resolve(
    rootDir,
    '.github/workflows/migration-execute-wave.yml',
  );
  const applyRemediationPath = resolve(
    rootDir,
    '.github/workflows/migration-apply-remediation.yml',
  );

  it('migration-e2e-autonomous.yml aggregates cohort reports, passes --execution-reports, logs remediation rounds, and enforces Strict Verification & Execution Gate after artifact upload', () => {
    const content = readFileSync(e2eWorkflowPath, 'utf8');

    assert.match(content, /name:\s+Aggregate Cohort Execution Reports/);
    assert.match(content, /aggregated-cohort-failures\.json/);
    assert.match(content, /--execution-reports \.\/downloaded-cohorts/);
    assert.match(content, /round-\$\{ROUND\}-execution\.log/);

    const uploadIdx = content.indexOf('name: Upload Final Audit Artifacts');
    const gateIdx = content.indexOf(
      'name: Strict Verification & Execution Gate',
    );
    assert.ok(uploadIdx > 0, 'Upload Final Audit Artifacts step must exist');
    assert.ok(
      gateIdx > uploadIdx,
      'Strict Verification & Execution Gate must appear after Upload Final Audit Artifacts',
    );
    assert.match(content, /::error::Strict Verification Gate Failed:/);
  });

  it('migration-execute-wave.yml enables --verbose, passes --execution-reports, fixes jq queries, and enforces Strict Verification & Execution Gate after artifact upload', () => {
    const content = readFileSync(executeWavePath, 'utf8');

    assert.match(content, /--execution-reports \.\/downloaded-cohorts/);
    assert.match(content, /\.overallStatus \/\/ \.status/);
    assert.match(content, /\.summary\.discrepancyCount/);
    assert.match(content, /\.summary\.unverifiedModuleCount/);

    const uploadIdx = content.indexOf(
      'name: Upload Final Consolidated Artifacts',
    );
    const gateIdx = content.indexOf(
      'name: Strict Verification & Execution Gate',
    );
    assert.ok(
      uploadIdx > 0,
      'Upload Final Consolidated Artifacts step must exist',
    );
    assert.ok(
      gateIdx > uploadIdx,
      'Strict Verification & Execution Gate must appear after Upload Final Consolidated Artifacts',
    );
  });

  it('migration-apply-remediation.yml logs remediation output, enables --verbose, and enforces Strict Verification & Execution Gate after artifact upload', () => {
    const content = readFileSync(applyRemediationPath, 'utf8');

    assert.match(content, /apply-remediation-execution\.log/);
    assert.match(content, /--verbose/);

    const uploadIdx = content.indexOf('name: Upload Remediation Results');
    const gateIdx = content.indexOf(
      'name: Strict Verification & Execution Gate',
    );
    assert.ok(uploadIdx > 0, 'Upload Remediation Results step must exist');
    assert.ok(
      gateIdx > uploadIdx,
      'Strict Verification & Execution Gate must appear after Upload Remediation Results',
    );
    assert.match(
      content,
      /::error::Strict Post-Remediation Verification Gate Failed:/,
    );
  });
});
