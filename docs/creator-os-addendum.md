# Workstation Addendum — Fandom Vibe Atlas

**Framing.** Fandom is a low-activation-energy collection studio for Rednote
source material. Its purpose is to preserve useful visual signals and move a
saved grid into Workstation when it is ready to become a draft.

| Room | Role |
| --- | --- |
| **Daily Atlas** | **Inflow** — new curated material arrives through the Star of the Day pipeline. |
| **Saved Collection** | **Shelf** — saved cards and Vibe Atlas grids, available locally and through Collection sync. |
| **Workstation** | **Draft studio** — receives saved grids through the direct handoff and owns draft development, copy, titles, tags, art direction, and promotion. |
| **Operator Console** | **Operations** — contains the private Actor Preflight, proposed Release Desk, PLAN schedule, and Court rulings. |

Success metric: **minutes from opening the app to a Rednote-ready share card.**
Not DAU or multi-user generality.

The Release Desk proposal defines the boundary between Fandom Vibes editorial
operations and Workstation:
[`release-desk-architecture.md`](./release-desk-architecture.md).

## Current handoff architecture

1. A Vibe Atlas grid is saved locally.
2. Fandom incrementally persists every grid source image to MEDIA and saves the
   durable references before syncing Collection.
3. Collection sync makes the durable saved grid available under the signed-in
   collection identity.
4. Fandom sends the saved grid directly to Workstation through the
   same-origin `/api/workstation-handoff` endpoint.
5. Workstation creates or updates and exclusively owns the Creator Draft. Fandom retains the handoff
   receipt in `creator-draft-handoffs`; the draft and its continuing workflow
   are read in Workstation.

This is not a packet-based Create handoff. Create is historical/read-only only.
Fandom has no active Idea Packet
API, packet Blob store, packet staging area, or packet admin archive.

## Workstation contract

Fandom emits `fandom.static-deliverable.v1` with `workflow: direct`,
`outputKind: live_grid`, `directOrigin: { kind: "grid", id: gridId }`, stable
`outputId`, `deliverableId`, and `renderVariant`, numeric `sourceVersion` and
receipt-store-derived `expectedSourceVersion`, ordered durable `sourceCards`,
one canonical rendered cover in `mediaAttachments`, a `publicationBrief`, and
a `draft` projection.

Each source card preserves `id`, `order`, `imageUrl`, `sourceUrl`, optional
`title`, `creator`, `capturedAt`, and `provenance`, and adds the complete MEDIA
reference. `imageUrl` is always the MEDIA `deliveryUrl`; `sourceUrl` remains
the original attribution/click-through URL. The direct identity and
`Idempotency-Key` are exactly
`fandom/direct/grid/{gridId}/{outputId}`.

The receipt is limited to `deliverableId`, `postId`, `postUrl`, `deepLink`,
`status`, numeric `sourceVersion`, `workflow: direct`, `disposition`
(`created`, `replayed`, or `updated`), `mediaSyncState` (`synced` or
`operator-diverged`), and `warnings`. A direct receipt does not require a
project ID.

## Collection Grid Builder

The intended Builder flow is **saved cards → lens → proposed 3×3 → swap slots
→ export → save → Workstation draft**.

- `dbGetAllCards()` and `dbGetAllGrids()` provide the saved shelf.
- `detectEditorialSets()` and `assembleSmartGrid()` can supply publisher/tag
  cohesion and pose-variety scoring.
- `renderExportCanvas` and `saveShareCard` render exports from a saved grid.
- A builder-generated grid is saved to Collection before it is handed to
  Workstation; grouping rationale belongs with the saved-grid context supplied
  to the draft.

The Builder should favor explicit tap-to-replace slot swapping and preserve
source provenance. Its output is a saved grid, not an Idea Packet.

## Historical provenance

Historical Idea Packet records and receipts remain in Create and are
read there as history. They are not replayable Fandom handoffs. Middle-earth
records remain readable through scoped Collection access. This split preserves
useful provenance without restoring retired packet routes or operational
runbooks.