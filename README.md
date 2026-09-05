# fandom-justlikekatie-com

**Domain:** `fandom.justlikekatie.com`
**Deploys:** This repository's root is the *only* thing deployed to the
Netlify site serving that domain. There is nothing else here — no unrelated
projects, no dashboard "Base directory" trick needed to find the right code.
**Origin:** Extracted from
[`noonotnow/stalwart-strudel-413ae3`](https://github.com/noonotnow/stalwart-strudel-413ae3)
(now retired). See `MIGRATION.md` for exact provenance (source commit,
paths, what was and wasn't carried over).

## What this is

A React + TypeScript + Vite "Vibe Atlas" front end, plus its Netlify
Functions backend (`netlify/functions/`) — including Saved Collection sync,
the direct Workstation handoff, and image-search/ranking helpers. Workstation
and the Operator Console remain separate systems.

## Build & run

```sh
npm install
npm run dev      # local dev server
npm run build     # tsc -b && vite build -> dist/
npm run preview   # preview the production build
npm run lint      # oxlint
npm test          # runs both app + functions test suites
npm run test:app       # tests/*.test.ts
npm run test:functions # netlify/functions/lib/*.test.js
```

Netlify build config (`netlify.toml`): Netlify installs the exact pnpm version
declared by `package.json` and runs `command = "pnpm run build"`, with
`publish = "dist"` and functions directory `netlify/functions`. No `cd` into a
subdirectory is required — repo root is the deploy root.

### Dependency resolver parity

`package.json` is the single source of truth for pnpm (`packageManager`).
Netlify reads that exact version when it detects `pnpm-lock.yaml`, and GitHub
Actions installs and verifies the same version before checking the lockfiles.
Run `netlify build --offline` to confirm the configured build command is
`pnpm run build`. After a hosted deploy, confirm the dependency-install log
reports pnpm `10.26.1`; that hosted pre-build log is the authoritative check
that Netlify honored the repository pin.

## Saved Collection → Workstation

Saved Vibe Atlas grids remain canonical in Collection. Before handoff, Fandom
persists every source image as a durable MEDIA asset, saves those references,
and syncs the selected grid. Fandom then sends the grid to Workstation through
the same-origin `/api/workstation-handoff` endpoint. Workstation exclusively
owns the resulting Creator Draft; receipts remain in
`creator-draft-handoffs`.

The browser never receives MEDIA or Workstation credentials. Deployment must
preserve the same-origin redirect for `/api/workstation-handoff`; do not expose server
credentials as `VITE_` variables.

Historical Idea Packet records and their receipts remain in Create.
Create is historical/read-only only, rather than an active Fandom API,
archive, staging area, or handoff path. Middle-earth records remain readable
through their scoped Collection access.

Configure these server-only variables for new draft handoffs:

- `MEDIA_ASSETS_TOKEN`
- `MEDIA_ASSETS_URL` (optional; defaults to `https://media.justlikekatie.com/v1/assets/images`)
- `WORKSTATION_FANDOM_INTAKE_URL` (optional; defaults to `https://workstation.justlikekatie.com/api/integrations/fandom/projects`)
- `WORKSTATION_FANDOM_HMAC_KEY_ID`
- `WORKSTATION_FANDOM_HMAC_SECRET`
- `WORKSTATION_APP_URL` (optional; defaults to `https://workstation.justlikekatie.com`)

Remove the retired `CREATE_FANDOM_INTAKE_URL`, `CREATE_FANDOM_HMAC_KEY_ID`,
`CREATE_FANDOM_HMAC_SECRET`, and `CREATE_APP_URL` variables after rollout.
`/api/create-handoff` is a temporary same-origin alias to the Workstation-only
function and may be removed once deployed clients use the new route.

### Stripe billing on the external Netlify deployment

The production site is hosted on Netlify rather than inside the Replit runtime,
so its billing functions cannot read the attached Replit Stripe connector. Set
these as server-only Netlify environment variables before testing membership:

- `STRIPE_SECRET_KEY` — Stripe test-mode secret key
- `STRIPE_WEBHOOK_SECRET` — signing secret for the managed
  `https://fandom.justlikekatie.com/api/billing/webhook` endpoint
- `FANDOM_STRIPE_MEMBERSHIP_PRICE_ID` — the active test-mode membership Price ID
- `FANDOM_PUBLIC_ORIGIN` — `https://fandom.justlikekatie.com`

External Netlify billing stores its account-to-membership mapping in the
existing Netlify Blobs setup, so it does not need the Replit `DATABASE_URL`.
The Replit connector and Postgres Stripe Sync remain the local/development
fallback. Never prefix these secrets with `VITE_`, commit them, or expose them
in browser responses.
The browser never receives MEDIA or Workstation credentials. Do not add them as
`VITE_` variables. Deployment must preserve the same-origin redirect for
`/api/workstation-handoff`.

The browser also never receives `XAI_API_KEY`. Configure it directly in the
Netlify site's environment variables before deploying AI generation; Replit
development uses the attached xAI connector without exposing a provider key.

## PLAN editorial scheduling

The admin-only PLAN view reads and updates the Notion Posts DB through
`/api/plan-posts`. `ScheduledDate` may remain a legacy `YYYY-MM-DD` value,
but new edits write a real ISO datetime instant selected in
`America/New_York`. China labels are derived at runtime with the
`Asia/Shanghai` IANA timezone.

Scheduling is editorial intent only. There is no timer, cron, background
publisher, MCP invocation, or automatic status transition. Mutations send
the last Notion edit timestamp and reject stale updates with a conflict
rather than overwriting a concurrent edit. Only `ScheduledDate` and the
selected canonical status are included in Notion update payloads.

PLAN also owns the manual Rednote operator lifecycle. The browser sends an
operator-authenticated request to the same-origin
`/api/plan-operator-scheduled` Netlify Function after the operator has
scheduled the exact Approved post in Rednote Creator. The function forwards
the Notion page ID, current Notion edit timestamp, exact timezone-bearing
`ScheduledDate`, and an idempotency UUID to XHS. It never changes Status to
Published and never invents a public URL, note ID, publication time, or
metrics. After success, PLAN refreshes the exact Notion page and shows the post
in **Receipt Pending** until XHS reconciliation is complete.

Configure these server-only Netlify variables:

- `PLAN_INTEGRATION_TOKEN` — bearer credential accepted by the XHS PLAN integration
- `PLAN_XHS_BASE_URL` — optional XHS origin override; defaults to `https://xhs.justlikekatie.com`
- `PLAN_XHS_TIMEOUT_MS` — optional upstream timeout in milliseconds; defaults to `5000` and must be `500`–`15000`

`PLAN_OPERATOR_TOKEN` remains the browser-entered operator credential for the
same-origin PLAN request. `PLAN_INTEGRATION_TOKEN` must never be exposed as a
`VITE_` variable or sent to the browser. XHS migration 015 and the deployment
containing the operator-scheduled integration endpoint are prerequisites.
When the token or upstream endpoint is unavailable, Rednote execution state is
shown as unavailable and ready posts are removed from the dispatchable lane.
The public URL follow-up links to the XHS Admin root because no exact supported
reconciliation deep link exists.

## Operator Console and Saved Collection

The Operator Console contains PLAN and Court rulings. It is separate from the
Creator Draft handoff and does not provide an Idea Packet archive or staging
workflow.

### Saved collection and history

The existing `vibe-atlas-collection` IndexedDB database remains the anonymous
and offline-first browser collection. Schema version 3 preserves the existing
`cards` and `grids` stores and adds additive sync metadata. Exporting a full Vibe Atlas grid snapshots its stable
grid identity, actor/vibe/date provenance, source result IDs and links, and the
ordered 3×3 media set before the browser share/download completes. Lightbox
bookmarks continue to write to `cards`, now retaining the original result ID and
source URL when available.

Saved collection views read both stores. Saved grids are the source for
Collection sync and the direct Workstation handoff.

On startup, an idempotent adapter scans the existing `vibe-atlas-plan` store for
legacy whole-grid records (`gridContext.position === -1`) and exposes them in
the new grid history without deleting or rewriting the old records. No manual
migration is required. Historical PNG downloads that never produced any
browser record cannot be reconstructed; all newly exported grids are recorded.

## Other functions

`netlify/functions/` also includes image-search/ranking helpers
(`preview-search.js`, `baidu-image-search.js`, `actor-packs.js`,
`star-of-day.js`, `rebuild-cache.js`, `log-engagement.js`,
`engagement-export.js`,
`batch-metrics.js`, `image-proxy.js`). See `docs/release-notes.md` for their
change history and `QA_ISSUES.md` for known/tracked issues.

## Public Saved Collection identity and sync

Fandom canonically owns Saved Collection. Anonymous saves remain local; signing
in with the same email on multiple browser profiles, computers, or phones can
merge each device into one account collection. Every browser profile requires
explicit first-merge consent. Local save/remove continues when signed out or
offline.

Passwordless sign-in is delivered through Resend from the dedicated
`auth.justlikekatie.com` sender domain. Google Workspace remains the apex
domain's human-mail provider. Configure the exact SPF/DKIM records supplied by
Resend and DMARC for the auth subdomain, then set these server-only Netlify
variables:

- `RESEND_API_KEY`
- `FANDOM_AUTH_FROM_EMAIL` (`Fandom <login@auth.justlikekatie.com>`)
- `FANDOM_PUBLIC_ORIGIN` (`https://fandom.justlikekatie.com`)
- `FANDOM_AUTH_ID_SECRET` (durable random secret; rotation requires migration)
- `CREATE_FANDOM_COLLECTION_READ_KEY_ID`
- `CREATE_FANDOM_COLLECTION_READ_SECRET`

Never expose these as `VITE_` variables. The browser receives only an HttpOnly,
Secure, SameSite session cookie. Auth records use the
`fandom-auth-users`, `fandom-auth-magic-links`, `fandom-auth-sessions`, and
`fandom-auth-rate-limits` Blob stores. Versioned per-user collections live in
`fandom-user-collections` with stable UUIDs, revisions, cursors, idempotent
mutations, account-scoped pending queues, bounded draining batches, and
tombstones. Every browser sync sends its expected account ID in addition to the
HttpOnly cookie; the server rejects the request if another tab has replaced the
shared session cookie.

Public endpoints are `/api/auth/magic-link`, `/api/auth/verify`,
`/api/auth/session`, `/api/auth/logout`, and `/api/collection/sync`.
`GET /api/create/collection` is a historical, separately HMAC-authenticated
read-only endpoint. Create has no collection write endpoint and must never own
or mutate this data.
