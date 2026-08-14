# Release Notes

## card-metrics-v1

Shipped:
- Added `card_events` in Netlify Database (Drizzle schema at `db/schema.ts`,
  migration `20260814164206_create_card_events`) as an append-only log of card
  engagement: `export`, `legendary`, `misprint`, `save`, `share`, `click`,
  `collection_save`, `plan_add`.
- Added `/api/card-metrics` with a write path and three read views: `trends`
  (zero-filled daily series), `top` (most-acted-on cards in a window), and
  `card` (one card's lifetime per-event totals plus its recent series).
- Legendary and Misprint marks are now recorded. Both tier controls were
  previously local React state with no persistence, so the marks were lost on
  reload and counted nowhere. Only setting a tier is recorded — the controls are
  toggles, and counting clears too would make deliberation look like popularity.
- Card exports are now keyed on the image's stable id instead of an
  `actorName-vibeLabel-date` composite. The old key minted a new identity every
  day, so per-card export counts could never accumulate beyond a single board.
- Fixed `collection_save` and `plan_add`, which `collectionDB.ts` and
  `planDB.ts` had been sending to an endpoint that rejected both with a 400
  swallowed by `.catch(() => {})`. Those events had never been recorded.
- Replaced `log-engagement.js` and `batch-metrics.js`. The latter had no callers
  anywhere in the codebase; the former appended to an unbounded per-key array
  and lost concurrent events to last-write-wins.
- Added a fourth read view, `health`, and a **Metrics health** tab in Fandom
  Admin that shows whether events are arriving: per-event counts across
  24h/7d/all-time, last-seen times, and a top-cards list. Every event type is
  listed even at zero, because a wired-up-but-silent event is otherwise
  indistinguishable from an untriggered one. Loading the tab exercises two read
  views, so it doubles as an in-app check.
- Client tracking failures are now visible in dev. The calls stay
  fire-and-forget, but the client checks `response.ok` — `fetch` resolves rather
  than rejecting on a 4xx, so the old `.catch()` could not see a rejected
  payload, which is precisely why the failure went unnoticed. Production UX is
  unchanged: tracking never interrupts the user.
- Added `scripts/smoke-card-metrics.mjs` (`npm run smoke:metrics -- <deploy-url>`),
  a post-deploy check that writes one of each event, reads every view back,
  confirms the rows landed, confirms bad payloads are rejected, and confirms
  boards and images stay in separate leaderboards.
- Migrations no longer emit events. `dbSaveCard` takes `{ track: false }`, used
  by `migrateBookmarks.ts` and by the Lightbox's legacy-promotion branch. Both
  move cards that were saved at some earlier unknown time; without the opt-out,
  `migrateBookmarks` — which runs on every mount — would have dated every user's
  legacy bookmarks to the deploy and attributed them to actor `Unknown`.

Operational notes:
- **Metrics before the `card_events` migration are not reliable.** The analytics
  baseline starts at the deployment date of `/api/card-metrics`. Historical blob
  data under the old `engagement` and `batch-metrics` stores is not migrated: the
  original keys embedded display names and dates and never recorded stable image
  ids, so the old rows cannot be mapped onto the new identities. Counts start
  from zero and the blobs are left in place.
- The database queries were validated by compiling them to SQL, not by running
  them — this branch has no database branch provisioned until a deploy is
  published, so the first real exercise of the read views happens on deploy.
  Run the smoke script then.
- `save`, `share`, and `click` are accepted by the endpoint but sent by no UI, so
  they will stay at zero. They are in the allowlist because they were in the old
  one, not because anything emits them.
- Editorial rate metrics need a denominator that does not exist yet. A
  misprint-per-view rate requires an impressions signal; nothing currently
  records that an image was seen. What is computable today is
  `misprint / (misprint + legendary)` per card and misprint counts ranked
  against export counts.

## Durable Saved Collection foundation

- Added Resend-backed public magic links, hashed single-use tokens, revocable
  secure sessions, and non-enumerating link requests.
- Added Fandom-owned multi-device collection sync with stable server IDs,
  revisions, cursors, tombstones, idempotent mutations, and explicit per-device
  merge consent.
- Preserved anonymous IndexedDB/localStorage behavior, offline writes, and
  cross-tab convergence.
- Added a dedicated HMAC-authenticated read-only CREATE collection boundary;
  CREATE cannot mutate or own Saved Collection.

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
