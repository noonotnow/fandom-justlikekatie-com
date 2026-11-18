# Against the Current: Episodes 39–42 and the pack thread

Prepared 2026-11-18. This records a prepared change, **not a claim of live
publication** and not editorial sign-off.

## What changes

| Route | Change |
|---|---|
| `/c-drama-fandom/vibing-now/against-the-current-episodes-39-42/` | New installment, **What Love Makes Room For**, reader boundary through Episode 42 |
| `/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/` | Pack verdict and one still added after the reading |
| `/c-drama-fandom/vibing-now/against-the-current-episodes-30-31/` | Pack verdict and one still added after the reading |
| `/c-drama-fandom/vibing-now/against-the-current-episodes-34-38/` | Pack verdict and one still added after the reading; link onward to 39–42 |
| Field Journal | Episodes 39–42 listed between 34–38 and the closing readings |

The frozen reading bodies of 26–29, 30–31 and 34–38 are unchanged: each
addition sits outside the section those pages' digest tests bind, and those
tests still pass. The full-file hash recorded in
`against-the-current-34-38.md` no longer matches, because the page now carries
the verdict, the still and the onward link.

The 43–45 and 46–47 pages are not touched. The 43–45 page still has no link
back to an earlier installment.

## Copy

- The 39–42 reading is the creator-approved revision of the canonical draft
  (thirteen wording changes approved 2026-11-18).
- The four pack verdicts are creator-approved wording (2026-11-18).
- The 39–42 search and social description and the five still captions were
  approved by the creator on 2026-11-18.
- Written afterwards and **not yet reviewed by the creator**: the two
  illustration captions and their alt texts.

Candidate names are labelled `(Pack candidate · unreleased)` wherever they
appear. Released packs link to the Vibe Atlas. No pack is released by this
change.

## Images

Hotlinked from the public discussion threads, as on the Episodes 1–20 pages.
Public provenance is recorded here; it is not a licence grant. On
2026-11-18 the creator decided to use all five stills, stating that she
considers the use fair use. That is her decision as publisher; it is not a
legal determination. The alt texts rest on
the researcher's description of each image; the person who prepared this
change could not open the images.

| Page | Asset | Exact image URL | Dimensions | Source thread | Notes |
|---|---|---|---:|---|---|
| 26–29 | Shared-bed announcement | `https://preview.redd.it/against-the-current-episodes-28-29-discussion-v0-0bnjcfxkqlrh1.jpg?width=2437&format=pjpg&auto=webp&s=e73bc8764011428615e15c13c03e8651deac4677` | 2437×1437 | [Episodes 28–29](https://www.reddit.com/r/CDrama/comments/1wpo4ii/against_the_current_episodes_28_29_discussion/) | Fan-assembled two-panel collage |
| 30–31 | Dressing him beside the bath | `https://preview.redd.it/against-the-current-episodes-28-29-discussion-v0-xllv9ew6slrh1.jpg?width=2732&format=pjpg&auto=webp&s=e554eefc7d4ad725e966e3819401249dbaddb3c6` | 2732×1530 | [Episodes 28–29](https://www.reddit.com/r/CDrama/comments/1wpo4ii/against_the_current_episodes_28_29_discussion/) | Posted in the 28–29 thread; the episode of this exact frame is not independently verified, so it is used only on the later page |
| 34–38 | Bows at the gravesite | `https://preview.redd.it/against-the-current-episode-38-discussion-v0-yu8skmnolysh1.jpg?width=1920&format=pjpg&auto=webp&s=8f9a20423e86200a6dc67a7373de05749726b354` | 1920×1371 | [Episode 38](https://www.reddit.com/r/CDrama/comments/1wvhhri/against_the_current_episode_38_discussion/) | Fan-assembled three-panel collage |
| 39–42 | Standing at the play | `https://preview.redd.it/against-the-current-episode-39-discussion-v0-r1l4zixsw5th1.jpg?width=1280&format=pjpg&auto=webp&s=560d2bda8e73a73859db0ea0a8187705eb951386` | 1280×720 | [Episode 39](https://www.reddit.com/r/CDrama/comments/1wwbtqx/against_the_current_episode_39_discussion/) | Single frame; WeTV watermark |
| 39–42 | Shared grief | `https://preview.redd.it/against-the-current-episode-42-discussion-v0-ga7af3t75sth1.jpg?width=2137&format=pjpg&auto=webp&s=7700a0040e0b4a55013cc59e71bbeaac15564716` | 2137×1441 | [Episode 42](https://www.reddit.com/r/CDrama/comments/1wyu9zw/against_the_current_episode_42_discussion/) | Fan-assembled two-panel collage |

The 34–38 page also carries two original illustrations supplied by the
creator, made with Adobe Firefly and labelled on the page as illustrations,
not stills: the wishing tree (1376×768) and the mule rescue (1371×768, the
version without the carrot). They are stored under
`public/assets/c-drama-fandom/vibing-now/against-the-current/` as WebP.

## Verification and remaining release gate

- `node --test scripts/*.test.js`: all page, route, warning-copy and frozen-copy
  tests pass, including the new `scripts/vibing-39-42.test.js`. Two unrelated
  subscription-configuration tests fail before and after this change.
- `tests/*.test.ts`: pass.
- Browser tests and a production build were not run.

Still required before merge:

1. The sentence-by-sentence source record for the 39–42 reading and each new
   verdict, per `docs/vibing-now-publication-review.md`, and an explicit
   editorial **APPROVED**.
2. The subtitle checks listed for 39–42: the childbirth dialogue, the
   labour-duration wording, title translations, the Episode 42 closing, and the
   names Gao Xianzhi, Yongchang Marquis and Du Dasong.
3. The creator's review of the two illustration captions and of the alt texts.
