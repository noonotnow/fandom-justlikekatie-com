# Creator OS Addendum — Fandom Vibe Atlas

**Framing.** Fandom is one person's Rednote content studio, optimized for
low-activation-energy output during clinical rotations. The four rooms:

| Room | Repo surface | Role |
| --- | --- | --- |
| **Daily Atlas** | Star of the Day pipeline (`star-of-day.js`, ranking, dedup) | **Inflow** — new curated material arrives on its own every day |
| **Saved Collection** | IndexedDB `CardRecord`/`GridRecord` (`collectionDB.ts`) | **Shelf / archive** — everything worth keeping |
| **Collection Grid Builder** | *to be built* (FandomAdmin) | **Studio** — assemble a post-ready 3×3 from shelf material in under two minutes |
| **CREATE** | Idea Packet handoff (`ideaPackets.ts`, `createHandoff*.ts`) | **Publishing handoff** — captions, titles, tags, art direction, promotion |

Success metric: **minutes from opening the app to a Rednote-ready share card.**
Not DAU, not multi-user generality.

---

## 1. Telemetry prerequisite (done)

Every full 3×3 export now logs a `grid_export` event to the `engagement`
Blob store (`log-engagement.js`) carrying the grid artifact itself:
`gridId`, date, actor, vibe, search spell, edition tier, export variant, and
the 9 image ids (`src/utils/gridExportLog.ts`, called from `useExportCard`).
Dead `batch-metrics.js` was removed. This is the data the Builder's
"export-aware defaults" will read.

## 2. Collection Grid Builder — technical shape

Goal flow: **saved cards → lens → proposed 3×3 → swap slots → export → packet.**

### 2.1 Inventory (existing, reuse as-is)
- `dbGetAllCards()` / `dbGetAllGrids()` — shelf contents (`collectionDB.ts`).
- `detectEditorialSets()` + `assembleSmartGrid()` (`editorialDetection.ts`) —
  currently **unwired**; provides publisher/tag cohesion + pose-variety scores.
- `renderExportCanvas` / `saveShareCard` (`exportCanvas.ts`) — the export
  renderer already accepts any `StarOfDayData`; `starDataFromCollectionGrid()`
  (`collectionHistoryModel.ts`) is the existing adapter from a `GridRecord`.
- `packetFromCollectionGrid()` (`ideaPackets.ts`) — packet anchor + CREATE handoff.
- Perceptual-hash dedup already exists server-side (`lib/image-dedup.js`);
  the Builder needs only a light client-side variant (see 2.3).

### 2.2 Lens selection
A lens is a filter+group over saved cards:

```ts
interface CollectionLens {
  star?: string;        // actorId
  vibe?: string;        // vibe label / spell family
  visualFamily?: string; // editorialSetId from detectEditorialSets
}
```

UI: three chip rows in a new FandomAdmin tab ("Grid Builder"). Selecting chips
narrows the card pool; counts shown per chip so empty lenses are obvious.
Visual families come from running `detectEditorialSets` over the pooled cards
(publisher + tag cohesion); no new ML.

### 2.3 Proposal engine (pure function, unit-testable)
```ts
function proposeGrid(pool: CardRecord[], lens: CollectionLens): GridProposal
// GridProposal = { slots: CardRecord[9], rationale: SlotReason[9] }
```
Ranking per slot: cohesion score of its editorial set (desc), pose-variety
bonus, recency, and — once telemetry accrues — a boost for cards whose vibe/
star appears in prior `grid_export` events. Anti-clustering constraints:
- no two cards with near-duplicate perceptual similarity (reuse thumbnail-URL
  identity now; port `image-dedup` hashing client-side later),
- max 3 cards per editorial set,
- max 4 per source publisher.
The `rationale` array ("same 婚服 editorial", "high pose variety") is kept and
passed downstream — it is exactly the "why these 9 belong together" context
CREATE's Copy Studio needs (see 3).

### 2.4 Slot swapping
Selected proposal renders as a 3×3 with per-slot "swap" affordance: tapping a
slot shows the next-best candidates from the same lens (already ranked by the
proposal engine). No drag-and-drop needed for v1 — tap-to-replace is lower
effort and mobile-friendly.

### 2.5 Export + packet
"Export" builds a `GridRecord` from the 9 slots (id: `builder-<date>-<hash>`),
saves via `dbSaveGrid`, converts with `starDataFromCollectionGrid`, and calls
`saveShareCard` — the same renderer, edition-tier stamping, and now the same
`grid_export` logging as the daily path. "Send to CREATE" calls
`packetFromCollectionGrid` with the rationale strings appended to the packet
context.

### 2.6 Build order
1. Grid Builder tab + lens chips + pool grid (read-only) — 1 session
2. `proposeGrid` + tests + 3×3 preview with swap — 1–2 sessions
3. Export + packet wiring (mostly existing calls) — small
4. Export-aware ranking boost (needs a `grid_export` read endpoint) — later

## 3. Fandom → CREATE handoff: templateyness findings

CREATE's Copy Studio **exists and is strong** (OpenAI, 3 angles / 20 Rednote
titles / 3 captions / comment prompts / tag variants / template-risk score /
AI-art-directed visual theme incl. grid-3x3 compositions, explicit
anti-template prompt rules). The residual sameness comes from the **data
contract**, not the generator:

- `packetBrief` (what the model sees) sends only: packet title, notes,
  context, platform, format, toneHint, retained copy, and per-media
  `role/notes/title/actor/vibe`.
- **Not sent by the live handoff:** search spell, vibe subtitle
  (= Fandom's `captionSeeds`), `ctaSeed`, edition tier, generation prompt,
  grid grouping rationale, export history. `captionSeeds` reaches CREATE only
  via the one-time migration (folded into `context` text) — the live
  collection-read contract (`fandom.collection-read.v1`) drops all of it.
- Smallest contract fix: extend the collection-read grid DTO + packet snapshot
  with `searchSpell`, `vibeSubtitle`, `ctaSeed`, `tier`, and (from the
  Builder) `groupingRationale`. The Copy Studio prompt already art-directs
  from packet context, so richer context = less generic copy with zero
  generator changes.
