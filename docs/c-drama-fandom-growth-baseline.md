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

## Search Console readiness and current blocker

**Checked August 30, 2026.** Google Search Console is not connected to this workspace, so property verification, sitemap submission, URL Inspection, and Search Console reporting cannot be performed or claimed from here. No Search Console credentials or metrics are being inferred.

The source build is ready for submission:

- `npm run build` completes successfully.
- The generated `dist/` contains `sitemap.xml`, `robots.txt`, and all four full editorial HTML documents.
- `public/sitemap.xml` lists the four editorial routes alongside the home page and Vibe Atlas.

The production domain is **not ready for Search Console submission yet**. A direct production check returned `200 text/html` with the React app shell for each of these URLs, including the XML and plain-text files:

- `https://fandom.justlikekatie.com/sitemap.xml`
- `https://fandom.justlikekatie.com/robots.txt`
- `/c-drama-fandom/`
- `/c-drama-fandom/getting-started/`
- `/c-drama-fandom/glossary/`
- `/c-drama-fandom/fandom-games/`

Until the current build is published through the external Netlify deployment, Google cannot reliably read the sitemap or discover the intended static documents. This is a deployment-state observation, not evidence that Google has indexed zero pages.

### Baseline recording worksheet

Leave unavailable values as **Not available**, rather than entering zero. Zero means Search Console returned a verified zero; “Not available” means the property or report could not be queried.

| Measurement | Search Console baseline | Notes |
| --- | --- | --- |
| Property | `https://fandom.justlikekatie.com` | Verify the Domain property if DNS access is available; otherwise verify the URL-prefix property |
| Property verification | Not completed | Requires Search Console access and the production verification method |
| Sitemap submitted | Not submitted | Submit `https://fandom.justlikekatie.com/sitemap.xml` after the production response is fixed |
| Sitemap status | Not available | Confirm “Success” and the discovered URL count after submission |
| Valid/indexed pages | Not available | Use Page indexing → Pages |
| Excluded pages | Not available | Record the count and each material exclusion reason |
| Impressions | Not available | Search results → Web, date range beginning at the verified baseline |
| Clicks | Not available | Same report and date range |
| CTR | Not available | Same report and date range |
| Average position | Not available | Same report and date range |

### Four editorial discovery checklist

These are the four intended editorial URLs. Confirm each under Search Console’s sitemap details and URL Inspection after the production deployment is corrected:

1. `https://fandom.justlikekatie.com/c-drama-fandom/`
2. `https://fandom.justlikekatie.com/c-drama-fandom/getting-started/`
3. `https://fandom.justlikekatie.com/c-drama-fandom/glossary/`
4. `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/`

For each URL, record: sitemap discovered (`Yes`/`No`), crawl status, indexing status (`Indexed`/`Excluded`/`Not processed`), exclusion reason when applicable, canonical selected by Google, and the inspection date.

### Operator steps to unlock the baseline

1. Publish the current repository revision through the external Netlify pipeline.
2. Recheck the six production URLs above. The sitemap must be XML, robots must be plain text, and each editorial URL must return its own HTML document rather than the app shell.
3. In Google Search Console, add and verify `https://fandom.justlikekatie.com`. Prefer the Domain property when DNS access is available.
4. Submit `https://fandom.justlikekatie.com/sitemap.xml` under **Sitemaps** and record the submitted URL, status, discovered URL count, and last-read date.
5. Inspect all four editorial URLs. Request indexing only when a page is live, canonical, and materially complete; do not use repeated requests as a substitute for content quality.
6. Save the baseline values above with the report date and Search type set to **Web**.

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

Do not judge ranking performance immediately after publishing. Record the Search Console baseline after property verification and sitemap submission, then review at approximately 30, 60, and 90 days.

| Review | Target date from August 30 baseline | Record |
| --- | --- | --- |
| Baseline | After property verification and successful sitemap submission | Indexing status, exclusion reasons, impressions, clicks, CTR, average position, top queries, and top landing pages |
| 30 days | September 29, 2026 | Compare query and page totals with baseline; note newly discovered query language and material indexing changes |
| 60 days | October 29, 2026 | Compare query clusters and landing pages; identify pages with impressions but weak CTR or position |
| 90 days | November 28, 2026 | Compare all periods; decide which existing pages merit revision based on repeated query evidence and engaged visits |

At each review, export or record:

- Queries containing `c-drama`, `cdrama`, `Chinese drama`, `xianxia`, or `wuxia`
- The top queries for each of the four editorial landing pages, including unexpected wording
- Landing pages with impressions but no clicks
- Queries where the page ranks but does not fully answer the apparent intent
- Indexing exclusions that require a technical correction

Use repeated, relevant query gaps to revise the closest substantial page. Improve titles, introductions, definitions, internal links, or examples when the data supports the change. Do not manufacture thin pages merely to increase URL count.
