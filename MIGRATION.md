# Migration provenance

This repository was extracted from
[`noonotnow/stalwart-strudel-413ae3`](https://github.com/noonotnow/stalwart-strudel-413ae3)
as part of a one-repo-per-deployment split.

- **Source repo:** `noonotnow/stalwart-strudel-413ae3`
- **Source commit at time of extraction:** `ef03ad32347dfabe1b06354163b8f1186ad9596e`
  ("Add coming-soon landing page for justlikekatie.com (#73)")
- **Extraction date:** 2026 (see this repo's first commit timestamp for the
  exact date)
- **Paths carried over (history-filtered via `git filter-repo`, then
  flattened to repo root in one follow-up commit):**
  - `phase0/` → repo root (React + Vite "Vibe Atlas" app)
  - `netlify/functions/` → `netlify/functions/` (unchanged path)
  - `netlify.toml` → repo root, rewritten for flattened build/publish paths
    (build command no longer needs `cd phase0`; publish is now `dist`
    instead of `phase0/dist`)
  - `docs/release-notes.md` → `docs/release-notes.md` (unchanged path)
  - `QA_ISSUES.md` → repo root (unchanged path)
  - `package.json` / `package-lock.json` — merged: the app's dependencies
    (`react`, `react-dom`, Vite/Tailwind/TypeScript tooling) and the
    functions' dependencies (`@netlify/blobs`, `sharp`) now live in a single
    root `package.json`. The lockfile was regenerated fresh rather than
    merged by hand.

**Not carried over:** the legacy root `index.html` and root `assets/`
directory from the source repo. That code was dead — superseded by
`phase0` in production well before this extraction — and remains fully
recoverable from the source repo's history if ever needed. The apex
`site/` directory (a separate, unrelated deployable) was intentionally
excluded; see `justlikekatie-com` for that.

Git history for the paths above is preserved (not squashed) up to the
source commit listed. Blame/authorship for pre-existing lines is intact.
