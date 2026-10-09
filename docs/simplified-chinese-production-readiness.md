# Simplified Chinese production final-pass report

## Release state

The creator-approved final-review release is live. PR #172 was merged on
2026-10-02; Netlify published commit `6dd6b6424a414fd8061dd41fdccaf131e0a7f5ca`
as production deploy `6ac023db6659fa0009b26618`. The custom domain's script
references match the immutable deployment.

The final visual pass found and corrected a display-font fallback gap.
PR #173 passed its required hosted tests and was merged by the creator.
Netlify published merge commit `7c4b110d889739457979843dc216178babd05444`
as production deploy `6ac03e214fcf930008814bde` at
2026-10-02T23:29:28.236Z. The custom domain matches its immutable deployment's
asset references and serves the exact verified self-hosted font stylesheet.
Production desktop and mobile visual checks now show readable Chinese headings
and navigation. No branch protection was bypassed.
Native-speaker approval has not been obtained; the editorial packet identifies
the remaining review questions. No claim of mainland-China availability or
verified Chinese hosted checkout/email behavior is made.

The production site was verified through Netlify's API:
`https://fandom.justlikekatie.com`.

## Original clean release candidate (historical)

- Branch: `release/simplified-chinese-final-pass-ready`
- Production baseline: `1e8a51412712aec13baf5dfe9be7d3f485769cff`
- Localization source: `bba8df8a340525e900f460952a36c0fca7d078d2`
- Candidate commit: `58de26fe79fe2f93a464024c6824d6c1569f2789`
- Release PR: https://github.com/noonotnow/fandom-justlikekatie-com/pull/172
- Verified external review entry:
  https://deploy-preview-172--earnest-gecko-17eb0c.netlify.app/zh-cn/

The candidate is based on GitHub's production `main`, not a push of workspace
history. It includes the localized core journey, grids, account flows, public
delivery, fonts and decoder, plus the compatibility dependencies required by
their checks. It preserves the existing Daily Drop save fix.

Production's workflows, dependency declarations/lockfiles, private admin
components, companion pilot, published article pages and watch-availability
record are retained. Workspace copies, private operational artifacts and
unrelated editorial changes are not included.

## Completed local checks on the candidate

- Frozen pnpm lockfile check and production lockfile consistency.
- TypeScript/Vite production build.
- Application tests: 435 passed.
- Backend tests: 1,091 passed.
- Script tests: 546 passed; two existing intentional skips.
- Release-tree check: no nested workspace copies or browser crash state.
- Pinned Netlify offline build, function/edge packaging and scheduled-function
  validation: passed.
- Focused browser checks: 33 distinct cases passed across Chromium, Firefox and
  WebKit. Four Firefox/WebKit draft/export cases initially timed out during
  concurrent packaging; all four passed when rerun in isolation with unchanged
  code and assertions. This is not a claim that the full browser suite passed.

The original release PR is merged and deployed.
Both full hosted test runs, migrations and import guards passed on the latest
candidate. The preview is ready at the candidate commit: its Chinese entry,
decoder, actor, edition and released-pack URLs returned HTTP 200 with
server-visible `lang="zh-CN"`, Chinese titles, production locale canonicals and
noindex protection. Its complete sitemap advertises verified Chinese records
through reciprocal language alternatives.

The first hosted run exposed private operator evidence links being rewritten by
the locale wrapper. Locale controls/link rewriting now exclude private operator
locations and destinations; both operator regressions and the cross-browser
Chinese core checks passed before the successful hosted runs.

Browser account and data checks use controlled fixtures, not a signed-in
production session. Automated rendering checks do not certify Chinese fluency.

## Completed live checks and remaining handoff

- All nine Chinese routes advertised through sitemap alternatives, plus
  membership and Collection query views, returned 200 with server-visible
  `zh-CN` and Chinese canonicals. Query views retain noindex.
- Desktop (1440px) and mobile (390px) Chromium checks passed language switching,
  date/source preservation, refresh persistence, fourteen decoder cards,
  Chinese search and the actual share-copy handler with an isolated clipboard.
  No runtime errors were observed. Analytics and writes were blocked in these
  interaction checks; no emails, purchases or production data were created.
- Visual inspection exposed the display-font gap despite passing structural
  checks. The correction passed a production build, 435 application tests and
  six core/display cases across Chromium, Firefox and WebKit on its exact branch.
  Display tests compare glyph pixels at four weights against the local CJK
  font and check mobile overflow; computed font names alone are not proof.
- After PR #173 was merged and published, Chromium and Firefox live checks
  passed on desktop and mobile: Chinese display-glyph pixels at four weights
  match the local CJK font, layouts have no horizontal overflow, language
  switching preserves the membership view, and all fourteen decoder cards,
  Chinese search and the localized search-label font work.
- Live WebKit navigation was unavailable because this container's WebKit runtime
  reports “TLS support is not available.” Its local HTTP core/display and export
  checks passed; no claim of a live WebKit production check is made.
- A signed-in production UI was not verified. Account, sync, entitlement and
  export checks remain controlled-fixture evidence, not a live account claim.

## Coverage checklist and verification boundaries

Core navigation and decoder checks were performed on production. Builder drafts,
old saved grids, account/sync/access rules and exports were checked through
automated fixtures; a signed-in production session was not used.

- Open `/zh-cn/` and `/zh-cn/vibe-atlas` on desktop and a phone.
- Switch English/简体中文; confirm the edition, pack and Builder source stay intact.
- Check Daily Drop, Archive, released packs, Collection and membership copy.
- Check a verified public actor, edition and pack counterpart, Chinese metadata,
  canonical URLs and language alternatives.
- Check `/zh-cn/c-drama-fandom/trope-decoder/`: all fourteen cards, Chinese search,
  category filters and share/copy success or failure.
- Check grid previews and downloaded images for Chinese glyphs, line breaks,
  attribution, original dates and approved composition.
- With the creator's existing account, check sign-in return language, sync
  consent and free-versus-Collector behavior without making a new purchase.
- Confirm English-only destinations are labeled and protected/query URLs retain
  their existing privacy behavior.

## Rollback

Before release, retain the currently published Netlify deployment
`6abeed9b11576800085b4d83` and its production commit as the known-good baseline.
If the release fails, restore that deployment using Netlify's rollback controls
and reconcile the GitHub release so a later automatic build cannot immediately
replace the restored version. Do not delete saved content or rewrite manifests.