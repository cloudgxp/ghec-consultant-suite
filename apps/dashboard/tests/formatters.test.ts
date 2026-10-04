import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimestamp } from '../src/lib/formatters.js';

test('formatTimestamp returns "Unknown" for falsy values', () => {
  assert.equal(formatTimestamp(), 'Unknown');
  assert.equal(formatTimestamp(null), 'Unknown');
  assert.equal(formatTimestamp(''), 'Unknown');
});

test('formatTimestamp formats valid ISO strings correctly', () => {
  assert.equal(
    formatTimestamp('2023-10-04T13:34:00.000Z'),
    '2023-10-04 13:34:00 UTC',
  );
  assert.equal(
    formatTimestamp('2023-10-04T13:34:00Z'),
    '2023-10-04 13:34:00 UTC',
  );
});

test('formatTimestamp returns original string for invalid date strings', () => {
  assert.equal(formatTimestamp('invalid date'), 'invalid date');
  assert.equal(formatTimestamp('not-a-date'), 'not-a-date');
});

test('formatTimestamp handles exceptions and returns original input', () => {
  // An object that throws when converted to a primitive/string
  const throwingObj = {
    toString: () => {
      throw new Error('Conversion error');
    },
  };
  // @ts-expect-error Intentionally passing invalid type to trigger catch block
  assert.equal(formatTimestamp(throwingObj), throwingObj);

  // Symbol also throws when Date attempts to convert it to a number/string
  const sym = Symbol('test');
  // @ts-expect-error Intentionally passing Symbol to trigger catch block
  assert.equal(formatTimestamp(sym), sym);
});
