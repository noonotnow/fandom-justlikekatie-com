# C-Drama Fandom search and conversion baseline

Recorded August 30, 2026, before making any ranking or conversion claims about the new public content layer.

## Search footprint

A public search sample for `site:fandom.justlikekatie.com` and `site:fandom.justlikekatie.com c-drama` did not return a confirmed Fandom Vibes result. The returned pages were unrelated sites that happened to contain similar words. This should be treated as **no verified indexed footprint**, not as proof that Google has indexed zero pages.

The next reliable measurement step is to verify the production property in Google Search Console, submit `https://fandom.justlikekatie.com/sitemap.xml`, and record:

- Valid indexed pages
- Excluded pages and reasons
- Impressions, clicks, click-through rate, and average position
- Queries containing `c-drama`, `cdrama`, `Chinese drama`, `xianxia`, and `wuxia`
- Landing-page performance for the four new editorial routes

## Live result sample

A broad English-language search sample around `C-drama fandom`, `Chinese drama fandom guide`, and `C-drama fandom glossary` surfaced:

- [Kotoba Interactive — C-Drama: The Guide to Chinese Series Captivating the World](https://www.kotobainteractive.com/en/blog/c-drama-guide-series-chinoises)
- [CDramaPedia — Understanding C-Drama Genres](https://cdramapedia.com/artikel/understanding-cdrama-genres-complete-guide/)
- [CDramaPedia — FAQ About Chinese Dramas](https://cdramapedia.com/faq/)
- [CDramaPedia — The Ultimate Chinese Drama Encyclopedia](https://cdramapedia.com/)
- [CDrama TV](https://www.cdramatv.com/)

The sampled results primarily emphasized:

- Genre explanations
- Recommended titles and rankings
- Cast and drama databases
- Where-to-watch guidance
- International growth of Chinese television

The clearest editorial gap for Fandom Vibes is not another database or “best dramas” list. It is a useful explanation of **fandom as participation**: how viewers notice visual language, learn community terms, make artifacts, share emotional readings, and move from quiet interest into creative practice.

## Technical baseline before this task

- The deploy was a Vite React single-page app.
- The initial HTML contained a global title but no substantial editorial body, meta description, canonical strategy, sitemap, or valid robots file.
- Unknown paths fell through to the launchpad, so clean informational routes did not return distinct crawlable documents.
- The existing app already had GA4/GTM tags and membership funnel events, but no dedicated public-fandom-game start, reveal, share, or share-open events.

## Conversion baseline

No historic conversion rate is claimed for the new search-to-game-to-membership path because the public pages and LG · 01 interaction did not previously exist.

The implemented event sequence now distinguishes:

1. Editorial landing (`page_view` through existing GA4/GTM)
2. Game start (`fandom_game_start`)
3. Fate reveal (`fandom_game_reveal`)
4. Share or result-card download (`fandom_game_share`)
5. Shared-link open (`fandom_share_open`)
6. Existing Collection save events
7. Existing membership view, upgrade click, Checkout start, and verified activation events

Membership activation must continue to come from verified synchronized subscription state, never from a return URL alone.

## Review cadence

Do not judge ranking performance immediately after publishing. Record the Search Console baseline after property verification and sitemap submission, then review at approximately 30, 60, and 90 days. Improve pages in response to real query gaps and engaged visits; do not manufacture thin pages merely to increase URL count.