# fandom-justlikekatie-com

**Fandom Vibe Atlas** — React + TypeScript + Vite frontend with Netlify Functions backend, deployed at `fandom.justlikekatie.com`.

## What it does
Curated 3×3 image grids of CDRAMA actors filtered by "vibe spells" (aesthetic search queries across Baidu, SerpAPI, and Brave). Features include:
- Star of the Day actor spotlight
- Vibe spell search → curated 3×3 grid results
- AI-varied caption/template families for export share cards (Rednote)
- Saved Collections (user-authenticated, passwordless via Resend magic links)
- Saved Grids (save favorite algorithm results)
- Public grid history

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

## User preferences
- Keep existing project structure and stack
- This repo is imported for reference and discussion, not to run on Replit
