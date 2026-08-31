# Daily Drop visual composite fixture baseline

This corpus measures the seam detector against internally captured search
thumbnails and internally created poster fixtures. The files remain local test
fixtures; tests never fetch their source URLs.

## Current decision rule

A fingerprint has visual composite evidence when either:

- `compositeScore >= 0.68`, or
- `singleFrameRatio < 0.55`

The second condition makes the practical score boundary greater than `0.45`
because `singleFrameRatio` is currently `1 - compositeScore`.

## Captured-corpus result

| Metric | Current result |
| --- | ---: |
| True positives | 1 |
| False positives | 1 |
| False negatives | 5 |
| True negatives | 4 |
| Precision | 50.00% |
| Recall | 16.67% |

The current threshold preserves the captured ordinary single frame, but it does
not reliably catch real search collages. Five of six labeled collages pass the
visual gate. One of two poster fixtures is incorrectly rejected.

## Fixture coverage

The manifest at
`netlify/functions/lib/fixtures/search-thumbnail-composite-corpus.json` includes:

- an ordinary single frame;
- a guttered four-panel collage;
- no-gutter two- and three-panel collages;
- two poster layouts; and
- two text-heavy single stills.

`image-dedup.test.js` recalculates every fingerprint and locks the confusion
matrix, precision, recall, category coverage, and single-frame preservation to
this baseline. The existing synthetic contact-sheet regression remains in
place, as does the curation test proving a detected composite is removed before
its internal variety can earn board score.

## Threshold decision

No threshold change is made from this small corpus alone. Lowering the cutoff
enough to catch more no-gutter collages would also reject at least one poster,
so the detector needs a stronger panel-boundary signal or a larger representative
corpus before tuning. Any future detector or threshold change must update this
report intentionally and keep the single-frame regression green.