#!/usr/bin/env node
/**
 * check-court-record.js — build-time guard for whitespace-only entries in
 * RACCOON_COURT_RECORD.  Run automatically by `npm run lint` and
 * `npm run build`.
 *
 * Why a script rather than an OXLint rule?
 * OXLint does not yet expose a stable custom-rule plugin API, so a thin
 * static-analysis script fills the gap.  It parses the raw TypeScript source
 * (no compilation needed) and rejects every string literal whose decoded
 * value trims to empty.
 *
 * The TypeScript compile-time assertion in the same file already rejects the
 * exact empty string ""; this script catches whitespace-only variants such as
 * "   ", "\t", "\u0020", "\x09", or `\v` that TypeScript's type system cannot
 * distinguish from a valid non-empty literal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Decode a JavaScript string literal's inner content (the part between the
// quote characters) into its runtime string value.  Handles every escape
// sequence defined by the ECMAScript spec, including Unicode code-point
// escapes (\u{…}), hex escapes (\xHH), and named single-character escapes
// (\n, \r, \t, \v, \f, \b, \0).
// ---------------------------------------------------------------------------
export function decodeStringContent(raw) {
  return raw.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([0-7]+)|([\s\S]))/g,
    (_, codePoint, u4, x2, octal, single) => {
      if (codePoint !== undefined) return String.fromCodePoint(parseInt(codePoint, 16));
      if (u4        !== undefined) return String.fromCharCode(parseInt(u4, 16));
      if (x2        !== undefined) return String.fromCharCode(parseInt(x2, 16));
      if (octal     !== undefined) return String.fromCharCode(parseInt(octal, 8));
      // Named single-character escapes
      switch (single) {
        case 'n':  return '\n';
        case 'r':  return '\r';
        case 't':  return '\t';
        case 'v':  return '\v';   // U+000B vertical tab
        case 'f':  return '\f';   // U+000C form feed
        case 'b':  return '\b';   // U+0008 backspace (not whitespace for trim)
        case '0':  return '\0';   // U+0000 null (not whitespace for trim)
        default:   return single; // identity escape: \\, \', \", \` etc.
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Extract all string literals from the array body and identify whitespace-only
// ones.  The regex matches single-quoted, double-quoted, and template literals
// (without ${} interpolation, which would not be meaningful in this constant
// array).  The inner pattern `(?:\\[\s\S]|(?!\1)[^\\])*` correctly handles
// embedded escape sequences and prevents the closing quote from ending the
// match early.
//
// Returns { totalCount, whitespaceOnly } where whitespaceOnly is an array of
// the full matched literal strings (e.g. "   ", `\t`) that decoded to
// whitespace-only values.
// ---------------------------------------------------------------------------
// NOTE — tagged template literals (e.g. String.raw`\t`, html`  `)
// The tag identifier that precedes the opening backtick (e.g. "String.raw") is
// not a quote character, so the regex below does NOT capture it.  What the regex
// sees is just the backtick-delimited literal that follows the tag.  Concretely:
//
//   String.raw`\t`  →  matched as  `\t`  →  decoded as tab  →  flagged ✓
//   html`   `       →  matched as  `   ` →  decoded as spaces → flagged ✓
//   String.raw`Hello world`  →  matched as `Hello world`  →  passes ✓
//
// This means the guard correctly flags tagged templates whose content would
// decode to whitespace-only, and correctly passes tagged templates with visible
// content.  The tag itself is immaterial to the static analysis because the
// source-level escape sequences inside the literal are what the regex inspects.
const STRING_LITERAL_RE = /(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;

export function checkArrayBody(body) {
  const whitespaceOnly = [];
  const templateInterpolations = [];
  let totalCount = 0;
  let m;
  const re = new RegExp(STRING_LITERAL_RE.source, STRING_LITERAL_RE.flags);
  while ((m = re.exec(body)) !== null) {
    totalCount++;
    const quote = m[1];
    const raw = m[2]; // content between the quote characters
    // Template literals that contain ${} expressions cannot be statically
    // evaluated: the runtime value may be whitespace-only even when the source
    // looks harmless.  Flag them so the developer is prompted to use a plain
    // string literal instead.
    if (quote === '`' && raw.includes('${')) {
      templateInterpolations.push(m[0]);
      continue;
    }
    const decoded = decodeStringContent(raw);
    if (decoded.length > 0 && decoded.trim().length === 0) {
      whitespaceOnly.push(m[0]); // the full matched literal, e.g. "   "
    }
  }
  return { totalCount, whitespaceOnly, templateInterpolations };
}

// ---------------------------------------------------------------------------
// Main — only runs when this file is the entry point, not when imported as a
// module by the test suite.
// ---------------------------------------------------------------------------
const __self = fileURLToPath(import.meta.url);
if (process.argv[1] === __self) {
  const __dirname = dirname(__self);

  // Allow callers (e.g. integration tests) to override the target file via a
  // --file=<path> CLI argument without touching the production default.
  const fileArg = process.argv.slice(2).find(a => a.startsWith('--file='));
  const FILE = fileArg
    ? resolve(fileArg.slice('--file='.length))
    : resolve(__dirname, '..', 'src', 'data', 'raccoonCourtRecord.ts');

  let src;
  try {
    src = readFileSync(FILE, 'utf8');
  } catch (err) {
    console.error(`check-court-record: cannot read ${FILE}: ${err.message}`);
    process.exit(1);
  }

  // Locate the RACCOON_COURT_RECORD array body (between [ and ] as const).
  const arrayMatch = src.match(/RACCOON_COURT_RECORD\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  if (!arrayMatch) {
    console.error(`check-court-record: could not locate RACCOON_COURT_RECORD array in ${FILE}`);
    process.exit(1);
  }

  const body = arrayMatch[1];
  const { totalCount, whitespaceOnly, templateInterpolations } = checkArrayBody(body);

  if (templateInterpolations.length > 0) {
    const plural = templateInterpolations.length === 1 ? 'entry' : 'entries';
    console.error(
      `\ncheck-court-record: ${FILE}\n` +
      `  ${templateInterpolations.length} template literal ${plural} with \$\{} interpolation found in RACCOON_COURT_RECORD:\n` +
      templateInterpolations.map(s => `    ${s}`).join('\n') + '\n' +
      '\n  Template literals with expressions cannot be statically checked for whitespace-only content.\n' +
      '  Use a plain string literal (\'…\' or "…") instead.\n',
    );
    process.exit(1);
  }

  if (whitespaceOnly.length > 0) {
    const plural = whitespaceOnly.length === 1 ? 'entry' : 'entries';
    console.error(
      `\ncheck-court-record: ${FILE}\n` +
      `  ${whitespaceOnly.length} whitespace-only ${plural} found in RACCOON_COURT_RECORD:\n` +
      whitespaceOnly.map(s => `    ${s}`).join('\n') + '\n' +
      '\n  Every ruling must have visible content.\n' +
      '  Remove or replace the blank entry, then re-run `npm run build` or `npm run lint`.\n',
    );
    process.exit(1);
  }

  console.log(`check-court-record: OK — ${totalCount} ruling(s) checked, none are whitespace-only.`);
}
