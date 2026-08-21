#!/usr/bin/env node
/**
 * check-test-imports.mjs
 *
 * Recursively discovers every *.test.ts / *.test.js file under each
 * directory given on the command line (defaults: tests, netlify/functions/lib,
 * scripts) and verifies that every relative static import resolves to an
 * actual *file* in the repository.
 *
 * Import forms covered:
 *   import './side-effect'               (side-effect)
 *   import Foo from './module'           (named static)
 *   export { x } from './re-export'      (re-export)
 *   import('./dynamic')                  (dynamic)
 *
 * False-positive cases that are explicitly rejected:
 *   - Bare directory path (e.g. `import './utils'`) where ./utils/ is a
 *     directory but contains no resolvable index file.
 *   - Any path that doesn't exist at all.
 *
 * Usage:
 *   node .github/scripts/check-test-imports.mjs [dir1 dir2 ...]
 *
 * Exits 0 on success, 1 if any import target is missing or no test files found.
 */

import { readdirSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const TEST_DIRS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['tests', 'netlify/functions/lib', 'scripts'];

// ── import extraction ────────────────────────────────────────────────────────

// 1. Named and side-effect static imports:
//      import './side-effect'
//      import Foo from './module'
//    Note: [^'"\n;(]* prevents consuming past statement end and stops at '('
//    so it does NOT eat dynamic import calls.
const STATIC_IMPORT_RE =
  /\bimport\s+(?:[^'"\n;(]*from\s+)?['"](\.[^'"]+)['"]/g;

// 2. Dynamic imports: import('./path')
const DYNAMIC_IMPORT_RE =
  /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

// 3. Re-exports: export { … } from './path'  or  export * from './path'
const REEXPORT_RE =
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"](\.[^'"]+)['"]/g;

const ALL_PATTERNS = [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE, REEXPORT_RE];

/** Collect all relative specifiers from a source string. */
function extractRelativeSpecifiers(src) {
  const specifiers = new Set();
  for (const re of ALL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].startsWith('.')) specifiers.add(m[1]);
    }
  }
  return specifiers;
}

// ── file resolution ──────────────────────────────────────────────────────────

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
      for (const ext of FILE_EXTS) {
        if (statSync(join(importedPath, `index${ext}`), { throwIfNoEntry: false })?.isFile()) {
          return true;
        }
      }
      return false; // directory with no index → unresolvable
    }
  }

  // Specifier may omit the extension; try stripping and re-adding.
  const base = importedPath.replace(/\.[^/.]+$/, '');
  for (const ext of FILE_EXTS) {
    if (statSync(base + ext, { throwIfNoEntry: false })?.isFile()) return true;
  }

  return false;
}

// ── recursive test-file discovery ────────────────────────────────────────────

function collectTestFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files; // subdirectory vanished mid-walk — skip silently
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.js'))
    ) {
      files.push(full);
    }
  }
  return files;
}

// ── main ─────────────────────────────────────────────────────────────────────

// Validate that every root directory exists and is actually a directory before
// collecting files. An invalid root silently produces zero files, masking
// misconfigured paths.
const rootStats = TEST_DIRS.map(d => ({
  path: d,
  stat: statSync(d, { throwIfNoEntry: false }),
}));
const missingRoots = rootStats.filter(({ stat }) => !stat).map(({ path }) => path);
const nonDirectoryRoots = rootStats
  .filter(({ stat }) => stat && !stat.isDirectory())
  .map(({ path }) => path);

if (missingRoots.length > 0 || nonDirectoryRoots.length > 0) {
  const rootErrors = [];
  if (missingRoots.length > 0) {
    rootErrors.push(
      `❌  Root director${missingRoots.length === 1 ? 'y does' : 'ies do'} not exist: ` +
      `${missingRoots.map(d => `"${d}"`).join(', ')}.`,
    );
  }
  if (nonDirectoryRoots.length > 0) {
    rootErrors.push(
      `❌  Root path${nonDirectoryRoots.length === 1 ? ' is' : 's are'} not a ` +
      `director${nonDirectoryRoots.length === 1 ? 'y' : 'ies'}: ` +
      `${nonDirectoryRoots.map(d => `"${d}"`).join(', ')}.`,
    );
  }
  console.error(
    rootErrors.join('\n') + ' ' +
    'If the directories moved, update the TEST_DIRS list in the workflow.',
  );
  process.exit(1);
}

const testFiles = TEST_DIRS.flatMap(collectTestFiles);

if (testFiles.length === 0) {
  console.error(
    `❌  No *.test.ts / *.test.js files found under: ${TEST_DIRS.join(', ')}. ` +
    'If the directories moved, update the TEST_DIRS list in the workflow.',
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
  `✅  All relative imports in ${testFiles.length} test file(s) across ` +
  `[${TEST_DIRS.join(', ')}] resolve to committed files.`,
);
