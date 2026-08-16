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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '..', 'src', 'data', 'raccoonCourtRecord.ts');

let src;
try {
  src = readFileSync(FILE, 'utf8');
} catch (err) {
  console.error(`check-court-record: cannot read ${FILE}: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Locate the RACCOON_COURT_RECORD array body (between [ and ] as const).
// ---------------------------------------------------------------------------
const arrayMatch = src.match(/RACCOON_COURT_RECORD\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
if (!arrayMatch) {
  console.error(`check-court-record: could not locate RACCOON_COURT_RECORD array in ${FILE}`);
  process.exit(1);
}

const body = arrayMatch[1];

// ---------------------------------------------------------------------------
// Decode a JavaScript string literal's inner content (the part between the
// quote characters) into its runtime string value.  Handles every escape
// sequence defined by the ECMAScript spec, including Unicode code-point
// escapes (\u{…}), hex escapes (\xHH), and named single-character escapes
// (\n, \r, \t, \v, \f, \b, \0).
// ---------------------------------------------------------------------------
function decodeStringContent(raw) {
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
// Extract all string literals from the array body.
// Matches single-quoted, double-quoted, and template literals (without ${}
// interpolation, which would not be meaningful in this constant array).
// The inner pattern `(?:\\[\s\S]|(?!\1)[^\\])*` correctly handles embedded
// escape sequences and prevents the closing quote from ending the match early.
// ---------------------------------------------------------------------------
const STRING_LITERAL_RE = /(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;

const whitespaceOnly = [];
let totalCount = 0;
let m;
while ((m = STRING_LITERAL_RE.exec(body)) !== null) {
  totalCount++;
  const raw = m[2]; // content between the quote characters
  const decoded = decodeStringContent(raw);
  if (decoded.length > 0 && decoded.trim().length === 0) {
    whitespaceOnly.push(m[0]); // the full matched literal, e.g. "   "
  }
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
