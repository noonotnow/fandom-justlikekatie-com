# Daily Drop layout review

Review prepared October 3, 2026. This is a layout-only release, separate from the participation release.

## External review preview

- English: https://6ac053a1f800e64b68e905d0--earnest-gecko-17eb0c.netlify.app/vibe-atlas
- Simplified Chinese: https://6ac053a1f800e64b68e905d0--earnest-gecko-17eb0c.netlify.app/zh-cn/vibe-atlas

These are immutable Netlify draft URLs. No production deployment or GitHub merge was performed. Creator approval is required before publishing this layout.

## Layout

The existing type, colors, reaction controls, image cards, and export designs are retained. The shortened introduction still explains the actor × vibe × nine-card promise and links to the Drop and Builder.

The Daily Drop is one section: actor, vibe, description, interactive grid, whole-board reactions and exports. Individual saves remain on cards; reporting and report status remain in each image's enlarged view. Whole-grid viewing is immediately above the grid. Legendary reasons and the guide remain optional and collapsible.

Publication status and Collector discovery follow the entire Drop. The immutable first-grid snapshot is collapsed initially and explicitly described as potentially matching or differing from the displayed board. A published editorial pack retains its separate permanent-record link. Actor and edition public-record links are preserved when approved metadata supplies them.

Archived editions use the same content/action order, retain copy-link and rebuild actions, and link to the edition-specific Builder source. Loading, empty, and error boards have no usable whole-board action panel; access gates retain their existing sign-in/upgrade controls.

## Local verification

Passed:

- `npm run check:types`
- `npm run build` (existing bundle-size warning)
- `npm run lint` (warnings remain; no errors)
- `git diff --check`
- `node --import tsx/esm --test tests/wholeCardTier.test.ts` — 11 tests, including exact-composition isolation and export reaction metadata.
- Focused browser tests listed below — 40 cases passed across the final relevant runs.

Browser suites:

```sh
node --import tsx/esm --test --test-concurrency=1 \
  tests/browser/dailyDropLayout.test.ts \
  tests/browser/dailyImageReportParticipation.test.ts \
  tests/browser/dailyArchiveClipboard.test.ts \
  tests/browser/archiveImageSaveBoundary.test.ts \
  tests/browser/exportHistoryRefresh.test.ts \
  tests/browser/squareExportLayout.test.ts
```

The new layout regressions use Chromium with controlled responses:

- English and Chinese at 390px and 1280px; content order, actual tab order, no horizontal overflow.
- Reactions, Legendary reasons, guide expansion, snapshot expansion, and whole-grid viewing do not implicitly save or reset selections.
- Explicit single-card saves remain independent of board exports.
- Download/share retain the 1080×1350 finished PNG; publishing handoff retains the distinct 1080×1080 raw PNG, including existing filenames and labels.
- Successful exports preserve the editable Collection grid without duplicating individually saved cards.
- Loading, empty, error, stale, archived, sign-in gated, published, unpublished, and unavailable-publication states.

Existing browser suites exercise report editing/own-status and magic-link draft recovery, archive save authorization, archive clipboard behavior, export-history refresh, canvas composition, and provenance. The save-boundary, clipboard, and history suites also cover Firefox and WebKit. No authorization, synchronization, entitlement, participation-hook, export-renderer, or publication-manifest code was changed.

## Hosted-preview verification

The anonymous draft was checked with real hosted data in English and Chinese at 390px and 1280px:

- All nine actual image cards loaded.
- Actor/context preceded the grid; board actions followed the grid; discovery followed all board controls.
- No horizontal overflow or uncaught browser errors.
- Whole-grid viewing, selected reaction/reason retention, keyboard-expanded help, collapsed/expandable immutable snapshot, and image-level reporting affordances worked.
- Desktop and mobile screenshots were inspected.
- The actual publication endpoint returned a nine-card immutable snapshot for the displayed actor/vibe/date.

Reproduce the non-mutating hosted check:

```sh
node --import tsx/esm scripts/check-daily-drop-layout-preview.ts \
  https://6ac053a1f800e64b68e905d0--earnest-gecko-17eb0c.netlify.app
```

This check deliberately does not request sign-in emails, submit reports, save cards, or export to hosted storage. Signed-in hosted UI, real magic-link delivery, paid access, and authenticated hosted save/export persistence were **not** verified on the preview. Those behaviors were exercised with controlled local fixtures. The ordinary Replit Vite preview has no Netlify data backend and therefore displays the existing truthful service-unavailable state; use the external draft to review actual cards.