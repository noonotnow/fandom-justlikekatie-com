# Release Notes

## baidu-images-v1

Shipped:
- Added a homecooked Baidu Images provider at `/.netlify/functions/baidu-image-search?q=...`.
- Added defensive embedded-JSON parsing for multiple Baidu page shapes, browser-like request headers, a 4.5-second per-attempt timeout, one exponential-backoff retry for HTTP 429/503, response type/size validation, and a one-hour warm-instance cache.
- CJK queries now fetch Baidu first. A qualifying Baidu batch is returned immediately without calling or blending Brave, Google, Bing, or Yandex. Non-CJK queries retain their existing Brave-first behavior.
- Baidu must clear the existing seven-result viability threshold, 0.7 count/diversity quality threshold, all shared result filters, and both raw and post-filter subject-identity gates.
- Only a Baidu hard failure, timeout, invalid/empty response, identity rejection, sparse batch, or low-quality batch invokes the existing fallback cascade: Brave baseline, then Google Images → Bing Images → Yandex Images when required. Brave remains the final retained fallback.
- Baidu failures and rejections are logged and exposed through `baiduAttemptLog`, `baiduFallbackUsed`, and `fallbackReason` in debug responses without failing Star of the Day.
- Baidu candidates reuse the existing placeholder, ad/promo, commerce, product URL, wrong-actor/co-star, namesake, reference-page, exact-URL, and same-source filters.
- Added a 25% subject-mention ratio alongside the existing two-mention minimum for Baidu and SerpAPI batches. Baidu must pass the identity gate both before and after filtering, preventing promo-heavy volume from winning after its actor-bearing items are removed.
- Results carry per-item provider provenance, while debug responses document the providers actually fetched and the final selection preference.

Operational notes:
- Baidu may still change its embedded page data or present anti-bot verification. Those responses are rejected explicitly and fall back rather than producing an empty Star of the Day.
- The cache is process-local, so cold Netlify instances still make a Baidu request; it is not a distributed rate-limit guarantee.
- Identity gating remains metadata-based, not face recognition. Generic captions can reduce Baidu yield, but rejection safely returns control to Google/Bing/Yandex/Brave.

## serpapi-fallback-v9-threshold7

**Bing passed taste court. The creature starts better dressed now.**

Shipped:
- Bing-first image cascade: `bing_images → google_images → yandex_images`
- Removed unsupported Baidu SerpAPI image engine; Baidu remains an external image-search button
- Added debug telemetry: `serpApiEngineLog`, `fallbackUsed`, `braveTriggerReason`
- Fixed Bing domain attribution so results show real source domains instead of viewer redirects
- Raised Brave fallback threshold from 3 to 7 so sparse result crumbs no longer block fallback
- Added subject-relevance guard so high-volume wrong-subject grids get rejected before display

Validated:
- Wang Yilun rescue improved
- Riley Batch 2 rescued
- Wang Hedi editorial benchmark held, with minor calibration notes for later
- Liu Yuning close-up batches improved dramatically
- Liu Xueyi / Sohu monotony parked as a separate pre-existing issue

Product rules captured:
- Crumbs are not breakfast.
- Bugs are not breakfast.
- Seven is breakfast court.

Session epitaph:
The joke found the architecture.
