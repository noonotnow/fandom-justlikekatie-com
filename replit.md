# fandom-justlikekatie-com

**Fandom Vibe Atlas** — React + TypeScript + Vite frontend with Netlify Functions backend, deployed at `fandom.justlikekatie.com`.

## What it does
Curated 3×3 image grids of CDRAMA actors filtered by "vibe spells" (aesthetic search queries across Baidu, SerpAPI, and Brave). Features include:
- Star of the Day actor spotlight
- Vibe spell search → curated 3×3 grid results
- AI-varied caption/template families for export share cards (Rednote)
- Saved Collections (user-authenticated, passwordless via Resend magic links)
- Saved Grids (save favorite algorithm results)
- Studio Operations is the public Collection + Grid Builder workspace
- Grid Builder is a core MVP product flow, not an admin-only or later feature
- Public grid history

## Public Archive creation and saves
- The public Grid Builder uses verified published Star of the Day editions across dates. Browsing, composing, and standard grid exports are free regardless of edition age.
- Individual app saves are free through three calendar days after the edition date, measured in Asia/Shanghai; older individual saves require verified Collector membership. Missing publication days do not extend that window.
- The Collection builder uses only explicitly saved images. Archive browsing, proposals, exports, and finished-grid saves must never import constituent cards automatically.
- Existing saved images remain usable after aging or membership expiry. Finished-grid canvas limits, deeper released actor packs, treatments, and Master Export restrictions remain separate.
- Public image delivery is not browser-copy protection. Never republish unverified historical editions to fill inventory gaps.

## Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Netlify Functions (`netlify/functions/`)
- **Auth:** Passwordless magic link via Resend (`auth.justlikekatie.com` sender domain)
- **Storage:** Netlify Blobs (`fandom-auth-users`, `fandom-auth-sessions`, `fandom-user-collections`, etc.)
- **Image search:** Baidu scraper, SerpAPI, Brave Search API

## Running locally (Netlify CLI required)
```sh
npm install
netlify dev       # runs frontend + functions together
npm run dev       # frontend only (functions won't work)
npm run build     # production build → dist/
npm test          # app + functions test suites
```

## Required server-side environment variables (never use VITE_ prefix)
- `RESEND_API_KEY`
- `FANDOM_AUTH_FROM_EMAIL`
- `FANDOM_PUBLIC_ORIGIN`
- `FANDOM_AUTH_ID_SECRET`
- `CREATE_FANDOM_COLLECTION_READ_KEY_ID`
- `CREATE_FANDOM_COLLECTION_READ_SECRET`

## Key files
- `netlify/functions/` — all backend functions (auth, image search, collection sync, handoff to CREATE)
- `netlify/functions/log-engagement.js` — export/engagement tracking (known broken)
- `netlify/functions/batch-metrics.js` — metrics aggregation
- `src/` — React frontend
- `docs/release-notes.md` — changelog
- `QA_ISSUES.md` — known/tracked issues
- `MIGRATION.md` — provenance from original Netlify repo

## Push discipline — preventing split-brain CI failures
Tests and the source files they import must travel together in the same push.
A split-brain failure (CI red, local green) nearly always means implementation
commits are still local while the test file has already reached GitHub.

**Rule:** after committing a test file, immediately push all related commits
before starting other work.  Never leave a dangling test commit un-pushed.

**Automated guard:** `.github/workflows/test-source-guard.yml` runs on every
push and PR.  It extracts every relative `import` in `tests/*.test.ts` and
`tests/*.test.js`, resolves each path, and fails the build if any imported
file is absent from the repository.  A failed guard job means the source file
was not pushed — push it (or revert the test) to restore green.

**Deployment source of truth:** the public site is served from the Git
repository through Netlify. Local changes do not affect the public site until
the related commit is pushed to the deployed branch.

**Temporary worktrees:** create them outside this project, for example
`/home/runner/worktrees/<name>`, not inside `/home/runner/workspace`.
The required test job in `.github/workflows/test.yml` rejects
committed nested project copies and browser crash reports. Ignore rules
prevent new crash state from being staged, but do not untrack existing files.

## User preferences
- Keep existing project structure and stack
- This repo is imported for reference and discussion, not to run on Replit

## Saved fandom-game planning
- `docs/fandom-games-plan.md` is the retained shortlist, including confirmed
  games and clearly labeled recreated concepts. Keep unselected ideas when
  choosing or completing a game; this list does not authorize implementation
  or publishing.
- The creator asked to memorialize the discussed games on that same list,
  while letting “the next list ... breathe on its own.” Preserve earlier
  rounds, but let the next brainstorm be independent rather than require it
  to extend previous concepts, categories, or the favored rhythm idea.
- The creator asked for genuinely different game types, not mostly variations
  on reading scenes and choosing responses. Keep distinct mechanics visible
  when proposing new fandom games.
  Renaming an earlier premise or adding AI to the same mechanic does not count
  as a fresh alternative; the creator has explicitly flagged this repetition.
- Preserve the creator's desire for **language games with Chinese phrases from
  xianxia / wuxia stories**, plus **watch-along companion games** and **creative
  games**, in the saved record. The creator subsequently asked not to focus so
  much on play-alongs and language learning in further rounds. These interests
  are not quotas for every brainstorm.
- The creator said the mechanic-focused fifth list was “much better” and
  specifically “really like[s] the rhythm game idea.” Treat Tribulation Rhythm
  as a favored concept, not approval to build. The creator also said the list
  still contained remnants of ideas that do not work; do not treat the entire
  list as accepted or assume which remaining entries they meant.
- `docs/fandom-language-and-watchalong-games.md` preserves those directions and
  the creator's phonetic phrase notes alongside corrections. The creator
  welcomes pinyin fixes when the intended phrase is clear; do not freeze
  misspellings as canonical. Mark genuine ambiguity and confirm characters,
  meanings, and context before using them in playable language questions.
- `docs/sect-day-original-plan.md` preserves the complete original Sect Day
  task plan. `docs/sect-day-narrative-contract.md` records the authored game
  logic. Do not replace either with a summary of the other.
