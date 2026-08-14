# Backlog

Ideas that are worth doing but are not scheduled. Each entry records enough
context to pick it up cold, including what we already know about feasibility.

## One-time Google Drive filename backfill

**Status:** deferred, not scheduled. Do not mix into the `card-metrics` /
metrics-health work.

**Goal:** historical *identity* recovery from exported card filenames sitting in
Google Drive — which cards existed, which were exported, which were marked
Legendary or Misprint. Explicitly **not** analytics reconstruction: the point is
to recover known artifacts, not to rebuild trustworthy historical trends.

**Precondition:** `/api/card-metrics` is deployed and the post-deploy smoke
script has passed against a real database. The clean baseline has to exist and be
proven before anything is layered underneath it.

### Feasibility: read this before estimating

The export filename is built at `src/components/ExportCardButton/ExportCardButton.tsx`
and is currently:

```
vibe-atlas-{actorSlug}-{date}.png
```

where `actorSlug` is the display name lowercased with non-alphanumeric runs
collapsed to dashes (CJK preserved), and `date` is the board's *captured* date.

That means the filename encodes only two fields, and both are lossy:

- **No image id.** The stable identity the new event log is built on does not
  appear in the filename at all. This is the same actor-plus-date composite that
  caused the original analytics failure, one layer out.
- **Filenames collide.** Exporting two different images from the same actor and
  date produces the identical filename; the browser disambiguates with
  `(1)`, `(2)` suffixes, which carry no information about *which* image. Drive
  filenames therefore cannot distinguish one card from another within a board.
- **No tier.** Legendary/Misprint is rendered into the image pixels but never
  written into the filename. Recovering tier from Drive would require reading the
  rendered PNGs, not parsing names.
- **The date is not the export time.** It is the board's captured date. Drive's
  own `createdTime` is a closer proxy for when the export happened, but it
  reflects upload time and is noisy.
- **The slug is not reversible.** Two distinct display names can slug to the same
  string, and the original casing and punctuation are gone.

Realistic ceiling on a filename-only parse: *"someone exported a board for actor
X, whose captured date was Y, and the file reached Drive around Z."* Per-image
identity and tier are not recoverable this way. Scope the task against that
ceiling rather than the hoped-for one — the optimistic version of this import
does not exist.

### If it is built anyway

Design constraints, in priority order:

1. **Backfilled rows must be distinguishable from live rows.** Either a separate
   table or an explicit provenance column on `card_events`. Dashboards exclude
   backfilled data from clean post-deploy trend charts by default.
2. **Preserve the evidence, not just the conclusion:** Drive file id, original
   filename, parsed fields, parsed date and whether it is trusted, a confidence
   level, and the stable image id if one could be matched.
3. **Unmatched files stay unmatched.** A file that cannot be confidently tied to
   a stable image id is stored as an unresolved historical export. Do not force
   it into live card metrics to make a number look complete — that is how the
   fake-spike failure mode returns.
4. **Idempotent.** Keyed on Drive file id so a re-run does not duplicate.

### Cheap change that would make future archaeology possible

Including the image id in the export filename is roughly a one-line change and
would make every *future* export self-identifying, which is most of what this
import wishes it had. Worth considering on its own merits, independent of whether
the backfill ever happens. It does nothing for files already in Drive.
