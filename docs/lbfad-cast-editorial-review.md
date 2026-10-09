# LBFAD lead cast and adaptation review

Prepared October 3, 2026. The creator initially approved the two-lead addition but said to keep it unpublished, then explicitly requested the separate fuller cast guide. After the completed seven-role draft was delivered, the creator approved production publication on October 3, 2026: “publish it please”. Release verification is recorded below when complete.

## Scope and proposed copy

The existing main guide gains one premise-level section, “Who plays Orchid and Dongfang Qingcang?”, immediately after the quick orientation:

- Esther Yu plays Orchid / Xiao Lanhua.
- Dylan Wang plays Dongfang Qingcang, the Moon Supreme.
- The guide covers the 2022 live-action drama, listed with 36 episodes.
- iQIYI’s separately listed animated *Love Between Fairy and Devil (Cang Lan Jue)* is not the same production. The two live-action performers are not being presented as its voice cast.

The relationship guide links back to this answer instead of duplicating it. Following the creator’s scope change, a separate `/c-dramas/love-between-fairy-and-devil/cast/` guide extends this key to seven verified characters and explains character versus performer names, subtitle spacing, and the adaptation distinction. The main guide remains a short lead-role answer and points to the fuller guide. No infrastructure or search-performance claim is introduced.

## Primary verification

All checks below were performed October 3, 2026.

| Claim | Primary source and observed evidence | Editorial limit |
| --- | --- | --- |
| Esther Yu → Orchid | [Viki series, About](https://www.viki.com/tv/38664c-love-between-fairy-and-devil?locale=en#about) synopsis explicitly says “Orchid (Esther Yu)”; Cast lists Esther Yu as Main Cast. | Only the premise-level Orchid / Xiao Lanhua identity already used in the guide; no later identity, young-role, or reincarnation list. |
| Dylan Wang → Dongfang Qingcang | Same Viki synopsis explicitly says “Dongfang Qingcang (Dylan Wang)”; [iQIYI live-action listing](https://www.iq.com/album/love-between-fairy-and-devil-2022-ld8e5pprpl?lang=en_us) also explicitly says “Dongfang Qingcang (played by Dylan Wang)”. | No late arc or outcome. |
| Character spelling / live-action format | iQIYI describes the leads as Dong Fang Qing Cang and Xiao Lan Hua, names Esther Yu and Dylan Wang as stars, and lists 2022 / 36 Episodes. Viki lists 苍兰诀, 2022, and 36 episodes. | Retain existing guide spellings; no playback, dub, subscription-tier, or territorial-rights promise. |
| Separate animation | [iQIYI animated listing](https://www.iq.com/album/love-between-fairy-and-devil-cang-lan-jue-2022-ffsxk2apr1?lang=en_us) was fetched directly, not just checked in search results. It identifies a separate work, title, director Wang Xin, and episode inventory. | Do not import its plot description or voice credits into the live-action guide. Do not publish an animation episode count; the listing’s details and navigation differ. |

The standalone expansion uses [iQIYI’s original Chinese series listing](https://www.iqiyi.com/a_fxzcys7jh5.html), retrieved directly as HTML. The markdown browser fetch returned only a player-loading screen, but the actual HTML contains both visible 演职员表 and embedded `character`, `name`, and `id` credit objects. Seven bounded pairings were extracted and retained in `docs/research/lbfad-cast-primary-credits-2026-10-03.json`; no episode synopses or later-role aliases were carried into the public page.

| Character | Performer | Identity cross-check |
| --- | --- | --- |
| Orchid / Xiao Lanhua · 小兰花 | Esther Yu · 虞书欣 | Chinese credit ID 234131205 matches the international Esther link; Viki explicitly maps Orchid to Esther Yu. |
| Dongfang Qingcang · 东方青苍 | Dylan Wang · 王鹤棣 | ID 237321805; explicit mapping on both Viki and iQIYI. |
| Changheng · 长珩 | Zhang Linghe · 张凌赫 | ID 9000000001014605; Viki spells the performer “Zhang Ling He”. |
| Shangque · 觞阙 | Charles Lin · 林柏叡 | ID 237837405 matches the international Charles Lin link; Viki spells the performer “Lin Bai Rui”. |
| Jieli · 结黎 | Hong Xiao · 洪潇 | Embedded credit ID 241308405 matches the international Hong Xiao link. |
| Rong Hao · 容昊 | Xu Haiqiao · 徐海乔 | ID 203679605; international synopsis gives Xu Haiqiao in full, while its cast link uses “Joe”; Viki uses “Xu Hai Qiao”. |
| Chidi Nüzi · 赤地女子 | Guo Xiaoting · 郭晓婷 | ID 214856105; international synopsis names Guo Xiaoting while its cast link uses “Cristy”; Viki uses “Guo Xiao Ting”. |

General cast membership alone is not treated as a role mapping. Only the supported Viki spelling variants above are included. No unsupported English aliases, performer biographies, current-day feature promises, real-person relationship claims, or expanded filmographies are added.

## Public actor records

The live production `/sitemap.xml` returned HTTP 200 with `x-public-sitemap-inventory: complete`. Its only actor-record URL was `/vibe-atlas/actors/liu-xueyi/`, unrelated to this cast. None of the seven performers had an independently approved actor record in that complete public inventory, so actor names receive no internal actor-record links. No route is guessed from a name, and no pack/search/diagnostic link is substituted.

The source links above are provider listings, not approval of a new Vibe Atlas actor record. Recheck the complete public inventory and the candidate record’s identity, canonical, indexability, and approved editorial context before adding actor links in a future edit.

## Product and spoiler boundaries

The existing Daily Drop continuation remains unchanged. No statement promises Esther Yu or Dylan Wang is featured today. No raw retrieval evidence, private diagnostics, gated grids, pack payloads, or export rights are exposed. No new ending or late identity spoilers are included.

## Creator decision

The creator’s October 3, 2026 instruction, “publish it please”, authorizes publication of the completed seven-role guide and its main/relationship-guide discovery links. It supersedes the earlier instruction to keep the two-lead addition unpublished. It does not authorize publication of unrelated drafts, including the Untamed name key.

## Local verification and review path

Preview the standalone draft at `/c-dramas/love-between-fairy-and-devil/cast/` in the workspace application preview.

- `node --test scripts/lbfad-cast.test.js scripts/public-pages.test.js scripts/public-pages-preparation.test.js` — all 54 checks passed after regenerating the static sitemap.
- `node --check public/c-drama-fandom/editorial.js` and `git diff --check` passed.
- Desktop and 402px-wide phone screenshots verified all seven table entries on desktop and the readable character/performer pairs in stacked mobile entries.
- The existing application workflow starts cleanly. No packages, hosting services, database, authentication, or deployment configuration were replaced.
- New-page registration, one existing-style static rewrite, generated sitemap entry, and editorial analytics labels form the minimum coherent release. They are transferred onto current GitHub main rather than releasing the entire workspace.

Before release, verify the clean release tree, preserve current published content, and confirm that no unrelated unpublished drafts enter the release. After release, verify the custom-domain route, canonical, sitemap, cast mappings, source links, and discovery links.

## Production publication receipt

Published October 3, 2026 after creator approval and the required checks:

- GitHub PR: https://github.com/noonotnow/fandom-justlikekatie-com/pull/177
- Both required `test` jobs passed; the creator’s GitHub review was approved. The PR merged normally, without bypassing required checks, at 17:10:18 UTC.
- Production commit: `d2fa30a2bf68cb33ff84fb0f80a990a797173e2a`.
- Netlify production deploy: `6ac136fc2df2c60008370981`, ready and confirmed as the site’s active published deployment.
- Live guide: https://fandom.justlikekatie.com/c-dramas/love-between-fairy-and-devil/cast/
- The guide, existing main guide, and relationship guide each returned HTTP 200. Both existing guides link to the cast page.
- All seven public table rows match the retained primary-credit evidence, including Chinese names and supported performer spellings. Later-role aliases and invented internal actor/pack links remain absent.
- The canonical is the live cast route; robots allow indexing with no `noindex` response header. The complete production sitemap includes this URL exactly once.
- All four linked provider sources returned HTTP 200 during release verification. The Daily Drop promise remains actor-independent.
- A production screenshot confirmed the live page renders correctly. Desktop and mobile table layouts had already been checked before release; production uses that same approved page.

This release transferred only the LBFAD guide, discovery links, supporting route/analytics/sitemap entries, tests, and source-review documents. It did not publish unrelated workspace drafts.

## Subsequent live verification

The older queued publication description was reconciled against the completed release on October 3, 2026. GitHub's public PR record independently confirms that PR 177 merged at the recorded time and has an approved review. No new publication or infrastructure change was performed.

- The live cast guide's authored head and main content exactly match the reviewed workspace page.
- All seven rows, Chinese names, and supported display variants match the retained primary-credit receipt.
- The cast, main, and relationship routes return HTTP 200; both discovery links remain present. All four provider source links return HTTP 200.
- The cast canonical and `index,follow` directive remain correct, with no `noindex` response header. The complete live sitemap contains the cast URL exactly once and supplies no approved actor record for any of the seven performers.
- The 54 focused local checks, editorial JavaScript syntax check, and diff whitespace check pass.
- Live Chromium checks at 1440px and 402px confirm seven rows, no horizontal page overflow, and the intended table-to-card layout. Screenshots confirm readable English copy. This Nix browser lacks native Chinese fallback fonts; a verification-only override using the existing first-party CJK font confirms visible Chinese text without modifying production. Native Chinese-font rendering on other devices is not certified by this check.
- The actor-independent Daily Drop wording, adaptation distinction, and spoiler boundaries remain unchanged.