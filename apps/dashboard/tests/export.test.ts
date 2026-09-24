import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvField } from '../src/lib/export-csv.js';

test('sanitizeCsvField neutralizes formula injection', () => {
  assert.equal(sanitizeCsvField('=1+2'), "'=1+2");
  assert.equal(sanitizeCsvField('+1+2'), "'+1+2");
  assert.equal(sanitizeCsvField('-5*10'), "'-5*10");
  assert.equal(sanitizeCsvField('@SUM(A1:A5)'), "'@SUM(A1:A5)");
  assert.equal(sanitizeCsvField('\tCMD'), "'\tCMD");
});

test('sanitizeCsvField quotes and escapes delimiters and quotes', () => {
  assert.equal(sanitizeCsvField('hello, world'), '"hello, world"');
  assert.equal(
    sanitizeCsvField('hello "quoted" world'),
    '"hello ""quoted"" world"',
  );
  assert.equal(sanitizeCsvField('line 1\nline 2'), '"line 1\nline 2"');
});

test('sanitizeCsvField handles null and undefined safely', () => {
  assert.equal(sanitizeCsvField(null), '');
  assert.equal(sanitizeCsvField(undefined), '');
  assert.equal(sanitizeCsvField('normal text'), 'normal text');
});
