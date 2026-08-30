# C-Drama Fandom search and conversion baseline

Recorded August 30, 2026, before making any ranking or conversion claims about the new public content layer.

## Search footprint

A public search sample for `site:fandom.justlikekatie.com` and `site:fandom.justlikekatie.com c-drama` did not return a confirmed Fandom Vibes result. The returned pages were unrelated sites that happened to contain similar words. This should be treated as **no verified indexed footprint**, not as proof that Google has indexed zero pages.

The production routes and the operator-supplied Search Console baseline were verified and recorded on August 30, 2026. A later review still requires an operator with access to the Google property because Search Console is not connected to this workspace. Future measurement should record:

- Valid indexed pages
- Excluded pages and reasons
- Impressions, clicks, click-through rate, and average position
- Queries containing `c-drama`, `cdrama`, `Chinese drama`, `xianxia`, and `wuxia`
- Landing-page performance for the four new editorial routes

## Google Trends demand context

Operator-provided Google Trends exports from August 29–30, 2026 show a promising broader audience signal, but they must not be treated as search volume. Trends scores are normalized within each chart: `100` is the highest point in that chart and does not mean 100 searches. The two worldwide comparison files also use different title sets, so their scores cannot be compared directly.

- In the United States, `cdrama` had nonzero interest in 69 of 91 sixteen-minute intervals, with a median relative score of 28 and a peak of 100 on August 30, 2026 at 07:28 UTC.
- In the first worldwide title set, **Hidden Love** was the steadiest reference term, while **Joy of Life** produced a sharp peak; **The Untamed**, **Story of Yanxi Palace**, **Till The End Of The Moon**, and **Love Between Fairy and Devil** also appeared repeatedly.
- In the second worldwide title set, **The Untamed** had the strongest normalized baseline in that comparison, with **Till The End Of The Moon**, **Love Between Fairy and Devil**, and **Eternal Love** showing substantial recurring interest. **Ashes of Love**, **The Starry Love**, and **Immortal Samsara** appeared intermittently.

This supports researching a worldwide C-drama fandom niche, but the next validation step is a longer Google Trends window (12 months or 5 years) with Related queries and Rising queries exported separately. Search Console should then be used to measure which of those topics the Fandom Vibes pages actually earn impressions for.

### Longer-window and localization evidence

The operator-provided worldwide comparison for May 30–August 30, 2026 shows recurring relative interest across the full 90-day window. Within that one comparison set, the mean normalized scores were **64.7** for **The Untamed**, **39.3** for **Love Between Fairy and Devil**, **34.7** for **Till The End Of The Moon**, **22.2** for **Eternal Love**, and **17.2** for **Ashes of Love**. These values are comparable only within this chart, not to the other comparison exports.

The related-query exports reveal a localization opportunity rather than one English-only audience. Searches include alternate Chinese titles, Thai, Vietnamese, Arabic, Russian, Spanish, and other language forms, alongside practical intent such as cast, Netflix, drama, and where-to-watch terms. A geographic map for **The Untamed** returned numeric interest for 68 countries; its leading locations were Thailand, Myanmar, Angola, Sri Lanka, Taiwan, Laos, Hong Kong, Singapore, China, and Hungary.

The practical content hypothesis is to pair plain-English fandom education with title aliases, translations, cast/character language, and viewing-context terms. Validate this across a 12-month or 5-year Trends window before creating substantial localized pages.

## Production launch verification and Search Console blocker

**Production verified August 30, 2026 at 18:36 UTC.** The current repository revision was published through the external Netlify pipeline. Direct checks of the production domain confirmed:

- `https://fandom.justlikekatie.com/sitemap.xml` returns `200 application/xml` with six URLs, including all four editorial routes.
- `https://fandom.justlikekatie.com/robots.txt` returns `200 text/plain` and names the production sitemap.
- Each of the four editorial routes returns `200 text/html`, its own title and canonical URL, and a distinct document body rather than the React app shell.

The production response layer is therefore ready for Google to crawl. The exact route checks were:

| Production URL | Verified response |
| --- | --- |
| `/sitemap.xml` | `200 application/xml`; valid sitemap with six URL entries |
| `/robots.txt` | `200 text/plain`; one production sitemap declaration |
| `/c-drama-fandom/` | Distinct HTML; canonical `https://fandom.justlikekatie.com/c-drama-fandom/` |
| `/c-drama-fandom/getting-started/` | Distinct HTML; canonical `https://fandom.justlikekatie.com/c-drama-fandom/getting-started/` |
| `/c-drama-fandom/glossary/` | Distinct HTML; canonical `https://fandom.justlikekatie.com/c-drama-fandom/glossary/` |
| `/c-drama-fandom/fandom-games/` | Distinct HTML; canonical `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/` |

Google Search Console is not connected to this workspace, so property verification, sitemap submission, URL Inspection, and Search Console reporting still require an operator with access to the Google property and its verification method. No Search Console credentials or metrics are being inferred.

### Post-deployment crawler recheck

**Production rechecked August 30, 2026 at 20:38 UTC.** A direct request to the external Netlify production domain confirmed that the crawler files remain discoverable after deployment:

- `https://fandom.justlikekatie.com/sitemap.xml` returns `200` with `Content-Type: application/xml`, follows zero redirects, and contains six URLs. Each of the four C-drama guide URLs appears exactly once.
- `https://fandom.justlikekatie.com/robots.txt` returns `200` with `Content-Type: text/plain; charset=UTF-8`, follows zero redirects, and contains one `Sitemap` declaration pointing to `https://fandom.justlikekatie.com/sitemap.xml`.

No serving or redirect differences were found compared with the committed `public/sitemap.xml` and `public/robots.txt`. The Replit deployment metadata has no active Replit-hosted deployment; this check therefore targets the documented external Netlify production pipeline.

### Operator-provided Search Console evidence

An August 30, 2026 screenshot of a Live Test for `https://fandom.justlikekatie.com/` shows **“URL is available”** and **“Page can be indexed,”** but the inspection dialog says **“URL not in property.”** This confirms live-test availability only; it does not confirm that Google has indexed the page, that the property is verified, or that the selected property covers the `fandom.justlikekatie.com` subdomain. The screenshot also says discovery was not checked in the live test.

The committed August 30, 2026 Sitemaps PDF showed three individual editorial URL submissions (`fandom-games`, `glossary`, and `getting-started`), each with type **Unknown**, **1 error**, and **0** discovered pages. A subsequent operator-provided Search Console screenshot (`attached_assets/Screenshot_2026-08-30_at_16.01.52_1788120117087.png`) shows the correct `https://fandom.justlikekatie.com/sitemap.xml` submitted in the `justlikekatie.com` Domain property with type **Sitemap**, **Success**, **6** discovered pages, and a last-read date of **August 30, 2026**. The six production URLs are also defined in `public/sitemap.xml`.

The Search Console UI was open in the `justlikekatie.com` Domain property, and the later sitemap screenshot establishes successful processing of the correct sitemap. The four subsequent URL Inspection screenshots show that the root guide and getting-started page are currently **unknown to Google**, while the glossary and fandom-games page are **discovered — currently not indexed**. The two earlier uploaded PDFs were duplicate Stripe billing pages, not Search Console evidence, and were not used for this baseline.

An August 30, 2026 Search Console performance export is filtered to **Web** and **Last 6 months**, covering May 6 through August 28, 2026. It reports no clicks, four impressions in the daily chart, and no impressions for any of the four new editorial landing pages. The page-dimension export totals six impressions, which does not reconcile with the chart total; both source values are retained below rather than silently choosing one.

The additional August 30, 2026 coverage drilldown is for the separate `www.justlikekatie.com` URL property and the issue **Page with redirect**. It contains one affected URL, `https://www.justlikekatie.com/`, last crawled August 3, 2026. This is an unrelated www-to-canonical redirect report, not the aggregate indexed/excluded summary for the `justlikekatie.com` Domain property, and is not substituted for that summary.

The operator-provided Domain-property coverage export (`attached_assets/justlikekatie.com-Coverage-2026-08-30_1788120163381.xlsx`) supports an aggregate **Indexing → Pages** baseline of **2 indexed** and **4 not indexed** pages. Its critical-issues sheet reports 2 **Crawled - currently not indexed** pages and 2 **Page with redirect** pages; **Excluded by ‘noindex’ tag** and **Not found (404)** are both 0.

### Baseline recording worksheet

Leave unavailable values as **Not available**, rather than entering zero. Zero means Search Console returned a verified zero; “Not available” means the property or report could not be queried.

| Measurement | Search Console baseline | Notes |
| --- | --- | --- |
| Property | `justlikekatie.com` (Domain property) | The operator-provided Sitemaps report is open in the Domain property |
| Property verification | Operator-selected `justlikekatie.com` Domain property | The supplied Sitemaps screenshot is open in this property; ownership verification is not independently verifiable in workspace |
| Baseline report date | August 30, 2026 | Sitemap and performance evidence were supplied on this date |
| Search type | Web | Confirmed by the performance export |
| Correct sitemap submitted | Yes | `attached_assets/Screenshot_2026-08-30_at_16.01.52_1788120117087.png` shows `https://fandom.justlikekatie.com/sitemap.xml` |
| Sitemap status | Success | `attached_assets/Screenshot_2026-08-30_at_16.01.52_1788120117087.png` |
| Sitemap discovered URL count | 6 | `attached_assets/Screenshot_2026-08-30_at_16.01.52_1788120117087.png` |
| Sitemap last read | August 30, 2026 | `attached_assets/Screenshot_2026-08-30_at_16.01.52_1788120117087.png` |
| Valid/indexed pages | 2 | `attached_assets/Screenshot_2026-08-30_at_16.03.16_1788120201219.png`; corroborated by the Coverage sheet |
| Excluded/not-indexed pages | 4 | `attached_assets/Screenshot_2026-08-30_at_16.03.16_1788120201219.png`; reasons detailed in `attached_assets/Screenshot_2026-08-30_at_16.02.57_1788120180810.png` and the Critical issues sheet |
| Impressions | 4 (daily chart) | Performance export: Web, Last 6 months, May 6–August 28, 2026; the Pages export totals 6 and is retained as a source discrepancy |
| Clicks | 0 | Performance export |
| CTR | 0% | Performance export |
| Average position | 13.75 (derived from daily chart) | Impression-weighted average of chart positions; the aggregate card value was not included in the export |
| Top queries | `katie hendley` (1 impression, position 10); `劉學義` (1 impression, position 43) | No target C-drama query terms appeared in the exported query rows |
| Top landing pages | `https://justlikekatie.com/` (3 impressions, position 4); `https://fandom.justlikekatie.com/` (2, position 23); `https://fandom.justlikekatie.com/memeforge/middle-earth` (1, position 4) | No new editorial route appeared in the exported page rows |

### Four editorial route performance baseline

The page-dimension export reported no impressions for any of the four new editorial landing pages. That is recorded as a verified zero for impressions. The export did not provide a route-level row for clicks, CTR, or average position, so those fields remain **Not available** rather than being inferred from the aggregate report.

| Editorial URL | Impressions | Clicks | CTR | Average position |
| --- | ---: | ---: | ---: | ---: |
| `https://fandom.justlikekatie.com/c-drama-fandom/` | 0 | Not available | Not available | Not available |
| `https://fandom.justlikekatie.com/c-drama-fandom/getting-started/` | 0 | Not available | Not available | Not available |
| `https://fandom.justlikekatie.com/c-drama-fandom/glossary/` | 0 | Not available | Not available | Not available |
| `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/` | 0 | Not available | Not available | Not available |

Source: the August 30, 2026 Web / Last 6 months export covering May 6–August 28, 2026. The export’s page total of six impressions does not include any of these four routes.

### Four editorial discovery checklist

These are the four intended editorial URLs. The following discovery values were recorded from operator-provided URL Inspection screenshots on August 30, 2026; route-level performance values are recorded in the table above. “Not available” means the inspection or export did not expose a value, not that Google returned zero.

| Editorial URL | Sitemap discovered | Crawl status | Indexing status | Exclusion reason | Canonical selected by Google | Inspection date |
| --- | --- | --- | --- | --- | --- | --- |
| `https://fandom.justlikekatie.com/c-drama-fandom/` | No referring sitemap detected | Not crawled (`Last crawl: N/A`) | Not processed | URL is unknown to Google | Not available | August 30, 2026 |
| `https://fandom.justlikekatie.com/c-drama-fandom/getting-started/` | No referring sitemap detected | Not crawled (`Last crawl: N/A`) | Not processed | URL is unknown to Google | Not available | August 30, 2026 |
| `https://fandom.justlikekatie.com/c-drama-fandom/glossary/` | `https://fandom.justlikekatie.com/sitemap.xml` | Not crawled (`Last crawl: N/A`) | Excluded | Discovered — currently not indexed | Not available | August 30, 2026 |
| `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/` | `https://fandom.justlikekatie.com/sitemap.xml` | Not crawled (`Last crawl: N/A`) | Excluded | Discovered — currently not indexed | Not available | August 30, 2026 |

### Search Console operator steps completed

1. Verify or select the Domain property `justlikekatie.com`.
2. Inspect all four editorial URLs and record the indexing outcomes above.
3. Submit `https://fandom.justlikekatie.com/sitemap.xml` and record its successful processing.
4. Export the Domain-property coverage report and record indexed/not-indexed totals and reasons.

### Remaining Search Console and growth review steps

1. Request indexing for the four live, canonical, materially complete editorial pages if desired. Do not use repeated requests as a substitute for content quality.
2. Recheck the recorded metrics at approximately 30, 60, and 90 days as listed below. The 30-day review is not yet due as of this baseline and cannot be completed from this workspace without Search Console access.

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

| Review | Target date from August 30 baseline | Status as of August 30, 2026 | Record |
| --- | --- | --- | --- |
| Baseline | After property verification and successful sitemap submission | Complete — recorded above from operator-supplied evidence | Indexing status, exclusion reasons, impressions, clicks, CTR, average position, top queries, and top landing pages |
| 30 days | September 29, 2026 | Pending — review date has not arrived; do not treat unavailable values as zero | Compare query and page totals with baseline; note newly discovered query language and material indexing changes |
| 60 days | October 29, 2026 | Scheduled | Compare query clusters and landing pages; identify pages with impressions but weak CTR or position |
| 90 days | November 28, 2026 | Scheduled | Compare all periods; decide which existing pages merit revision based on repeated query evidence and engaged visits |

At each review, export or record:

- Queries containing `c-drama`, `cdrama`, `Chinese drama`, `xianxia`, or `wuxia`
- The top queries for each of the four editorial landing pages, including unexpected wording
- Landing pages with impressions but no clicks
- Queries where the page ranks but does not fully answer the apparent intent
- Indexing exclusions that require a technical correction

Use repeated, relevant query gaps to revise the closest substantial page. Improve titles, introductions, definitions, internal links, or examples when the data supports the change. Do not manufacture thin pages merely to increase URL count.
