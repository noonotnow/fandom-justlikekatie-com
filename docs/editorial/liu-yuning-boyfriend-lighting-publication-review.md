# Liu Yuning × Boyfriend Lighting: publication review

Reviewed 2026-10-07 against the production site, https://fandom.justlikekatie.com.

## Decision

**Do not release a permanent public edition or released-pack record from the
September 25 board.** Its exact visual evidence is insufficient for the
pairing's stated promise. Preserve the immutable daily manifest and the
separately published three-card preflight teaser. No production writes,
eligibility changes, copy amendments, date backfills, or new publications were
performed during this review.

This is an editorial rejection of promotion of this specific board, not a
revocation of the pairing's existing operator approval or a deletion of an
already delivered Daily Drop.

## Authoritative evidence

- Strong-read the production `star-of-day` manifest at
  `vibeAtlas:grid-manifest:v1:2026-09-25`.
- Manifest ID: `vibe-atlas-2026-09-25-d48befed24115dfeea42845e`.
- Ordered board hash:
  `d48befed24115dfeea42845e31247ffa8adf1ec9230fee4dd4f4256fee86c2fa`.
- Actor `liu-yuning`, vibe index `2`; nine cards; hero position `4`
  (zero-based).
- Both stored supporting-copy fields are empty.
- Downloaded all nine immutable MEDIA delivery images. Every response was HTTP
  200 and every full-body SHA-256 matched its manifest checksum.
- Visually inspected every image in manifest order, not just the first three.
  Transient search thumbnails were not used as publication delivery sources.

## Exact September 25 board: visual assessment

Card numbers below are one-based; manifest positions are zero-based.

| Card | Visible evidence | Editorial assessment |
| --- | --- | --- |
| 1 | Seated black-denim portrait in outdoor stadium seating | A candid-looking pause, but cool light and an event setting do not substantiate the golden-hour promise. |
| 2 | Tencent Music-branded “旧年” song-release poster | Promotional typography and a framed portrait, not a clean intimate portrait. Reject for this edition. |
| 3 | Seated tan-jacket portrait with dark hoodie | Relaxed styling offers some support, but does not establish warm golden-hour light across the set. |
| 4 | Warm interior frame, patterned shirt, laptop, Tencent branding and overlaid text | Warm light is relevant; promotional/drama framing and text make it weak evidence of the promised candid portrait treatment. |
| 5, hero | Street scene outside a blue storefront, glasses, several other people | Casual context is relevant, but the surrounding crowd competes with the subject. Weak hero for an intimate lighting-focused board. |
| 6 | Dark-denim side profile beside a vehicle, cool gray surroundings | Close framing helps, but cool tones do not support the warm-light promise. |
| 7 | Seated television/music-program still with broadcaster logos and text | Performance/program context rather than a clean candid portrait. |
| 8 | Close selfie-style frame with a strawberry graphic | Intimate framing is relevant, but the added graphic and inconsistent treatment weaken cohesion. |
| 9 | “本周 TOP20” chart graphic showing three named artists | Multi-person promotional composition, not a single Liu Yuning portrait. Reject for this edition. |

The set has some relevant individual images, but the poster and multi-artist
graphic are decisive blockers. The full board cannot honestly be described as
nine clean, warm, intimate Liu Yuning portraits. Writing stronger copy would not
repair its visual evidence.

## Current pairing approval is a separate authority

The production eligibility reader returned `eligible: true`,
`verdict: approved`, `vibeConfirmed: true`, `publishableConfirmed: true`,
and `isReleaseReady: true` for the current retained audit run
`63cd7b36-148d-4479-ac4f-3f65cf17b960`.

That approval names an operator rescue receipt
`5850aeba-b869-4ab1-8fc7-dadb20c3e3d1` with board hash
`a28a9772bdd5fe7ef2e2f712085cc1dc575ce90063b64688594ec4218150d0ab`.
Its nine candidate IDs differ from the September 25 manifest's nine IDs.
Sharing an audit run ID does not make these the same approved composition.
The automated `materialSufficient: false` flag does not negate a valid operator
rescue approval; the decision above is based on the actual dated images.

The rescue board was also fetched and visually inspected in full: glasses and
tan outerwear, a white suit, a black editorial look, a warm interior glasses
portrait, a studio suit portrait, a casual dark-shirt selfie, cap and denim,
hooded denim, and a blue-lit performance portrait. It is a different mix of
editorial, casual, and performance imagery—not evidence that the historical
daily board met the promise. This review neither changes its approval nor
claims it has been released as a new nine-card edition.

## English copy and the existing teaser

The task's initial “no supporting English copy” premise is now only true of
the immutable September 25 manifest. The actor definition and already published
preflight teaser contain:

> Boyfriend Lighting looks for Liu Yuning in a softer register: warm light,
> candid styling, and the quiet pauses that make a portrait feel closer than a
> performance.

The live teaser reports publication on `2026-09-30T19:52:11.356Z`, with exactly
three MEDIA-backed cards from the separate rescue board. Its existence is not
a nine-card release, and this review did not author or approve that existing
copy. No new edition copy was approved: describing the rejected nine-card set
as meeting the promise would be misleading. Do not insert the teaser copy into
the immutable historical manifest to make it indexable.

## Verified public outcomes

All requests below were made to the production origin on 2026-10-07.

| URL path | Status | Outcome |
| --- | --- | --- |
| `/.netlify/functions/public-preflight-preview?actorId=liu-yuning&vibeIdx=2` | 200 | Existing three-card teaser with English context and canonical MEDIA delivery URLs. Preserved, not newly published. |
| `/.netlify/functions/public-released-pack-preview?actorId=liu-yuning&vibeIdx=2` | 404 | `{"status":"unpublished"}`; no released permanent pack preview. |
| `/.netlify/functions/public-released-pack-preview?actorId=liu-yuning&vibeIdx=2&date=2026-09-25` | 200 | Nine-card `vibe-atlas-daily-pack-snapshot`; proof of daily delivery, not an indexable edition. |
| `/vibe-atlas/editions/2026-09-25/liu-yuning/` | 404 | “Public record not found”; also verified in a real browser screenshot. |
| `/vibe-atlas/packs/liu-yuning/boyfriend-lighting-2/` | 404 | “Public record not found.” |
| `/vibe-atlas/actors/liu-yuning/` | 404 | “Public record not found.” |
| `/sitemap.xml` | 200 | None of the three record paths above is listed. |

These distinctions are intentional. Do not report the dated snapshot or the
three-card teaser as a successful permanent pack/actor release.

## Safe future publication requirements

A future release must use a separately reviewed cohesive nine-card board and
original copy grounded in those exact images. Check current eligibility again
at publication time, retain the exact approval provenance, materialize through
the existing immutable MEDIA-backed path, and use a legitimate new publication
date without displacing that date's existing Daily Drop. Do not overwrite or
backdate September 25. Verify the public preview, exact pack and actor records,
and sitemap only after the new publication is independently resolvable.
