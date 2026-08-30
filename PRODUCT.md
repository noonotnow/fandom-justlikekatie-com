# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Katie is the initial internal operator, collecting media signals and shaping
them into reusable editorial possibilities. The collection model should remain
neutral enough to support future collectors building their own themed shelves.

## Product Purpose

FANDOM is a media-first collection workbench. It saves Vibe Atlas grids and
selected results as reusable editorial source material, then hands saved grids
to Creator OS for draft creation.

## Positioning

FANDOM sits before a Creator Draft: it preserves source material and
provenance while leaving Creator OS to shape a grid into one carousel, several
posts, lore, an explainer, a legendary or misprint entry, or a comparison.

## Operating Context

Operators start with a generated Vibe Atlas grid, curate individual media in
the lightbox, save the material to Collection, and hand a saved grid directly
to Creator OS through `/api/create-handoff`. The Operator Console separately
contains PLAN and Court rulings.

## Capabilities and Constraints

- Visuals are selected before copy is refined.
- A saved grid is the Creator Draft source; individual results are reusable
  collection media.
- Saving or handing off material never means published or ready to publish.
- Exact duplicate media must not be added.
- Admin mutations require the existing operator authorization boundary.
- Collection remains the FANDOM source of truth; Creator OS owns its drafts.
- Social, trading, multiplayer, and consumer account systems are out of scope.

## Brand Commitments

Preserve the incumbent Vibe Atlas identity and its bilingual, gold-accented visual language. CurioSeek doctrine may inform concise product language: Collect signals → shape systems → move mountains.

## Evidence on Hand

The app contains generated daily-grid data, source result identifiers and URLs,
actor and vibe metadata, an IndexedDB saved-card collection and legacy PLAN
grid records, Collection sync, an operator authorization flow, and the Creator
OS handoff.

## Product Principles

- Media first, copy second.
- Keep possibility open until Creator OS shapes a specific output.
- Preserve provenance from collection through handoff.
- Compilation is an operational milestone, not publication.
- Reuse existing ecosystem contracts; never imply a handoff occurred when it did not.

## Accessibility & Inclusion

Core curation actions must work with keyboard and touch. Reordering must include explicit non-drag controls, and loading, empty, error, duplicate, stale-media, and unauthorized states must be visible.
