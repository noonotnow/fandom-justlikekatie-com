/**
 * Tests for check-court-record.js
 *
 * Exercises decodeStringContent and checkArrayBody against synthetic array
 * bodies so that a refactor of either function cannot silently break the
 * whitespace-only detection that guards RACCOON_COURT_RECORD at lint time.
 *
 * Run via: npm run test:scripts
 *           npm test
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStringContent, checkArrayBody } from './check-court-record.js';

// ---------------------------------------------------------------------------
// decodeStringContent
// ---------------------------------------------------------------------------

test('decodeStringContent: returns plain text unchanged', () => {
  assert.equal(decodeStringContent('hello world'), 'hello world');
});

test('decodeStringContent: decodes \\n, \\t, \\r', () => {
  assert.equal(decodeStringContent('\\n'), '\n');
  assert.equal(decodeStringContent('\\t'), '\t');
  assert.equal(decodeStringContent('\\r'), '\r');
});

test('decodeStringContent: decodes \\v and \\f', () => {
  assert.equal(decodeStringContent('\\v'), '\v');
  assert.equal(decodeStringContent('\\f'), '\f');
});

test('decodeStringContent: decodes hex escapes \\xHH', () => {
  assert.equal(decodeStringContent('\\x20'), ' ');  // space
  assert.equal(decodeStringContent('\\x09'), '\t'); // tab
  assert.equal(decodeStringContent('\\x41'), 'A');
});

test('decodeStringContent: decodes \\uHHHH escapes', () => {
  assert.equal(decodeStringContent('\\u0020'), ' ');
  assert.equal(decodeStringContent('\\u0041'), 'A');
});

test('decodeStringContent: decodes \\u{HHHH} code-point escapes', () => {
  assert.equal(decodeStringContent('\\u{20}'), ' ');
  assert.equal(decodeStringContent('\\u{1F600}'), '😀');
});

test('decodeStringContent: identity escapes pass through', () => {
  assert.equal(decodeStringContent("\\'"), "'");
  assert.equal(decodeStringContent('\\"'), '"');
  assert.equal(decodeStringContent('\\\\'), '\\');
  assert.equal(decodeStringContent('\\`'), '`');
});

test('decodeStringContent: \\b and \\0 are not whitespace', () => {
  // backspace U+0008 and null U+0000 should not trim to empty
  const b = decodeStringContent('\\b');
  const z = decodeStringContent('\\0');
  assert.equal(b, '\b');
  assert.equal(z, '\0');
  assert.notEqual(b.trim(), '');
  assert.notEqual(z.trim(), '');
});

// ---------------------------------------------------------------------------
// checkArrayBody — whitespace-only detection
// ---------------------------------------------------------------------------

test('checkArrayBody: detects single-quoted spaces', () => {
  const body = `'   ',`;
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 1);
  assert.equal(whitespaceOnly[0], "'   '");
});

test('checkArrayBody: detects double-quoted spaces', () => {
  const body = `"  ",`;
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 1);
  assert.equal(whitespaceOnly[0], '"  "');
});

test('checkArrayBody: detects template-literal spaces', () => {
  const body = '`   `,';
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 1);
  assert.equal(whitespaceOnly[0], '`   `');
});

test('checkArrayBody: detects single-quoted \\t escape', () => {
  const { whitespaceOnly } = checkArrayBody("'\\t',");
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects single-quoted \\n escape', () => {
  const { whitespaceOnly } = checkArrayBody("'\\n',");
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects double-quoted \\t escape', () => {
  const { whitespaceOnly } = checkArrayBody('"\\t",');
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects template-literal \\t escape', () => {
  const { whitespaceOnly } = checkArrayBody('`\\t`,');
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects template-literal \\n escape', () => {
  const { whitespaceOnly } = checkArrayBody('`\\n`,');
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects \\u0020 (space via unicode escape)', () => {
  const { whitespaceOnly } = checkArrayBody('"\\u0020",');
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects \\x09 (tab via hex escape)', () => {
  const { whitespaceOnly } = checkArrayBody('"\\x09",');
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: detects mix of whitespace escapes', () => {
  const { whitespaceOnly } = checkArrayBody('"\\t\\n\\r",');
  assert.equal(whitespaceOnly.length, 1);
});

// ---------------------------------------------------------------------------
// checkArrayBody — valid rulings accepted
// ---------------------------------------------------------------------------

test('checkArrayBody: valid single-quoted ruling is not flagged', () => {
  const body = `'Case #001: Motion denied. — Chief Justice 🦝',`;
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: valid double-quoted ruling is not flagged', () => {
  const body = `"Case #017: Evidence inadmissible. — Clerk 🦝",`;
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: valid template-literal ruling is not flagged', () => {
  const body = '`Case #034: Order in the court. — Bailiff 🦝`,';
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: ruling with embedded \\n in the text is still valid', () => {
  // A ruling that has visible content before the whitespace escape
  const body = `"Case #042: Verdict.\\nSigned — Justice 🦝",`;
  const { whitespaceOnly } = checkArrayBody(body);
  assert.equal(whitespaceOnly.length, 0);
});

// ---------------------------------------------------------------------------
// checkArrayBody — mixed arrays
// ---------------------------------------------------------------------------

test('checkArrayBody: reports only whitespace-only entries in a mixed array', () => {
  const body = [
    `"Case #001: Valid ruling. — 🦝",`,
    `"   ",`,
    `"Case #002: Another valid ruling. — 🦝",`,
    `'\\t',`,
  ].join('\n');
  const { totalCount, whitespaceOnly } = checkArrayBody(body);
  assert.equal(totalCount, 4);
  assert.equal(whitespaceOnly.length, 2);
});

test('checkArrayBody: empty body returns zero counts', () => {
  const { totalCount, whitespaceOnly } = checkArrayBody('');
  assert.equal(totalCount, 0);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: body with only valid rulings returns empty whitespaceOnly', () => {
  const body = [
    `"Case #001: Motion denied. — Chief Justice 🦝",`,
    `"Case #002: Appeal upheld. — Associate Justice 🦝",`,
    '`Case #003: Order. — Bailiff 🦝`,',
  ].join('\n');
  const { totalCount, whitespaceOnly } = checkArrayBody(body);
  assert.equal(totalCount, 3);
  assert.equal(whitespaceOnly.length, 0);
});
