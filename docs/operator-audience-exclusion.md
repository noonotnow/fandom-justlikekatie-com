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
  app reports the resulting session, and the page location sent to Google never
  includes the URL fragment (the magic-link token lives there).
- Logout, account switch and session changes are reported through
  `getPublicSession()`/`logoutPublicAccount()` in `src/utils/publicAccount.ts`.
- `trackEvent` (`src/utils/analytics.ts`, Google and Umami) runs through the gate.
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

- `node --test tests/analyticsHostGuard.test.mjs` - gate states, hosts, fallback, token handling
- `node --import tsx/esm --test tests/audienceAnalytics.test.ts` - `trackEvent` gating
- `node --test netlify/functions/lib/operator-audience-exclusion.test.js` - server exclusion with ordinary-member and anonymous positive controls

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
