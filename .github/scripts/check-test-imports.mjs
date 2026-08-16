#!/usr/bin/env node
/**
 * check-test-imports.mjs
 *
 * Scans every *.test.ts / *.test.js file in TEST_DIR (default: "tests") and
 * verifies that every relative static import — including side-effect imports
 * and dynamic imports — resolves to an actual *file* in the repository.
 *
 * False-positive cases that are explicitly rejected:
 *   - Bare directory path (e.g. `import './utils'`) where ./utils/ is a
 *     directory but contains no resolvable index.ts / index.js.
 *   - Any path that doesn't exist at all.
 *
 * Usage:
 *   node .github/scripts/check-test-imports.mjs [TEST_DIR]
 *
 * Exits 0 on success, 1 if any import target is missing.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const TEST_DIR = process.argv[2] ?? 'tests';

// Matches all three static relative import forms:
//   1. import './side-effect'          (side-effect import, no `from`)
//   2. import Foo from './module'       (named import)
//   3. import('./dynamic')              (dynamic import)
//
// The key requirement: the specifier must start with '.' so we ignore
// bare-specifier (node:, npm) and absolute imports.
const IMPORT_RE =
  /\bimport\s*(?:[^'"(]*from\s*|)\s*['"](\.[^'"]+)['"]/g;

// Also catch: export { … } from './re-export'
const EXPORT_RE =
  /\bexport\s+(?:\*|{[^}]*})\s+from\s+['"](\.[^'"]+)['"]/g;

const FILE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Returns true only when `importedPath` resolves to a regular file
 * (or a directory that contains a recognised index file).
 * A bare directory without an index is explicitly false.
 */
function fileExists(importedPath) {
  const stat = statSync(importedPath, { throwIfNoEntry: false });

  if (stat) {
    if (stat.isFile()) return true;
    if (stat.isDirectory()) {
      // A directory is only valid when an index file is present.
      for (const ext of FILE_EXTS) {
        if (statSync(join(importedPath, `index${ext}`), { throwIfNoEntry: false })?.isFile()) {
          return true;
        }
      }
      return false; // directory exists but has no index → unresolvable
    }
  }

  // The specifier may omit the extension; try stripping any existing
  // extension and appending each known one.
  const base = importedPath.replace(/\.[^/.]+$/, '');
  for (const ext of FILE_EXTS) {
    if (statSync(base + ext, { throwIfNoEntry: false })?.isFile()) return true;
  }

  return false;
}

/** Collect all relative specifiers from a source string. */
function extractRelativeSpecifiers(src) {
  const specifiers = new Set();
  for (const re of [IMPORT_RE, EXPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].startsWith('.')) specifiers.add(m[1]);
    }
  }
  return specifiers;
}

// ── main ────────────────────────────────────────────────────────────────────

let testFiles;
try {
  testFiles = readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.test.ts') || f.endsWith('.test.js'))
    .map(f => `${TEST_DIR}/${f}`);
} catch (err) {
  console.error(`❌  Cannot read test directory '${TEST_DIR}': ${err.message}`);
  process.exit(1);
}

if (testFiles.length === 0) {
  console.error(
    `❌  No *.test.ts / *.test.js files found in '${TEST_DIR}'. ` +
    'If the directory moved, update the TEST_DIR argument in the workflow.',
  );
  process.exit(1);
}

const failures = [];

for (const testFile of testFiles) {
  const src = readFileSync(testFile, 'utf8');
  const dir = dirname(testFile);

  for (const specifier of extractRelativeSpecifiers(src)) {
    const abs = resolve(dir, specifier);
    if (!fileExists(abs)) {
      failures.push(`  ${testFile}  →  ${specifier}  (resolved: ${abs})`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    '\n❌  Test-source guard failed — these imports have no committed file:\n\n' +
    failures.join('\n') +
    '\n\nThis usually means implementation commits are still local while the\n' +
    'test file was already pushed.  Push (or revert) the missing source.\n',
  );
  process.exit(1);
}

console.log(
  `✅  All relative imports in ${testFiles.length} test file(s) resolve to committed files.`,
);
