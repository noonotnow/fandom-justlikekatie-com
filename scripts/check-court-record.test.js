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
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decodeStringContent, checkArrayBody } from './check-court-record.js';

// ---------------------------------------------------------------------------
// Helpers for integration tests
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'check-court-record.js');

/** Wrap array entries in the TypeScript scaffold the script expects. */
function makeSource(entries) {
  return (
    'export const RACCOON_COURT_RECORD = [\n' +
    entries.map(e => `  ${e},`).join('\n') +
    '\n] as const;\n'
  );
}

/**
 * Write `content` to a temp file, run the script against it, return the
 * spawnSync result so tests can inspect exitCode / stderr / stdout.
 */
function runScript(content) {
  const dir = mkdtempSync(join(tmpdir(), 'check-court-record-'));
  const file = join(dir, 'raccoonCourtRecord.ts');
  try {
    writeFileSync(file, content, 'utf8');
    return spawnSync(process.execPath, [SCRIPT, `--file=${file}`], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
// checkArrayBody — template literals with ${} interpolation
// ---------------------------------------------------------------------------

test('checkArrayBody: flags a template literal with a ${} expression', () => {
  const body = '`${\'  \'}`,';
  const { templateInterpolations, whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(templateInterpolations.length, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: flags template literal with expression even when surrounded by text', () => {
  const body = '`Case ${num}: ruling`,';
  const { templateInterpolations } = checkArrayBody(body);
  assert.equal(templateInterpolations.length, 1);
});

test('checkArrayBody: does not flag template literals without ${}', () => {
  const body = '`Case #001: Motion denied. — Justice 🦝`,';
  const { templateInterpolations, whitespaceOnly } = checkArrayBody(body);
  assert.equal(templateInterpolations.length, 0);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: collects both whitespace-only and template-interpolation violations', () => {
  const body = [
    `"Case #001: Valid ruling. — 🦝",`,
    `"   ",`,
    '`${\'  \'}`,',
  ].join('\n');
  const { totalCount, whitespaceOnly, templateInterpolations } = checkArrayBody(body);
  assert.equal(totalCount, 3);
  assert.equal(whitespaceOnly.length, 1);
  assert.equal(templateInterpolations.length, 1);
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

// ---------------------------------------------------------------------------
// Integration / smoke tests — run the full script as a subprocess so that
// end-to-end file-reading and array-extraction are exercised together.
// ---------------------------------------------------------------------------

test('integration: exits 0 on a clean file with only valid rulings', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"Case #002: Appeal upheld. — Associate Justice 🦝"',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    0,
    `expected exit 0 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stdout, /OK/);
});

test('integration: exits 1 when a literal-space whitespace-only entry is present', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"   "',
    '"Case #002: Appeal upheld. — Associate Justice 🦝"',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 1 when a \\t escape whitespace-only entry is present', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"\\t"',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 1 when a \\u0020 unicode-escape whitespace-only entry is present', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"\\u0020"',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 1 when a \\x09 hex-escape whitespace-only entry is present', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"\\x09"',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 1 with "could not locate" when RACCOON_COURT_RECORD array is absent', () => {
  // File exists but uses a different constant name — simulates a rename refactor.
  const src =
    'export const RACCOON_VERDICTS = [\n' +
    '  "Case #001: Motion denied. — Chief Justice 🦝",\n' +
    '] as const;\n';
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /could not locate/);
});

test('integration: exits 1 with "could not locate" when as const suffix is missing', () => {
  // Array is present but without `as const`, so the regex cannot match.
  const src =
    'export const RACCOON_COURT_RECORD = [\n' +
    '  "Case #001: Motion denied. — Chief Justice 🦝",\n' +
    '];\n';
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /could not locate/);
});

test('integration: exits 1 with interpolation warning when a template literal contains ${}', () => {
  // A template literal whose expression could evaluate to whitespace at runtime
  // but passes the static whitespace check silently.
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '`${\'  \'}`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /interpolation/);
});

// ---------------------------------------------------------------------------
// checkArrayBody — multi-expression, nested-backtick, and multiline templates
// ---------------------------------------------------------------------------

test('checkArrayBody: flags template literal with multiple ${} expressions', () => {
  // e.g. `${caseNum}: ${ruling}` — two interpolations, still un-evaluable statically
  const body = '`${caseNum}: ${ruling}`,';
  const { templateInterpolations, whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(templateInterpolations.length, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: flags template literal whose expression contains backtick-delimited content', () => {
  // `${'`inner`'}` — the outer template literal contains ${, so it must be flagged.
  // The regex stops at the first unescaped inner backtick, but the partial match still
  // contains ${ and is therefore reported as a templateInterpolation.
  const body = "`${'`inner`'}`,";
  const { templateInterpolations } = checkArrayBody(body);
  assert.ok(
    templateInterpolations.length >= 1,
    `expected at least one interpolation flag, got ${templateInterpolations.length}`,
  );
});

test('checkArrayBody: flags multiline template literal with a ${} expression', () => {
  // Template literal that spans multiple lines — the guard must still catch the ${}
  const body = '`line one\n${value}\nline two`,';
  const { templateInterpolations, whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(templateInterpolations.length, 1);
  assert.equal(whitespaceOnly.length, 0);
});

// ---------------------------------------------------------------------------
// Integration — multi-expression, nested-backtick, and multiline templates
// ---------------------------------------------------------------------------

test('integration: exits 1 with interpolation warning for multi-expression template literal', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '`Case ${num}: ${ruling}`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /interpolation/);
});

test('integration: exits 1 with interpolation warning for multiline template literal with ${}', () => {
  // Backtick template spans multiple lines
  const src =
    'export const RACCOON_COURT_RECORD = [\n' +
    '  "Case #001: Motion denied. — Chief Justice 🦝",\n' +
    '  `line one\n${value}\nline two`,\n' +
    '] as const;\n';
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /interpolation/);
});

test('integration: exits 1 with interpolation warning for expression-containing template among valid entries', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    '"Case #002: Appeal upheld. — Associate Justice 🦝"',
    '`Case ${3}: Ruling. — Bailiff 🦝`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /interpolation/);
  assert.match(result.stderr, /plain string/);
});

// ---------------------------------------------------------------------------
// checkArrayBody — tagged template literals
//
// A tagged template (e.g. String.raw`\t`, html`  `) has a tag identifier
// before the opening backtick.  STRING_LITERAL_RE does not capture the tag —
// it starts matching at the backtick — so the guard analyses the inner escape
// sequences of the literal exactly as it would for a plain template literal.
// The tests below pin this behaviour.
// ---------------------------------------------------------------------------

test('checkArrayBody: String.raw tagged template with \\t escape is flagged as whitespace-only', () => {
  // String.raw`\t` — the tag "String.raw" is before the backtick; the regex
  // matches `\t`, decodeStringContent decodes it to a tab, trim() → empty.
  const body = 'String.raw`\\t`,';
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1, 'tagged template literal should be counted');
  assert.equal(whitespaceOnly.length, 1, 'whitespace-only tagged template should be flagged');
});

test('checkArrayBody: tagged template with literal spaces is flagged as whitespace-only', () => {
  // html`   ` — tag "html" before the backtick; content is three spaces.
  const body = 'html`   `,';
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: tagged template with \\n escape is flagged as whitespace-only', () => {
  const body = 'String.raw`\\n`,';
  const { whitespaceOnly } = checkArrayBody(body);
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: tagged template with \\u0020 unicode escape is flagged as whitespace-only', () => {
  const body = 'tag`\\u0020`,';
  const { whitespaceOnly } = checkArrayBody(body);
  assert.equal(whitespaceOnly.length, 1);
});

test('checkArrayBody: tagged template with visible content is not flagged', () => {
  // String.raw`Hello world` — content is non-whitespace; should pass.
  const body = 'String.raw`Hello world`,';
  const { whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: tagged template with ${} expression is flagged as interpolation', () => {
  // String.raw`${value}` — contains ${}, so it goes into templateInterpolations.
  const body = 'String.raw`${value}`,';
  const { templateInterpolations, whitespaceOnly, totalCount } = checkArrayBody(body);
  assert.equal(totalCount, 1);
  assert.equal(templateInterpolations.length, 1);
  assert.equal(whitespaceOnly.length, 0);
});

test('checkArrayBody: dotted tagged template (e.g. String.raw) with whitespace-only content is flagged', () => {
  // Dot-notation tags like String.raw are common; verify the regex is not thrown off
  // by the dot in the tag name.
  const body = 'String.raw`  \\t  `,';
  const { whitespaceOnly } = checkArrayBody(body);
  assert.equal(whitespaceOnly.length, 1);
});

// ---------------------------------------------------------------------------
// Integration — tagged template literals
// ---------------------------------------------------------------------------

test('integration: exits 1 (whitespace-only) for String.raw tagged template with \\t escape', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    'String.raw`\\t`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 1 (whitespace-only) for tagged template with literal spaces', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    'html`   `',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /whitespace-only/);
});

test('integration: exits 0 for tagged template with valid visible content', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    'String.raw`Case #002: Upheld. — 🦝`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    0,
    `expected exit 0 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stdout, /OK/);
});

test('integration: exits 1 (interpolation) for tagged template with ${} expression', () => {
  const src = makeSource([
    '"Case #001: Motion denied. — Chief Justice 🦝"',
    'String.raw`${value}`',
  ]);
  const result = runScript(src);
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /interpolation/);
});

test('integration: exits 1 with "cannot read" when the file path does not exist', () => {
  // Pass a path that does not exist on the filesystem.
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--file=/nonexistent/path/raccoonCourtRecord.ts'],
    { encoding: 'utf8' },
  );
  assert.equal(
    result.status,
    1,
    `expected exit 1 but got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stderr, /cannot read/);
});
