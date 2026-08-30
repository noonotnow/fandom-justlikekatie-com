# Creator OS Addendum — Fandom Vibe Atlas

**Framing.** Fandom is a low-activation-energy collection studio for Rednote
source material. Its purpose is to preserve useful visual signals and move a
saved grid into Creator OS when it is ready to become a draft.

| Room | Role |
| --- | --- |
| **Daily Atlas** | **Inflow** — new curated material arrives through the Star of the Day pipeline. |
| **Saved Collection** | **Shelf** — saved cards and Vibe Atlas grids, available locally and through Collection sync. |
| **Creator OS** | **Draft studio** — receives saved grids through the direct handoff and owns draft development, copy, titles, tags, art direction, and promotion. |
| **Operator Console** | **Operations** — contains PLAN and Court rulings. |

Success metric: **minutes from opening the app to a Rednote-ready share card.**
Not DAU or multi-user generality.

## Current handoff architecture

1. A Vibe Atlas grid is saved to Collection.
2. Collection sync makes the saved grid available under the signed-in
   collection identity.
3. Fandom sends that saved grid directly to Creator OS through the
   same-origin `/api/create-handoff` endpoint.
4. Creator OS creates and owns the Creator Draft. Fandom retains the handoff
   receipt in `creator-draft-handoffs`; the draft and its continuing workflow
   are read in Creator OS.

This is not a packet-based CREATE handoff. Fandom has no active Idea Packet
API, packet Blob store, packet staging area, or packet admin archive.

## Collection Grid Builder

The intended Builder flow is **saved cards → lens → proposed 3×3 → swap slots
→ export → save → Creator OS draft**.

- `dbGetAllCards()` and `dbGetAllGrids()` provide the saved shelf.
- `detectEditorialSets()` and `assembleSmartGrid()` can supply publisher/tag
  cohesion and pose-variety scoring.
- `renderExportCanvas` and `saveShareCard` render exports from a saved grid.
- A builder-generated grid is saved to Collection before it is handed to
  Creator OS; grouping rationale belongs with the saved-grid context supplied
  to the draft.

The Builder should favor explicit tap-to-replace slot swapping and preserve
source provenance. Its output is a saved grid, not an Idea Packet.

## Historical provenance

Historical Idea Packet records and receipts were migrated to CREATE and are
read there as history. They are not replayable Fandom handoffs. Middle-earth
records remain readable through scoped Collection access. This split preserves
useful provenance without restoring retired packet routes or operational
runbooks.