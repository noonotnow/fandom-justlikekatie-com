/**
 * Tests for the post-auth redirect logic in App.tsx / consumeMagicLinkFromLocation.
 *
 * Coverage:
 *   - When consumeMagicLinkFromLocation resolves to 'admin', setView is called
 *     with 'admin' (admin lands on the Release Desk workspace)
 *   - When there is no next param (normal collection sign-in),
 *     consumeMagicLinkFromLocation returns 'collection' and setView is called
 *     with 'collection'
 *   - On error, sessionStorage is written with the notice and setView is
 *     called with 'collection'
 *
 * App.tsx and publicAccount.ts both use browser globals (window.location,
 * window.history, fetch, BroadcastChannel, IndexedDB) so they cannot be
 * rendered or imported directly in the Node test environment.  The project
 * uses source-scoped string assertions throughout (see gridBuilderSaveNudge,
 * collectionSyncClient), so the same approach is used here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appSource = readFileSync(
  path.join(__dirname, '../src/App.tsx'),
  'utf8',
);

const accountSource = readFileSync(
  path.join(__dirname, '../src/utils/publicAccount.ts'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helper: extract the body of a useEffect call bounded by its outer callback
// delimiters.  Finds the first useEffect that contains the given anchor string.
// ---------------------------------------------------------------------------
function extractUseEffectBody(src: string, anchor: string): string {
  const effectIdx = src.indexOf('useEffect(');
  assert.notEqual(effectIdx, -1, 'App.tsx must contain at least one useEffect call');

  let start = effectIdx;
  while (start !== -1) {
    const slice = src.slice(start);
    if (slice.includes(anchor)) {
      // Find the opening paren of useEffect(
      const openParen = src.indexOf('(', start);
      // Walk the slice to find the matching closing paren of useEffect(...)
      let depth = 0;
      for (let i = openParen; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') {
          depth--;
          if (depth === 0) return src.slice(openParen, i + 1);
        }
      }
    }
    start = src.indexOf('useEffect(', start + 1);
  }
  throw new Error(`No useEffect found containing anchor: ${anchor}`);
}

const magicLinkEffect = extractUseEffectBody(appSource, 'consumeMagicLinkFromLocation');

// ---------------------------------------------------------------------------
// 1. Admin destination — setView is called with the value returned by
//    consumeMagicLinkFromLocation without any remapping.
// ---------------------------------------------------------------------------

test('setView receives destination directly so an admin result lands on Release Desk', () => {
  // The .then handler must pass `destination` (not a hardcoded string) to setView,
  // so whatever consumeMagicLinkFromLocation returns is what the view becomes.
  assert.ok(
    magicLinkEffect.includes('setView(destination)'),
    'useEffect .then handler must call setView(destination) so \'admin\' routes to the Operator Console',
  );
});

test('recheckAdmin is called on success before navigating', () => {
  // recheckAdmin() must appear before setView(destination) so the admin hook
  // transitions to isAdmin=true before the Admin view renders.
  const recheckIdx = magicLinkEffect.indexOf('recheckAdmin()');
  const setViewIdx = magicLinkEffect.indexOf('setView(destination)');
  assert.ok(recheckIdx !== -1, 'useEffect .then handler must call recheckAdmin()');
  assert.ok(setViewIdx !== -1, 'useEffect .then handler must call setView(destination)');
  assert.ok(
    recheckIdx < setViewIdx,
    'recheckAdmin() must be called before setView(destination)',
  );
});

// ---------------------------------------------------------------------------
// 2. collection destination — consumeMagicLinkFromLocation returns 'collection'
//    when the next param is absent.
// ---------------------------------------------------------------------------

test('consumeMagicLinkFromLocation returns collection when next param is absent', () => {
  assert.match(
    accountSource,
    /next === 'plan' \|\| next === 'admin'[\s\S]*return next === 'plan' \|\| next === 'admin' \? 'admin' : next === 'membership' \? 'membership' : 'collection'/,
    "consumeMagicLinkFromLocation must preserve admin and membership while defaulting to collection",
  );
});

// ---------------------------------------------------------------------------
// AdminSignIn component — form submit must pass 'admin' as the next argument
// ---------------------------------------------------------------------------

/**
 * Extract the body of the named function from the given source text.
 * Returns everything from the function declaration up to (and including) its
 * closing brace at depth 0.
 */
function extractFunctionBody(src: string, name: string): string {
  const idx = src.indexOf(`function ${name}`);
  assert.notEqual(idx, -1, `Source must contain 'function ${name}'`);
  let depth = 0;
  let started = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') {
      depth--;
      if (started && depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error(`Could not find closing brace for function ${name}`);
}

const adminSignInBody = extractFunctionBody(appSource, 'AdminSignIn');

test('AdminSignIn handleSubmit calls requestMagicLink with email and the literal string admin', () => {
  // The call site must be  requestMagicLink(email, 'admin')  — any other second
  // argument (or no second argument) would send admins to the wrong view.
  assert.ok(
    adminSignInBody.includes("requestMagicLink(email, 'admin')"),
    "AdminSignIn must call requestMagicLink(email, 'admin') so the magic-link URL carries next=admin",
  );
});

// ---------------------------------------------------------------------------
// requestMagicLink — next must be serialized into the POST body
// ---------------------------------------------------------------------------

test('requestMagicLink spreads next into the POST body when provided', () => {
  // The function must include `next` in the JSON body so the server embeds it
  // in the magic-link URL and consumeMagicLinkFromLocation can read it back.
  assert.ok(
    accountSource.includes('{ email, ...(next ? { next } : {}) }'),
    "requestMagicLink must spread { next } into the POST body when the argument is truthy",
  );
});

// ---------------------------------------------------------------------------
// 3. error path — setView('collection') is called in the catch block, and
//    the error message is persisted to sessionStorage for display.
// ---------------------------------------------------------------------------

test('error path lands on collection view', () => {
  assert.ok(
    magicLinkEffect.includes("setView('collection')"),
    "useEffect .catch handler must call setView('collection') on error",
  );
});

test('error path writes the notice to sessionStorage before navigating', () => {
  const catchIdx = magicLinkEffect.indexOf('.catch(');
  assert.notEqual(catchIdx, -1, 'useEffect must have a .catch handler');
  const catchBody = magicLinkEffect.slice(catchIdx);

  assert.ok(
    catchBody.includes("sessionStorage.setItem("),
    '.catch handler must persist the error notice to sessionStorage',
  );
  assert.ok(
    catchBody.includes("'fandom_auth_notice'"),
    ".catch handler must write to the 'fandom_auth_notice' sessionStorage key",
  );
  // The setView call must also be in the catch block (not only outside it).
  assert.ok(
    catchBody.includes("setView('collection')"),
    ".catch handler must call setView('collection')",
  );
});
