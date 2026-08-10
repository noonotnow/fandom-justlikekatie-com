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
Functions backend (`netlify/functions/`) — including the canonical Fandom
Idea Packet handoff to MEDIA and CREATE, the legacy Send-to-PLAN adapter, and
image-search/ranking helpers. CREATE and PLAN remain separate repositories.

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

Netlify build config (`netlify.toml`): `command = "npm install && npm run
build"`, `publish = "dist"`, functions directory `netlify/functions`. No
`cd` into a subdirectory is required — repo root is the deploy root.

## Idea Packet → CREATE deployment

The primary Idea Packet completion action posts only the authenticated packet
ID, version, selected output IDs, and the fixed render contract to the
same-origin `/api/create-handoff` Netlify Function. Browser PNG bytes, URLs,
filenames, and provenance labels are never accepted. The function renders each
PNG deterministically from the persisted packet selection, registers it through
canonical MEDIA, and signs the existing `fandom.static-deliverable.v1` CREATE
intake envelope. Before any upstream call it checkpoints an immutable attempt in
the `idea-packet-handoff-attempts` Blob store; retries reuse its exact render
bytes, checksums, MEDIA descriptors, generated time, and source CAS until a
receipt succeeds or a packet mutation supersedes it. Persisted MEDIA URLs must
be stable HTTPS URLs without query strings or fragments, so signed URLs are
never written into retry state. Configure these server-only environment
variables in Netlify:

Pre-PR8 retry pointers (recorded before the attempt-artifact schema existed)
are migrated only when their packet version and source CAS chain still match
the persisted packet exactly — never by trusting identifiers or provenance
alone, since those don't prove an asset's bytes are still intact upstream. A
matching legacy pointer is rendered exactly once, checkpointed as a normal
PR8 attempt artifact, and only then swapped in via an atomic CAS against the
packet entry's ETag; a stale pointer (packet version has since changed) is
simply superseded by a fresh attempt, and any pointer that is malformed or
whose source CAS no longer matches is rejected before any render or upstream
call. Because legacy pointers never persisted per-output bytes, checksums, or
MEDIA descriptors, migration never infers or reuses a historical descriptor —
identifiers and provenance alone are not sufficient, since they cannot verify
that an asset's bytes are still intact upstream. Migration always re-registers
with MEDIA, which deduplicates by checksum and returns the canonical
descriptor for identical bytes, producing at most one final canonical asset
set even if re-rendered bytes differ. As with every other retry record, no
signed URLs are ever persisted for a migrated attempt, only stable canonical
HTTPS descriptor URLs.

- `MEDIA_ASSETS_URL` — canonical MEDIA `POST /v1/assets/images` endpoint
- `MEDIA_ASSETS_TOKEN` — scoped MEDIA bearer credential with `assets:write`
- `CREATE_FANDOM_INTAKE_URL` — authenticated CREATE Fandom deliverable intake
- `CREATE_FANDOM_HMAC_KEY_ID` — active Fandom signing key ID
- `CREATE_FANDOM_HMAC_SECRET` — matching server-only HMAC secret
- `CREATE_APP_URL` — optional; defaults to `https://create.justlikekatie.com`
- `PLAN_OPERATOR_TOKEN` — existing operator-entered bearer key for Fandom admin requests

The browser never receives MEDIA or CREATE credentials. Do not add them as
`VITE_` variables. Deployment must preserve the same-origin redirect for
`/api/create-handoff`.

The server accepts source images only through persisted same-origin proxy
descriptors whose target is a public HTTPS hostname. DNS is pinned to a
validated public address, redirects are revalidated, and private/link-local/IP
literal targets fail before MEDIA. The ordered tray uses the first output as
the CREATE cover and creates or idempotently recovers exactly one canonical
Posts DB Draft. It sends no schedule or publish action. CREATE owns source
version CAS, exact replay, Draft-only recovery, and later-lifecycle fail-closed
behavior. Only `mediaSyncState=synced` is successful; operator divergence stays
a visible conflict and never stores or presents an Open-in-CREATE success link.

### Legacy Send to PLAN deployment

The historical `/api/plan-handoff` adapter remains for compatibility but is
not the primary Idea Packet action. Its existing server-only variables are:

- `MEDIA_UPLOAD_TOKEN` — credential for the legacy media upload service
- `PLAN_REGISTRATION_TOKEN` — credential for legacy PLAN draft registration
- `MEDIA_UPLOAD_URL` — optional legacy media endpoint override
- `PLAN_DRAFT_URL` — optional legacy PLAN endpoint override
- `NOTION_API_KEY` — server-only integration token with access to the Posts DB
- `NOTION_POSTS_DB_ID` — Notion Posts database used by the embedded PLAN view

The handoff function derives `nextAction` only after the media upload
outcome is known. Missing media takes precedence over required copy,
followed by packet review and the current manual XHS-admin paste step.
Every Vibe Atlas handoff explicitly sends the canonical Posts DB
`Type` value `Static`; these generated share cards never register as video.
Series labels are display only; the existing series values sent to PLAN
remain unchanged.

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

## Fandom Admin and Idea Packets

The existing admin entry point (`?admin=true`, persisted for the browser session)
is labeled **Fandom Admin**. Its default workspace is the media-first Idea Packet
workflow; the existing PLAN schedule remains available as a secondary admin tab.
Deep links and the existing admin query parameter remain compatible.

Idea Packets are stored durably in the `idea-packets` Netlify Blobs store through
same-origin `/api/idea-packets` requests. Reads and mutations require the existing
`PLAN_OPERATOR_TOKEN`; no additional client-side secret or database migration is
needed. Packets retain their exact source-card provenance, grid anchor, source
route and result identifiers, actor/vibe metadata, ordered curated media, ordered
selected outputs, working context, stored CREATE receipt, and reversible
`collecting`/`media_compiled` state.

The primary action is **Send to CREATE**. An explicit versioned
`fandom.idea-packet.handoff.v1` JSON download remains available as a fallback;
it is not a success receipt and does not write PLAN.

### Saved collection and history adapter

The existing `vibe-atlas-collection` IndexedDB database remains the anonymous
and offline-first browser collection. Schema version 3 preserves the existing
`cards` and `grids` stores and adds additive sync metadata. Exporting a full Vibe Atlas grid snapshots its stable
grid identity, actor/vibe/date provenance, source result IDs and links, and the
ordered 3×3 media set before the browser share/download completes. Lightbox
bookmarks continue to write to `cards`, now retaining the original result ID and
source URL when available.

Fandom Admin’s **Saved collection** view reads both stores. Exported grids can
anchor a new packet and saved individual results can be added to any collecting
packet. Packet creation copies the identifying metadata and media references, so
later collection edits do not erase packet context.

On startup, an idempotent adapter scans the existing `vibe-atlas-plan` store for
legacy whole-grid records (`gridContext.position === -1`) and exposes them in
the new grid history without deleting or rewriting the old records. No manual
migration is required. Historical PNG downloads that never produced any
browser record cannot be reconstructed; all newly exported grids are recorded.

## Other functions

`netlify/functions/` also includes image-search/ranking helpers
(`preview-search.js`, `baidu-image-search.js`, `actor-packs.js`,
`star-of-day.js`, `rebuild-cache.js`, `log-engagement.js`,
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
`GET /api/create/collection` is separately HMAC-authenticated and read-only.
CREATE has no collection write endpoint and must never own or mutate this data.
