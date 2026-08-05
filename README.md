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
Functions backend (`netlify/functions/`) — including the Fandom-side
producer for the Send-to-PLAN flow and image-search/ranking helpers. PLAN
itself (the editorial scheduling app) is a separate repository
(`noonotnow/weibo-scheduler`); only Fandom's *client and producer* code for
that integration lives here.

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

## Send to PLAN deployment

The browser posts generated PNGs and draft metadata to the same-origin
`/api/plan-handoff` Netlify Function. Configure these server-only
environment variables in Netlify (values are never stored in this repo):

- `MEDIA_UPLOAD_TOKEN` — credential for the media upload service
- `PLAN_REGISTRATION_TOKEN` — credential for PLAN draft registration
- `MEDIA_UPLOAD_URL` — optional; defaults to the current media integration URL
- `PLAN_DRAFT_URL` — optional; defaults to the current PLAN drafts URL
- `NOTION_API_KEY` — server-only integration token with access to the Posts DB
- `NOTION_POSTS_DB_ID` — Notion Posts database used by the embedded PLAN view
- `PLAN_OPERATOR_TOKEN` — operator-entered bearer key required for Posts reads and writes

No `VITE_`-prefixed client-side secret is used anywhere in this flow.

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
needed. Packets retain their grid anchor, source route and result identifiers,
actor/vibe metadata, ordered media, working context, and reversible
`collecting`/`media_compiled` state.

The first release intentionally downloads a versioned
`fandom.idea-packet.handoff.v1` JSON artifact after media compilation. CREATE/PLAN
does not yet expose a packet-level destination, so this workflow does **not**
create a Posts DB row or claim an external handoff occurred. A later importer can
consume the artifact without changing the packet model.

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
