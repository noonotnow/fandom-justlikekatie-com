# C-drama and adjacent search opportunities

**Research snapshot: October 3, 2026.** Recommendations only; no pages rewritten, published, or deployed. This brief is independent of the November 28 performance review and does not require new Search Console access.

## Decision summary

- Start with **cast-to-character clarity in the existing Love Between Fairy and Devil guide** and **spoiler-safe name help for The Untamed**. The supplied historical exports contain both top and rising cast/name queries. These are defensible reader needs, not estimated traffic forecasts.
- **Legal viewing guidance** is a credible gap for the supplied titles, but needs a named territory, dated subtitle/tier observations, and an editor willing to maintain it. A provider listing is not proof of playback rights.
- **“Shows like Love Between Fairy and Devil” is already covered.** Improve the existing chooser only if an editorial review identifies an unanswered comparison; do not create a duplicate recommendation page.
- Use accurate **title disambiguation and contextual aliases**, not an indiscriminate multilingual keyword block. *Eternal Love*, *The Eternal Love*, and *Eternal Love of Dream* must not be merged.
- Genre terminology, CP, archetypes, creative participation, and the public game are already substantial parts of this site. Their next opportunity is a better example or practical instruction, **not adding supposedly absent metadata or duplicating glossary pages**.
- A fresh 12-month title comparison and five-year genre comparison were attempted today, but both returned **Google Trends 429 errors**. The historical May–August exports remain usable with their original dates. There is **no verified October top/rising ranking or absolute monthly search volume** in this research.

## 1. Evidence rules and scope

### What each evidence type can establish

| Evidence | Permitted interpretation | Not permitted |
| --- | --- | --- |
| Supplied Trends interest-over-time chart | Relative search interest within this comparison and window | Monthly searches, revenue, platform views, comparison to separately normalized charts |
| Supplied TOP related queries | Relative prominence of associated searches in the exported title panel | A worldwide keyword-volume leaderboard; summing scores or comparing `5` between panels |
| Supplied RISING related queries | Growth versus the prior comparison period; `Breakout` means more than 5,000% per Google [M2] | Large absolute audience, continued October growth, editorial relevance without entity checking |
| Country map | Relative share of searches for this entity within each country's Google searches | Number of people, country traffic share, native language, market size |
| Today's public search sample and fetched pages | Answer formats, entity identity, available sources, competing coverage | Popularity, exact Google positions, ranking difficulty, demand growth |
| Publisher/platform statements | Attributed industry context, within the publisher's stated window and markets | Independently reproduced Google demand, all-platform behavior, site conversion |
| Historical Search Console baseline | What the supplied property report exposed at that time | Current rankings or conversion; absence of impressions as a reason to reject a topic |

**Method:** inspected the supplied feedback, seven Trends CSVs, growth baseline, registered public routes, and relevant guide bodies; recalculated the time-series means and country counts with CSV parsing. Ran 11 bounded public-search calls spanning aliases, cast, viewing, genres, CP, fan creation, adjacent-title checks, Trends, and Google guidance. Fetched primary listings and selected explanatory sources. Search queries and returned URLs/snippets are retained in [the search log](research/c-drama-search-2026-10-03-search-results.json); short source excerpts and blocked Trends responses are in [the source log](research/c-drama-search-2026-10-03-source-extracts.json).

Search calls used English natural-language questions plus keyword variants. The search provider did not expose a controlled country, device, personalization state, or search engine ranking context. This is an **unlocalized public result sample**, not a US or worldwide Google SERP census. Source publication dates, where returned, are metadata rather than guaranteed original publication dates.

**Coverage verification:** parsed repository HTML and anonymous production HTML for nine selected routes on October 3, retaining fields and response hashes in [the site audit](research/c-drama-search-2026-10-03-site-audit.json). All nine returned `200` HTML. Local and live bytes differ; the four initial guides agree on the audited descriptions, H1s, schema types, social tags, image attributes, and editorial link counts. The live Against the Current viewing page has less body text than the local version (rough counts 898 versus 1,271). Use live content, not unshipped local additions, for viewing claims. This sample is not certification of every public route or release parity. A screenshot of the live hub also confirmed a readable public page and the Daily Drop CTA.

### Source register: historical exports

All H1–H7 exports say **All categories**. Their headers give **May 30–August 30, 2026** and **Worldwide** where applicable. The growth baseline records operator supply/export around **August 29–30, 2026**; the CSVs themselves do not record the exact download time, term-versus-topic selection, or search surface. Reviewed October 3. Do not silently assume a Web Search setting or a topic ID.

| ID | Source file, relative to project root | Window / geography / limitations |
| --- | --- | --- |
| H1 | `attached_assets/multiTimeline_1788119233457.csv` | Worldwide, May 30–August 30; 93 inclusive daily observations, normalized five-title comparison, not volumes |
| H2 | `attached_assets/geoMap_1788119220233.csv` | The Untamed only, same dates; countries' normalized interest, no language or audience-size measure |
| H3 | `attached_assets/relatedQueries_1788119233460.csv` | The Untamed TOP/RISING, same dates, worldwide; broad-word and cross-media ambiguity |
| H4 | `attached_assets/relatedQueries_(1)_1788119233459.csv` | Till the End of the Moon TOP/RISING, same dates, worldwide; fragments, transliteration, unrelated co-searches |
| H5 | `attached_assets/relatedQueries_(2)_1788119233459.csv` | Love Between Fairy and Devil TOP/RISING, same dates, worldwide; live-action versus animation ambiguity |
| H6 | `attached_assets/relatedQueries_(3)_1788119233460.csv` | Eternal Love TOP/RISING, same dates, worldwide; especially ambiguous English title and neighboring works |
| H7 | `attached_assets/relatedQueries_(4)_1788119233460.csv` | Ashes of Love TOP/RISING, same dates, worldwide; generic “ashes,” similarly named short dramas, nonlicensed-looking destinations |
| H8 | `docs/c-drama-fandom-growth-baseline.md` | Historical August 30 Search Console and public-search evidence; no current property retrieval |
| H9 | `attached_assets/Pasted-Katie-thank-you-this-helps-a-lot-Now-I-can-actually-see_1788129856696.txt` | Supplied SEO feedback; no independent demand or Google diagnostic evidence; reconciled below |

Every historical demand observation below inherits the export date/provenance, window, geography, and limitations from its referenced H source. Today's retrieval does **not** refresh those observations.

## 2. Historical top and rising demand

### Relative title interest, not volume

H1 means, recalculated over all 93 dated rows:

| Title | Mean normalized score | First 30 / last 30 observation means |
| --- | ---: | ---: |
| The Untamed | 64.74 | 70.80 / 60.33 |
| Love Between Fairy and Devil | 39.31 | 43.17 / 34.17 |
| Till the End of the Moon | 34.68 | 37.87 / 30.30 |
| Eternal Love | 22.20 | 23.73 / 21.53 |
| Ashes of Love | 17.20 | 21.33 / 14.67 |

The comparison supports recurring historical interest, with The Untamed strongest **within this chart**. All last-30 means are lower than their first-30 means; this chart does not support a claim of broadly accelerating title interest. Rising subqueries can grow while overall title interest softens. Broad English names can mix entities, especially *Untamed* and *Eternal Love*. Means are derived summaries, not Google-issued search-volume estimates.

### Query clusters and reader intent

These are selected relevant TOP and RISING rows, not complete lists or newly measured October searches. Exact export spacing is preserved in examples where useful; cleaned aliases appear separately below.

| Cluster | Historical evidence | Reader intent and interpretation |
| --- | --- | --- |
| **The Untamed titles / names / cast** | H3 TOP: `the untamed` 89, `陳情 令` 18, `ปรมาจารย์ ลัทธิ มาร` 14, `trần tình lệnh` 6, `wei wuxian` 5, `the untamed cast` 4. RISING: `wen qing` +200%, `the untamed cast` +50%, `untamed cast` +40%, `wei wuxian` +40% | Identify the correct show, performer, or character; resolve unfamiliar names. `untamed` 100 is too broad to attribute wholly to this C-drama. A character lookup is not automatically a request for ending spoilers. |
| **Till the End of the Moon titles / cast** | H4 TOP: full title 92, `จันทรา อัสดง` 33, `تا پایان ماه` 33, `trường nguyệt tẫn minh` 18, `長 月 燼 明` 16, `cast of till the end of the moon` 5. RISING: `till the end of the moon cast` +90%, `cast of till the end of the moon` +50% | Title recognition and actor-to-role mapping. Fragment `till the end` 95 cannot safely be treated as exclusively drama demand. Multilife character aliases can reveal plot; a cast chart needs spoiler boundaries. |
| **Love Between Fairy and Devil identity / cast / next watch** | H5 TOP: full title 88, `蒼 蘭 訣` 21, `ของ รัก ของ ข้า` 13, `anime love between fairy and devil` 13, `love between fairy and devil cast` 5. RISING: cast +60%, `shows like love between fairy and devil` +180%, `love between fairy and devil episodes` +160% | Identify the live-action show, cast, format, episode expectations, or a similar emotional experience. Animated adaptation demand is related but not interchangeable with the live-action guide. |
| **Eternal Love identity** | H6 TOP: `eternal love` 97, `三 生 三世 十里 桃花` 54, `tam sinh tam thế` 39, `ten miles of peach blossoms` 11, `eternal love cast` 6. RISING: `eternal love ten miles of peach blossoms` +40%, Vietnamese title phrase +80%; `triệu hựu đình` Breakout | Find the specific work or its cast. TOP `the eternal love` 23 and `amor eterno` 7 warn of mixed entities rather than validating aliases for one drama. |
| **Ashes of Love identity / cast / watch** | H7 TOP: full title 96, `香 蜜 沉沉 烬 如 霜` 23, `cenizas de amor` 10, both cast variants 7, `ashes of love netflix` 6, `ashes of love watch online` 5. RISING: watch online +110%, episodes +100%, cast +50% / +60%; `dương tử` and `鄧 倫` Breakout | Title recognition, performers, episode count, lawful access. Breakout performer names are historical association signals, not standalone actor-volume measurements. |
| **Viewing language and availability** | H3 TOP Netflix variants 4, RISING `untamed مترجم` +350%; H4 RISING Hindi dubbed +300% and in Hindi +100%; H5 Thai dubbing TOP 6 and Vietnamese narrated viewing +160%; H6 Thai-subtitle query Breakout | Country-, language-, subtitle-, dub-, and tier-specific help. Do not promise Hindi/Thai/Arabic playback from query existence or promote unofficial hosts. |
| **Adjacent C-drama discovery** | H3 RISING `the blood of youth` +4,700%, `legend of the female general` +4,550%; H4 `mysterious lotus casebook` +1,450%; H5 `back from the brink` / `lost you forever` +250%, `the legend of shen li` +200% | Leads for a bounded emotional/genre comparison, not a mandate to cover every release. Very large growth can come from a small baseline. Current freshness not verified. |
| **Relationships / fandom culture** | H3 TOP `the untamed bl` 3 and character searches; H5 title/cast context. No direct CP keyword or relationship-explanation growth measurement in these files | Credible contextual questions about adaptation, pairing, names, and chemistry. CP demand is **not quantified here**; fresh explanatory sources show terminology, not popularity. |
| **Xianxia / wuxia terminology** | The five title exports are not direct genre comparisons. H3/H4 adjacent wuxia title queries are discovery leads, not scores for `wuxia` | Genre-definition and story-rule intent has current competing answers [C5]; volume and growth of terminology are unmeasured. Existing detailed site coverage limits the new-page gap. |
| **Creative participation** | No direct fan-edit, mood-board, card-making, or quiz-volume measure in H1–H7 | Participation is a product-fit hypothesis supported by descriptions of fan practices [C6], not a proven high-volume keyword cluster. |

### Audience geography and language

H2 contains **68 integer-valued countries**, two `<1` entries, and 180 blanks. Top relative interests: Thailand 100, Myanmar 63, Angola 60, Sri Lanka 55, Taiwan 49, Laos 43, Hong Kong 41, Singapore 39, China 38, Hungary 37. Vietnam 28; United States and United Kingdom each 7. This does **not** mean Thailand supplies most searches or the US is commercially unimportant. Blanks are unavailable/insufficient data, not verified zero demand. China's Google sample cannot represent its full domestic search ecosystem.

H3–H7 supply direct language-form evidence: simplified/traditional Chinese, Thai, Vietnamese, Russian, Spanish/Portuguese, Persian, Arabic, and smaller Japanese/Korean examples. In particular, `تا پایان ماه` and `عشق پری و شیطان` are **Persian**, not Arabic; Arabic script is not a language label. `untamed مترجم` expresses translated/subtitled intent in Arabic. Country and query panels are not joined data: do not assign Russian queries to Russia, Persian queries to Iran, or Thai queries only to Thailand.

**Audience recommendation:** retain the site's English editorial focus and established Simplified Chinese surfaces. In English copy, clarify genuine names readers encounter; consider further localization only with a fluent reviewer, specific reader need, and maintenance capacity. The current localized route registry covers the launchpad, Atlas, Archive, and decoder—not all four English beginner guides. No new localized pages are recommended for immediate publication.

### Alias decisions

| Work | Justified contextual forms | Verification and restrictions |
| --- | --- | --- |
| The Untamed | `The Untamed (2019)`, `Chen Qing Ling`, `陈情令` / `陳情令` | H3 Chinese variants; C1 secondary identity source confirms Chinese title and year. Distinguish the 2025 American *Untamed*. Do not conflate the live-action adaptation, *Mo Dao Zu Shi* novel, and animation. |
| Till the End of the Moon | Full English title; `Chang Yue Jin Ming`, `长月烬明` / `長月燼明` | H4 and C2; romanization can be joined or spaced. Do not reproduce `長 燼 明月` as an authoritative alternate title. |
| Love Between Fairy and Devil | Full English title; `Cang Lan Jue`, `苍兰诀` / `蒼蘭訣` | H5, C3 official listing, and existing guide. Traditional form corresponds to supplied query. Distinguish live action from the animated work in C3. |
| Eternal Love | `Eternal Love (2017)`, `Ten Miles of Peach Blossoms`, `三生三世十里桃花` | H6 and C4 official listings plus title reference. *The Eternal Love* is a separate 2017 listing (24 episodes versus 58); *Eternal Love of Dream* is not a interchangeable title. |
| Ashes of Love | Full English title; `Heavy Sweetness, Ash-like Frost`; `香蜜沉沉烬如霜` / `香蜜沉沉燼如霜` | H7 Chinese forms and C4 Viki English alternate name. Do not copy the malformed TOP `香 蜜 蜜 烬 如 霜` as a title. |

Thai/Vietnamese/Russian/Spanish phrases are real export observations, not blanket approval for publication-ready translations. Verify official localized names and spelling with a fluent reviewer before adding them. The attachment's generic `仙侠剧` and `武侠剧` refer to **genres**, not interchangeable translations of all “Chinese drama.”

### Excluded or held adjacent searches

- **Semantic Error:** H3 Breakout, but public identification is a Korean drama (C9); exclude from this C-drama shortlist despite its growth.
- **Ashes to Crown / Ashes of Crown / “siete años…”:** H3–H7 include these related rows, some Breakout; this bounded search did not establish a reliable identity/fit for a long-form title guide. Hold separately, not as Ashes of Love aliases or automatic microdrama recommendations.
- **`amor eterno amor`, generic `eternal`, `ashes`, `love between`, and `forever love`:** ambiguous names/phrases. No unqualified demand attribution or keyword stuffing.
- **`gimy`, `123hd`, `vn2`, Dailymotion viewing variants:** signals of access friction, not vetted legal viewing recommendations. A lawful guide may answer the underlying need without linking those destinations.
- **Anime/donghua and novel-only cultivation rankings:** potentially useful for adaptation/genre clarification, but exclude broad animation databases or game/novel progression lists that do not serve the C-drama reader.
- **Real-person romance, actor gossip, and out-of-context `zhao lusi` (H5 +150%):** a related-session signal does not make that performer part of LBFAD's cast. Do not turn character chemistry into claims about actors' private lives.
- **LOTR/general meme searches:** existing Misprint specimens do not authorize expansion of the C-drama editorial product into unrelated fandom acquisition.

## 3. Fresh observations on October 3

“Fresh” means retrieved today, **not necessarily newly published**.

| ID | Sources observed | What this research establishes / timeframe / geography / limits |
| --- | --- | --- |
| C1 | [The Untamed identity reference](https://en.wikipedia.org/wiki/The_Untamed_(TV_series)); search returned an [existing introductory companion](https://www.emilyhenrymusic.com/theuntamed) | Current secondary reference distinguishes the 2019 Chinese and 2025 US titles and maps cast/names. Companion result is search-only. No audience magnitude; worldwide entity facts, not localized demand. |
| C2 | [Till the End of the Moon identity](https://en.wikipedia.org/wiki/Till_the_End_of_the_Moon); [Viki listing](https://www.viki.com/tv/39703c-till-the-end-of-the-moon?locale=en); [TMDB cast result](https://www.themoviedb.org/tv/137206/cast?language=en-US) | Today-fetched identity and 2023/40-episode provider listing; cast result is search-only. Databases compete for bare “cast” intent. Multi-role mappings may spoil the narrative and need primary-credit review. Locale parameter is interface language, not playback-country proof. |
| C3 | [Viki LBFAD](https://www.viki.com/tv/38664c-love-between-fairy-and-devil?locale=en); [iQIYI live-action listing](https://www.iq.com/album/love-between-fairy-and-devil-2022-ld8e5pprpl?lang=en_us); [separate animated listing, search-only](https://www.iq.com/album/love-between-fairy-and-devil-cang-lan-jue-2022-ffsxk2apr1?lang=en_us) | Live-action listing gives 2022, 36 episodes, Chinese title, and cast led by Esther Yu and Dylan Wang. Animation result has a separate identity. Primary listings establish facts, not “trending” strength. No country-local signed-in playback test. |
| C4 | [Eternal Love](https://www.viki.com/tv/36372c-eternal-love); [The Eternal Love](https://www.viki.com/tv/35557c-the-eternal-love); [Ashes of Love](https://www.viki.com/tv/35817c-ashes-of-love); [Ten Miles alias search reference](https://en.wikipedia.org/wiki/Eternal_Love_(Chinese_TV_series)); [Netflix Ashes listing](https://www.netflix.com/title/81026363) | Today-fetched Viki listings distinguish works and list subtitles; Netflix explicitly says unavailable “in your country.” Retrieval country was not exposed, so this is **not a US unavailability finding** or a universal one. No full licensed availability table is certified. |
| C5 | [DramaPanda comparison](https://dramapanda.com/2016/02/a-guide-for-wuxia-newbies.html); [WuxiaSociety comparison](https://wuxiasociety.com/whats-the-difference-between-wuxia-xianxia-and-xuanhuan); [XianLore comparison](https://xianlore.com/knowledge/wuxia-vs-xianxia) | Search-only genre answers surfaced, including older material and a result dated 2026. Shows the topic is already served, not its traffic or correctness. Genre boundaries require care, not copying oversimplifications. Unlocalized sample. |
| C6 | [Fanlore C-Drama](https://fanlore.org/wiki/C-Drama); [cdramaland](https://cdramaland.com/); fan-edit tutorial result from `r/fanedits` in search log | Fetched Fanlore describes fan practices; fetched competitor offers cast/scene/tool content. The August baseline's participation “gap” is **not evidence that nobody else offers fan tools**. Generic “fan edit” can mean re-editing a film rather than short aesthetic edits. No keyword volume or conversion claim. |
| C7 | [World of Chinese CP language article](https://www.theworldofchinese.com/2021/09/how-chinese-shippers-chew-on-on-screen-couples/); [ASAA article, search-only](https://asaa.asn.au/2022/11/01/intra-fandom-conflicts-and-censorship-sensibilities) | CP vocabulary has explanatory sources (2021/2022 publications retrieved today). Cultural context, not an October growth finding. Some sources generalize shipping behavior; retain the site's explicit character/real-person boundary. |
| C8 | [iQIYI H1 2026 release, via PRNewswire](https://www.prnewswire.com/news-releases/iqiyi-international-releases-first-half-of-2026-global-trending-content-chinese-dramas-and-micro-dramas-power-dual-engine-global-growth-302822516.html) | July release about first-half 2026, iQIYI International; describes regional viewing and localization, and calls *Pursuit of Jade* most-searched historical drama globally since 2025. **Publisher claim only:** no keyword set, export, normalization, or reproducible Google methodology supplied. Do not present it as verified search leadership, an October ranking, or independent corroboration from the syndicated ANTARA copy. A research lead, not a priority verdict. |
| C9 | [Semantic Error identification result](https://en.wikipedia.org/wiki/Semantic_Error_(TV_series)); Apple TV Korean-language episode result in search log | Search-only entity exclusion, 2022 show, no demand measurement. Enough to keep unrelated Korean acquisition out of the shortlist; no need to research its popularity. |
| T1 | [12-month title comparison request](https://trends.google.com/trends/explore?date=today%2012-m&q=The%20Untamed,Till%20The%20End%20Of%20The%20Moon,Love%20Between%20Fairy%20and%20Devil,Eternal%20Love,Ashes%20of%20Love) | Worldwide requested (no `geo` restriction), rolling `today 12-m`, all five supplied titles. Returned 429, **no chart/top/rising evidence retrieved**. |
| T2 | [Five-year terminology comparison request](https://trends.google.com/trends/explore?date=today%205-y&q=cdrama,xianxia,wuxia) | Worldwide requested, rolling `today 5-y`, cdrama/xianxia/wuxia. Returned 429; no longer-window stability or rising claims possible. |

**What is not available:** fresh 12-month/five-year top and rising exports, absolute monthly volume estimates, country-controlled search samples, current Search Console reports, authorized current site conversion, or native-search evidence from Baidu/Weibo/Rednote. No credential request or future observation window is required to close this brief. If a later editor supplies an export, use fixed dates, record term/topic IDs and search type, and do not merge separately normalized comparisons.

## 4. Coverage map and ranked opportunities

### Existing editorial footprint

The four August beginner routes are no longer the whole editorial site. The route registry and inspected bodies now include:

- **Fandom literacy:** `/c-drama-fandom/`, `/getting-started/`, `/glossary/`, and standalone CP, cultivation, xianxia, wuxia, jianghu, genre-comparison, historical/costume, and duanju guides under the glossary.
- **Character language:** archetypes index plus cold-lead/tsundere, black-bellied/white-cut-black, and white-moonlight/cinnabar comparisons.
- **Title interpretation:** `/c-dramas/love-between-fairy-and-devil/` with relationships, themes-symbolism, and what-to-watch-next pages. The main guide already uses *Cang Lan Jue* / 苍兰诀 and named characters. The next-watch page already discusses Till the End of the Moon, The Starry Love, Mysterious Lotus Casebook, and Eternal Love.
- **The Untamed companion:** episode-bounded `/c-drama-fandom/watch-journal/` plus `/untamed-name-board/` and `/place-names/`. The pre-watch board covers group/place names, not a complete cast reference; journal installments are not spoiler-free character dictionaries.
- **Against the Current:** bounded Vibing Now installments, a dated where-to-watch guide, and soundtrack coverage. No supplied title-specific demand score; these are existing editorial commitments, not newly proven search opportunities.
- **Participation:** decoder, fandom game, Glossary creative examples, and Daily Drop continuation. Query-share game previews are not independent editorial keyword landing pages.
- **Atlas public records:** approved actor/edition/pack route families exist separately. An actor record is not necessarily a cast guide. Dynamic catalog completeness and every actor's live availability were not audited here; verify approved records before choosing links.

Except where written in full, abbreviated paths above are within `/c-drama-fandom/`. Registration is not proof of editorial approval or live publication for unsampled pages.

### Ranking method

Scores are **editorial prioritization, not an SEO tool's keyword score**. Each dimension runs 1–3:

- **E evidence:** 3 = historical direct relevant query plus current identity/source check; 2 = narrower historical support; 1 = contextual/search-only hypothesis.
- **I intent clarity:** 3 = concrete question with a bounded answer; 2 = mixed/participatory need; 1 = unclear.
- **R product relevance:** 3 = direct C-drama companion/collection path; 2 = relevant but weaker continuation; 1 = peripheral.
- **G coverage gap:** 3 = substantive answer absent from inspected guides; 2 = partially answered; 1 = already well covered.
- **F feasibility:** 3 = focused improvement to existing reviewed material; 2 = new verification/editorial work; 1 = heavy source/spoiler/ongoing territorial maintenance.

Equal-weight total out of 15; ties use editorial judgment, favoring bounded reader help and existing approved surfaces. Historical evidence is useful but stale, so even E3 is **not “high-volume now.”**

| Rank / score E-I-R-G-F | Opportunity / evidence | Reader intent and existing coverage | Proposed next action / feasibility guard |
| --- | --- | --- | --- |
| **1 · 14 (3-3-3-2-3)** | **LBFAD cast, character, and format clarity** — H5 cast +60%; C3 listings | “Who plays Orchid/Dongfang Qingcang?” Existing guide answers interpretation and alias identity, not a compact sourced cast answer | Propose a small cast-to-character block in the main guide, using provider credits and actor-name verification; clarify live action versus animation. Link to approved actor records only after checking them. Do not duplicate the relationship article or assume cast-page traffic will convert. |
| **2 · 13 (3-3-3-2-2)** | **The Untamed spoiler-safe names and performers** — H3 Wei Wuxian/Wen Qing/cast growth; C1 identity | Resolve names without opening a full recap. Existing group-name board and journal only partially answer this | Prepare a reviewed, bounded name/actor reference adjacent to the current companion. Include birth/courtesy-name distinctions only at a declared safe boundary; distinguish actors, characters, novel, and show. Review primary credits before publication. |
| **3 · 13 (3-3-3-1-3)** | **Improve the existing LBFAD watch-next answer** — H5 “shows like…” +180%; current chooser | Find a next emotional experience, not a universal “best dramas” list. Already covered at `/c-dramas/love-between-fairy-and-devil/what-to-watch-next/` | Compare the current short answer and tradeoffs against this query; retain one canonical chooser. No new page needed. The separate September 30 companion/taste-bridge decision remains deferred [decision record](c-drama-next-watch-decision.md); this research does not approve that pilot bridge. |
| **4 · 13 (3-3-3-3-1)** | **Legal viewing help for one supplied title** — H3/H4/H5/H7 access queries; C2–C4 listings | “Where can I watch with my language/tier?” Only Against the Current has a dedicated viewing guide | Pick **one** of The Untamed or LBFAD, name a country (US English subtitles is a possible scope, not verified here), check playback/subtitle/tier evidence, record dates and uncertainty. Adopt existing viewing evidence rules. Avoid launching a five-title maintenance burden or claiming universal availability. |
| **5 · 12 (3-3-2-2-2)** | **Eternal Love title disambiguation** — H6 ambiguity; C4 distinct listings | Identify which 2017 series or related work a recommendation means. Existing next-watch page mentions Eternal Love, not a dedicated disambiguation answer | Verify year, Chinese title, leads, and adaptation with official credits; add a concise distinction to the existing recommendation context if useful. Only commission a standalone page if the distinction requires a substantive reader answer, not an alias list. |
| **6 · 12 (3-3-2-3-1)** | **Till the End of the Moon cast/name companion** — H4 cast +90%; C2 | Actor-to-character identities across a complex story. Current next-watch mention is not a cast guide | Draft a source checklist and spoiler policy first, then assess a single substantial companion. Multi-role tables can reveal later identities; do not scrape a database into a thin page. Validate credits rather than inheriting conflicting romanizations. |
| **7 · 11 (1-3-3-1-3)** | **Contextual genre and CP answers** — C5/C7, not direct Trends volume | Definition/comparison intent. Xianxia, wuxia, CP, cultivation, and archetype guides already exist | Review whether one concrete drama example answers a recurring confusion and cross-link the closest existing guide. Keep 仙侠/武侠 as genre labels, not universal show aliases. Avoid competing with the site's own comparison URL or translating whole pages without a reviewer. |
| **8 · 10 (1-2-3-2-2)** | **First useful fandom card / visual reading exercise** — C6 fan practices and competing tools; demand unmeasured | “How do I participate or make something small?” Hub/getting-started offer suggestions and the game, but no full practical first-card walkthrough | Develop a rights-conscious, no-video-download example using approved assets and actual public save/share behavior. Preserve attribution and avoid implying a featured drama's cards are today's actor drop. Seek a concrete reader question before commissioning; not a proven acquisition winner. |

**Reserve, not immediate priorities:** Ashes of Love cast/viewing merits later consideration from H7, but adds sourcing and maintenance without a current dedicated editorial base. Newer *Pursuit of Jade* or microdrama coverage has publisher/search leads [C8], not independently validated current search demand. The existing duanju guide already answers basic format terminology. These are not rejected for lacking site impressions; they rank below nearer, better-supported work.

**Product boundary for all actions:** index substantive approved editorial answers; keep raw search inventories, search spells, diagnostic scores, rejected images, unpublished combinations, and protected full utility payloads private. Continue to describe Vibe Atlas as the **daily C-drama card drop**. Browsing/device saves and explicitly merged free account Collection sync are distinct from Collector's deeper archive/grid utility. Do not promise that a guide's actor is featured today, free access to protected tools, or a mandatory CREATE handoff.

## 5. SEO feedback reconciliation

H9's claims are not Google diagnoses. The table checks **current** local and live HTML, not what may have existed when the advice was written. The initial guides are static `public/.../index.html` documents; adding `<head>` to guessed React routes would not be an appropriate implementation plan.

### Verified initial guide fields

| Route under `/c-drama-fandom/` | H1 / H2 / H3 counts | Distinct description / canonical / social tags | JSON-LD parsed | Images and editorial links |
| --- | --- | --- | --- | --- |
| Hub `/` | 1 / 9 / 19 | All present; OG type/title/description/url/image/site name; Twitter large card | WebSite, Article, BreadcrumbList | No body `<img>`; 25 distinct editorial destinations |
| `getting-started/` | 1 / 8 / 5 | All present; same required social field set | Article, BreadcrumbList | No body `<img>`; 6 distinct editorial destinations |
| `glossary/` | 1 / 10 / 2 | All present; same required social field set | DefinedTermSet, BreadcrumbList | 4 images: 3 descriptive alts, decorative badge `alt=""`; 21 editorial destinations |
| `fandom-games/` | 1 / 5 / 4 | All present; OG image dimensions and explicit Twitter title/description/image also present | Quiz, BreadcrumbList | 2 images: master grid descriptive alt, decorative poster `alt="" aria-hidden="true"`; 5 editorial destinations |

Counts include navigation and footer destinations, deduplicated for editorial links. H1 text, actual descriptions, canonicals, alt values, and local/live fields are recorded in the audit. JSON parse success/type presence is not a Rich Results Test or a ranking guarantee. The two text-only guides do not need invented alt text for an OG metadata image.

| Feedback claim / suggestion | Classification | Verified state and defensible next step |
| --- | --- | --- |
| “Missing descriptions” | **Already implemented** | All four have distinct descriptions in both live and local HTML. Refine wording only if it fails the reader intent; not a missing-tag repair. |
| “Missing H1s; Google requires this” | **Implemented feature; unsupported mandatory rule** | Exactly one H1 on each. Descriptive headings aid readers and accessibility; Google guidance does not prescribe a magical count [M4]. No missing-H1 indexing diagnosis. |
| “Missing internal links” | **Already implemented** | Crawlable `<a href>` navigation, body paths, reference links, and product continuation exist. Improve contextual destinations if needed, not blanket insertion of duplicate React `<Link>`s. |
| “Missing structured data; add Article everywhere” | **Already implemented; blanket advice inappropriate** | Actual types reflect page purpose: Article, DefinedTermSet, Quiz, BreadcrumbList, WebSite. Future work could check truthful visible authorship/date alignment and supported properties, but do not invent publication dates/authors or replace the game's Quiz just for SEO. No guaranteed rich result/indexing [M5]. |
| “Missing alt text” | **Not supported for these static images** | Informative grid/specimen images have descriptive alternatives; blank badge/poster alts are intentional decorations. Video has a label, description, and text choices. A full keyboard/screen-reader/dynamic-export accessibility audit was not performed; this is not certification of every SPA grid. |
| “Missing Open Graph tags” | **Already implemented** | All four have absolute OG image URLs and Twitter card declarations. Further platform-specific preview/image-fetch checks may improve sharing, but cannot guarantee Rednote, Weibo, Discord, etc. presentation or rankings. |
| “Missing semantic hierarchy” | **Already implemented in basic HTML; refine if helpful** | H1/H2/H3, sections, articles, lists/definitions, navigation labels, and main landmarks exist. A separate screen-reader review could find refinements; unsupported as a current Google exclusion cause [M4]. |
| “Too short; write 600–1,200 words each” | **Unsupported universal target; intent-specific improvement possible** | Rough body counts including navigation: hub 1,464, beginner 837, glossary 2,028, game 508. Different tasks need different lengths; a game need not become an essay. Google explicitly has no preferred word count [M3/M4]. Add missing useful answers, not padding. |
| “Missing multilingual aliases; massively increases discovery” | **Partial opportunity; outcome claim unsupported** | Chinese genre/archetype terms and the LBFAD Chinese title already exist; not every supported title has a full contextual alias explanation. Apply the verified alias table only where it clarifies identity. Keyword lists do not replace localized content or prove demand conversion [M6]. |
| “Google sees them as not worth indexing” | **Unsupported diagnosis** | August inspections reported unknown/discovered-not-indexed, not a quality verdict with a known cause. No current private report was retrieved. Metadata/word count cannot explain exclusion by themselves. |
| “Do not add more pages; thin pages hurt indexing” | **Conditional principle, not blanket prohibition** | Avoid duplicative thin cast/alias pages. A new bounded, sourced reader answer can be worthwhile without prior site impressions. Evaluate need and maintenance, not URL count alone. |
| “Do not restructure Netlify/functions or spam indexing” | **No change warranted by this research** | Sampled editorial routes return distinct HTML. No infrastructure fault was established or infrastructure audit commissioned. Repeated indexing requests are not a content strategy, but “Google ignores all repeats” was not verified here. |

### Methodology / Google references

All retrieved October 3, 2026; policy/explanation sources, not demand measurements or geography-specific traffic evidence:

- **M1:** [Google Trends data FAQ](https://support.google.com/trends/answer/4365533?hl=en): sampling, normalization, and low-volume limitations.
- **M2:** [Find related searches](https://support.google.com/trends/answer/4355000?hl=en): related TOP and RISING definitions, prior-period growth and Breakout.
- **M3:** [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): explicitly no preferred word count; answer reader needs and add value.
- **M4:** [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): no magical word-count target or ideal heading count; semantic organization helps accessibility.
- **M5:** [Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies): represent visible content truthfully; eligible markup does not guarantee rich results.
- **M6:** [Managing multilingual/multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites): actual page language/content matters; translated versions are a distinct editorial undertaking.

## 6. Handoff and completion boundary

This snapshot is complete with historical demand context, fresh source/result observations, eight ranked opportunities, verified feedback reconciliation, and recorded inaccessible evidence. It is **not** a performance report or an approval to publish.

Recommended editorial sequence: review rank 1's compact LBFAD cast answer; scope rank 2's safe-name reference; decide whether a single rank 4 viewing guide has a maintainable territory and sources. Rank 3 is a check of an existing answer, not a new taste-bridge launch. Revisit lower-confidence creative/genre hypotheses when a specific reader need makes the proposed answer concrete.

The [growth baseline](c-drama-fandom-growth-baseline.md) retains its historical metrics, discrepancies, and separate review cadence. A future report may validate these hypotheses, but current completion does not depend on future rankings, anniversary dates, or unavailable credentials.