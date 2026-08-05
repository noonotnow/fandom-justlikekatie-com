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

The primary Idea Packet completion action posts exact rendered PNGs to the
same-origin `/api/create-handoff` Netlify Function. The function registers
each selected output through canonical MEDIA and signs the existing
`fandom.static-deliverable.v1` CREATE intake envelope. Configure these
server-only environment variables in Netlify:

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

The handoff registers the ordered selected-output tray, uses the first item as
the CREATE cover, and creates or idempotently recovers exactly one canonical
Posts DB Draft. It sends no schedule or publish action. CREATE owns source
version CAS, exact replay, Draft-only recovery, and later-lifecycle fail-closed
behavior. A successful receipt stores the exact Posts ID/URL and exposes an
`Open in CREATE` deep link.

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

The existing `vibe-atlas-collection` IndexedDB database remains the canonical
browser collection. Schema version 2 preserves the existing `cards` store and
adds a `grids` store. Exporting a full Vibe Atlas grid now snapshots its stable
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
