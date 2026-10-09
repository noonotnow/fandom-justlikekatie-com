# Survive Your First Sect Day

## What & Why
Add **Can You Survive Your First Day in a Sect?** to the existing Fandom Vibes site as a short, authored xianxia branching adventure. The user selected this concept from a game shortlist. Unlike the existing self-selection fate board, this game should make choices matter: earlier actions affect later narration and the ending, rather than merely accumulating a personality label.

V1 is one fictional sect, five decisions with three options apiece, six reachable endings, and approximately 2–4 minutes per play. Use original, affectionate veteran humor and invented characters; no real-drama spoilers, actor-image searches, or runtime AI. Preserve the site's dark, gold-accented editorial identity. Do not treat this story as a Legendary Grid or automatically number it LG02: it is a different game format.

### Editorial direction
The player arrives with no cultivation skills and immediately encounters more narrative responsibility than the induction brochure disclosed. The five scene beats are arrival/oath, a forbidden manual, an injured stranger, a suspicious master's explanation, and a sword or back-mountain crisis. Earlier choices must produce concrete callbacks in at least two later scenes. Keep each scene compact and each option legible; no exposition wall or timer.

Example choice: **Your master says never enter the back mountain. Do you obey, investigate, or ask why the sect built a footpath?** The three responses should be defensible in different ways, not one obviously correct answer and two joke buttons.

Working ending set: **Reluctant Sect Savior**, **Wanted by Three Realms**, **Accidentally Bound by a Heavenly Vow**, **Promoted to Suspicious Master's Favorite**, **Survived by Leaving Before Lunch**, and **Sealed in the Back Mountain (Temporarily)**. Refine the names and complete the story during implementation while keeping this bounded six-ending scope. Each ending needs a causal explanation, your fatal mistake or surprising survival tactic, and a rescuer/ally—or an explicit statement that you got yourself out. Affectionate consequences, not player insults. Include a genuinely successful low-drama exit so curiosity and recklessness are not the only rewarded routes.

## Done looks like
- Visitors can find the new game from the existing fandom-games page and C-drama guide, without losing the current fate game or changing its URLs.
- Anyone can start without an account, read one scene at a time, choose among three options, and reach one of six endings after five decisions.
- Earlier choices visibly change later narration; the ending explains what caused it. Replaying different choices can produce meaningfully different outcomes.
- The result shows the ending, causal payoff, and a compact personal decision recap. Play again clears the run and starts fresh; no answer trail is saved to an account or URL.
- Visitors can share or copy a fixed public ending link and download a legible 4:5 result card. Shared links display only the generic ending, identify it as a shared result, and invite the recipient to play; they do not pretend the recipient has completed a run or expose the original decision recap.
- Allowlisted ending links receive matching social previews; malformed or unknown values safely show the master game preview/start screen. Result previews are not separately indexable profiles.
- The experience works on narrow mobile screens and with keyboard navigation, visible focus, sensible focus transitions, progress announcements, and reduced motion. Without JavaScript, visitors see the premise and a clear explanation that interactive play requires JavaScript.
- Every possible five-choice sequence is checked for a valid ending, all six endings are reachable, and original fate-game behavior remains intact.

## Out of scope
- Additional chapters, other sects, other proposed games, or a new standalone app/design artifact.
- Runtime AI, live images, real-drama characters or spoilers, multiplayer, leaderboards, accounts, paid gates, Collection integration, or cross-device progress.
- Full Simplified Chinese localization of this new story in V1; preserve existing language navigation without presenting English content as translated.
- Free-text answers, recording individual choice trails in analytics, personalized public profiles, or durable run storage. Runs are held in memory; refresh restarts play.
- Production publishing or deployment without the user's separate approval.

## Steps
1. **Author the bounded adventure** — Write the five scenes, three choices per scene, six complete endings, and choice-dependent callbacks; define a deterministic resolution contract with explicit precedence and tie handling. Verify the narrative logic before polishing presentation, including a sensible cautious route and examples of contrasting paths to every ending.
2. **Build the playable story** — Add an independent static game page and client-side runner within the existing C-drama content layer, presenting one scene at a time with progress, immediate consequence text, later callbacks, completion, and restart. Keep run state in memory and make double activation or stale controls unable to advance a run twice.
3. **Design the ending and sharing flow** — Present causal result copy and a local-only decision recap, plus Web Share, copy-link fallback, and a downloadable branded 4:5 card containing only generic ending content. Provide truthful success, cancellation, and error feedback; opening a shared result must not count as a completed playthrough.
4. **Integrate public discovery and previews** — Link the new game from the current games page and C-drama guide while preserving the fate experience, and register its canonical public route with the existing generation, redirect, sitemap, and indexing system. Generate six allowlisted outcome previews and social images using the current fixed-public-result privacy model, with one canonical game URL and noindex result variants.
5. **Add bounded participation signals** — Extend the existing validated engagement contract only as needed for this game to distinguish actual starts, completions, and successful share/copy/download actions using a versioned game identifier and fixed outcome identifiers. Keep answer histories and arbitrary URL values out of telemetry, preserve the existing fate allowlist, and ensure analytics failures cannot interrupt play.
6. **Verify narrative and browser behavior** — Exhaustively validate all 243 choice sequences and six-ending reachability, plus callback consistency, reset behavior, malformed links, and separation of shared previews from earned results. Test mobile and keyboard interaction, exported-card text fit, copy/share failures and cancellation, successful-event semantics, metadata/redirects, and existing fate-game regressions; run the relevant project build and test checks and report any unverified production behavior explicitly.

## Relevant files
- `public/c-drama-fandom/fandom-games/index.html`
- `public/c-drama-fandom/fandom-games/lg01.js`
- `public/c-drama-fandom/index.html`
- `shared/public-routes.js`
- `shared/public-routes.d.ts`
- `scripts/generate-public-pages.js`
- `scripts/public-pages.test.js`
- `scripts/public-pages-preparation.test.js`
- `netlify.toml`
- `netlify/edge-functions/seo-indexing.js`
- `netlify/functions/log-engagement.js`
- `netlify/functions/lib/log-engagement.test.js`
- `tests/browser/publicRouteCanonicals.test.ts`
- `docs/static-guide-inventory.md`
- `package.json`
