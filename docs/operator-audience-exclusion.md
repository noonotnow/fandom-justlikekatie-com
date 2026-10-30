# Operator audience exclusion

Verified owner/operator activity is excluded from audience analytics on every
device. This continues the production-only Google tracking from PR #192; it adds
no tracker and changes no measurement ID (`G-FHZJ1T74TG`, `GTM-5T5P2C9S`).

## Authority

The only source of truth is the server session: `/api/auth/session` returns
`isAdmin` derived from the `FANDOM_ADMIN_EMAILS` allowlist
(`netlify/functions/lib/public-auth.js`). Client flags, query parameters, email
domains and paid membership never grant operator status. Measurement
suppression is never used for authorization.

## Browser (`public/audience-gate.js`)

Loaded synchronously by `index.html` and every static public page that
previously carried an inline GA tag (guides, glossary, games, previews, the
Love Between Fairy and Devil guide, both locales).

| State | Meaning | Tracking |
| --- | --- | --- |
| `pending` | session lookup in flight | nothing loaded or sent; events buffered (max 100) |
| `public` | anonymous or ordinary signed-in (paid or free) visitor | gtag.js + GTM load once; buffered events flushed once |
| `operator` | server-verified operator | nothing loaded or sent; buffer dropped; `ga-disable-G-FHZJ1T74TG` set |
| `unknown` | lookup failed, non-JSON/5xx/timeout (8 s), or a `/auth/verify` link page | treated as suppressed (fail closed) |

- Only `fandom.justlikekatie.com` can leave `pending`; localhost, previews,
  aliases and look-alike hosts stay on the existing no-tracking path and make no
  session request.
- **Fallback:** failed classification suppresses tracking for that page load
  rather than counting a possibly authenticated operator. Site use is
  unaffected. The cost is a small, bounded loss of public pageviews during a
  session-endpoint outage. A later successful classification (sign-in, logout,
  refresh via `getPublicSession`, or returning to a visible tab) moves the page
  to `public`/`operator`. A background re-check that fails transiently keeps the
  last verified state.
- Sign-in links (`/auth/verify`, `/zh-cn/auth/verify`) are suppressed until the
  verification succeeds and a fresh session lookup completes. Ordinary session
  reads started during verification are discarded and cannot release the hold.
  Missing or malformed user roles remain `unknown`; only explicit `null` or a
  boolean `isAdmin` role is accepted. The page location sent to Google never
  includes the URL fragment (the magic-link token lives there).
- Logout, account switch and session changes are reported through
  `getPublicSession()`/`logoutPublicAccount()` in `src/utils/publicAccount.ts`.
- `trackEvent` (`src/utils/analytics.ts`, Google and Umami) runs through the gate.
- LG01 game events enter `dataLayer` only when the gate is already `public`;
  Sect Day's first-party collector uses same-origin credentials so the server can
  exclude a verified operator cookie.
- **No opt-out marker is stored** (no cookie, localStorage or URL flag). State
  lives only in page memory and is re-derived from the server on every load, so
  there is nothing to expire or leak.
- Limitation: if a tag was already loaded for a public visit and the same page
  later becomes an operator session, GA4 is disabled via `ga-disable`, but the
  GTM container cannot be unloaded; the next navigation/reload is clean.

## Server collectors

`createPublicAuth(...).isOperatorRequest(req, context)` reads only the signed
session cookie. It returns `true` for an allowlisted session, `false` for no,
invalid, expired, revoked or ordinary sessions, and **`true` (excluded) when a
cookie is present but storage fails** so unverifiable traffic is not counted.

Applied to: `log-engagement` (Daily Drop, archive review, game, companion,
membership and grid events), `released-pack-collect`, and the daily
participation collector (already admin-excluded via `authenticateAdmin`).
Excluded requests receive `200 {ok:true, excluded:true}` so operator workflows
(saves, exports, checkout, tools) never fail. Operational/audit logs, billing
and archive-access operations, and the consented companion interest list are
not audience aggregates and are unchanged.

## Tests

- `node --test scripts/static-audience-gates.test.js` - filesystem-wide static HTML regression guard, including newly added nested HTML; also enforced by `prepare:public` after page generation. Tracker-free pages remain tracker-free.

- `node --test tests/analyticsHostGuard.test.mjs` - gate states, hosts, fallback, token handling
- `node --import tsx/esm --test tests/audienceAnalytics.test.ts` - `trackEvent` gating
- `node --test netlify/functions/lib/operator-audience-exclusion.test.js` - server exclusion with ordinary-member and anonymous positive controls
- `node --import tsx/esm --test tests/browser/audienceGateGameTelemetry.test.ts tests/browser/magicLinkAudienceHold.test.ts tests/browser/publicSessionAudienceValidation.test.ts tests/browser/sectDay.test.ts` - browser cookie, game-gate, callback-race and malformed-session controls

## Unresolved / must be verified after deployment

1. **Live owner role:** whether the production `FANDOM_ADMIN_EMAILS` contains the
   owner's sign-in address could not be verified securely (the site-scoped value
   for earnest-gecko-17eb0c was not retrievable; a team-scoped lookup finding
   nothing does not mean the project variable is absent). Do not replace the
   allowlist blindly or print it. Verify by signing in as the owner on the
   deployed site and confirming `GET /api/auth/session` returns
   `user.isAdmin: true` (and the Admin view opens).
2. **GA stream/property mismatch (PR #192):** the repository routes to
   `G-FHZJ1T74TG` and `GTM-5T5P2C9S` (see `docs/veteran-submission-analytics.md`).
   Whether the GTM container also forwards to a different GA4 property is
   unverified here; inspect the GTM container's tags in the GTM/GA admin. No IDs
   were guessed or changed.
3. **Deployed positive/negative controls** (desktop and phone, `en` and `zh-CN`):
   - Operator: sign in, hard-reload, browse `/`, `/vibe-atlas`,
     `/c-drama-fandom/...`, admin tools; Network shows no
     `googletagmanager.com` / `google-analytics.com` requests and
     `log-engagement` / `released-pack-collect` return `excluded:true`.
   - Control: signed-out and ordinary signed-in (non-allowlisted) sessions show
     exactly one `page_view`, and collectors return plain `{ok:true}`.
4. **Historical data:** earlier owner visits are unclassified and cannot be
   subtracted with certainty; no data was deleted and no GA filter activated.
   After the deployed verification above passes, record the deployment time as a
   clean-baseline cutover; do not call earlier numbers clean.


## October 30 article coverage follow-up

The Episodes 1–6, 7–14 and 15–20 Against the Current articles still had direct
Google bootstraps after PR #204. They now use the existing synchronous
`/audience-gate.js` before `editorial.js`; no tracker IDs, article copy or auth
rules are changed. The public-page build now checks all static HTML on disk for
unconditional Google loaders, configs, queue pushes and tracking iframes, rather
than relying on a short curated page list. This covers hand-authored future
articles as well as generator output; intentionally tracker-free pages stay so.
The actual three article HTML documents also run through the existing VM gate
harness with anonymous, ordinary-member, operator and failed-lookup responses.
These are mocked regression tests, not proof of live production identity.

### Ordinary-visitor and operator acceptance test

No second person or new account is needed for the anonymous positive control.
After the reviewed fix is deployed:

1. Use a fresh, signed-out browser context with no Fandom session cookies or
   saved login, and no analytics-blocking extension. Confirm the real production
   `/api/auth/session` response is `user: null`; do not mock that response for
   this live test. If a consent choice is offered, use the normal permitted
   analytics choice and record it.
2. Start a network capture before navigation. Open the homepage and each of the
   three fixed article routes once. Confirm classification becomes `public`,
   Google tags initialize once, and a real `page_view` collection request is
   sent for each initial page load. Check the request's event name and tag ID,
   not just a loaded script or buffered `dataLayer` entry. Duplicate pageviews
   from GA/GTM forwarding fail the control and need investigation.
3. Repeat in Katie's genuinely signed-in operator browser. Confirm only the
   boolean `user.isAdmin: true` and gate state `operator`, without recording or
   sharing session cookies, tokens or raw email. Hard-reload before each test
   so a tag from an earlier anonymous visit is not still in memory. Expect no
   Google/GTM loaders and no audience collection requests on those routes.
4. If an existing ordinary signed-in non-admin account is available, repeat the
   visitor test with its actual `isAdmin: false` session. Automated fixtures
   cover this case, but do not label that as a live member-account test.
5. Corroborate the anonymous test in GA4 property `552138908`, stream **Fandom
   Vibes** (`15529145995`), matching the recorded time and production hostname
   `fandom.justlikekatie.com`. The property's reporting timezone is
   `America/Los_Angeles`. Its picker name `G-CGWB67360Q` is not, by itself,
   evidence of a different stream measurement ID; production code uses
   `G-FHZJ1T74TG`. Do not change IDs just to match the property name.
6. Keep a small receipt with deployment/commit, route, device, session class,
   gate state, pageview request count and GA confirmation. The anonymous visits
   intentionally add a small amount of test traffic: record their exact count
   and times, avoid repeated test spam, and do not claim those visits are real
   audience growth. Record the clean-baseline cutover only after both controls
   pass. Repeat on mobile and locale-specific routes before certifying those
   combinations.

A decline or absence in aggregate pageviews is not enough to certify owner
exclusion: both the negative operator control and the positive visitor control
must pass. No production control is claimed completed by this source change.
