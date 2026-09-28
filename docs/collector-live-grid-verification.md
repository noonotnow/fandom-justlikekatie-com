# Collector grid live verification — 2026-09-24

This is a production observation, not a fixture-test result. The external site is `https://fandom.justlikekatie.com/`. GitHub PR #104 was merged into `main` as `e55d1bec`; the live bundle exposed the Collector grid controls and the function route responded, but these checks did not prove the exact deployed commit.

## Observed

- Anonymous `GET` and `POST` to `/.netlify/functions/collector-grid`, and anonymous `GET` to `/.netlify/functions/actor-pack-depth`, returned `401` with “Sign in is required.” A signed-in non-Collector account was **not** available for a live `403` check.
- The public `star-of-day` endpoint returned a nine-image edition for Zhang Linghe on 2026-09-24. This was checked before and after the Collector attempts; no public Drop change was observed.
- In the user's signed-in Collector session, Liu Yuning / Boyfriend Lighting produced a run labeled **fresh** with nine visible images and source labels. A later screenshot showed two saved-run timestamps, but both displayed the same images and ordering. An additional refresh attempt displayed the cooldown message “Please wait before refreshing this pairing.”
- A saved Liu Xueyi / Cold Jade Immortal run reopened with nine visible images labeled **fallback**. Refresh returned “This pairing is not eligible for Daily Drop.” That approval failure occurs before a new search, so it is **not** evidence that search found no Liu Xueyi images.
- The user also encountered “The image judgment was not saved. The same image remains ready—retry your choice” in operator preflight; this prevented them from assessing further Liu Xueyi pairings.

## Not established

- The screenshots showed source labels and loaded images, but no inspection of their network URLs was performed to verify every image came from durable MEDIA.
- A saved-run selector was visible, but the evidence did not establish that **each** run's exact nine image URLs, ordering, and source links survived a full page reload. Approved-override generation was not tested.
- Later screenshots appeared to contain more than nine cards in one full grid, whereas the live JavaScript fetched independently rendered `selectedRun.images.slice(0,9)`. Without the user's page URL and an actual browser DOM/network check, the mismatch cannot be assigned to a stale bundle, screenshot capture, or a live rendering defect.

**Result:** Partial live verification, not an end-to-end pass. Fresh generation and a second saved run were observed through the user; distinct refresh results, durable-media URLs, exact reload persistence, non-Collector gating, and override behavior remain unverified or failed.

## Renderer follow-up — 2026-09-24

An anonymous Chromium visit to the live released-pack URL rendered the sign-in gate: zero grid containers and zero cards. The live Collector-grid GET returned 401 without a session. In a separate Chromium visit to the **live site bundle**, intercepting only membership, pack depth and Collector-grid requests with a controlled 12-image saved-run response yielded one grid container, nine figure elements, and nine image elements. The browser issued one GET for history and one POST for refresh; neither reached production because both were intercepted. This confirms the deployed renderer caps an oversized response at nine, but does **not** establish what the authenticated production response or earlier screenshot contained. Do not attribute the screenshot to a stale bundle or a specific DOM defect without inspecting that signed-in session.

The signed-in user subsequently reported HTTP 200, nine images in the saved-run response, one grid container, and **eleven** matching card elements on their page. Reproducing the deployed bundle with nine mocked images sharing one source link, then switching between two saved runs, yielded card counts of **9 → 17 → 25 → 33**. The deployed component keyed cards by run ID plus source link; distinct images can share a link, so sibling keys collided and React left extra card elements after updates. The corrected component keys cards by run ID plus position, which is unique within a nine-card run. A browser regression test uses shared links, switches saved runs, and checks that the grid stays at nine cards. This identifies the rendering mechanism, while the user's exact image URLs remain private and unverified.

The isolated release fix was submitted in GitHub PR #112. The controlled live-bundle reproduction above describes the **pre-fix** behavior, before that PR was merged and published.

## Post-release Collector observation — 2026-09-25

PR #112 was merged on 2026-09-24 (GitHub merge commit `10cedefd1fe6303dc9ac6799e8faabeb5c34857a`). The production site served a JavaScript bundle with the corrected position-based image-card keys. Anonymous access to the Collector-grid endpoint still returned 401.

In the user's consented, signed-in production Collector browser, a count-only history check before refresh returned HTTP 200 with four saved runs, each containing nine images and nine MEDIA references. The selected grid had nine DOM cards, nine loaded images, and nine visible source links. No checksum-identical boards were reported among those four runs. The user subsequently reported that the refreshed grid visibly showed **different pictures**. A second count-only history check returned HTTP 200 with five saved runs: one new run and zero missing or changed earlier runs. A Network screenshot showed requests to the image MEDIA host; neither cookies nor private response bodies were collected.

The second console result was shared collapsed, so post-refresh DOM counts and the POST status/body were not captured at that time. The user later completed the missing full-reload and saved-run switching check below. No private URLs or session credentials were requested.

## Full-reload saved-run check — 2026-09-28

In the same consented production Collector account, the user reloaded the released pack page and ran a count-only check that switched the on-page saved-run selector through **all five runs**. Each run had exactly nine saved images, nine DOM cards, nine loaded images, nine visible source links, and nine HTTPS thumbnails with MEDIA asset references. For each selection, every displayed image URL matched the corresponding image in that selected saved-run response, in order. The selector was restored to its original value afterward. The earlier four runs were still present, and the fifth (visibly different) refreshed run reopened too.

**Result:** The released frontend and authenticated saved-run history now show a visibly different refreshed board, one new saved run without changing the previous four, and nine rendered, loaded, source-linked MEDIA cards for each of five runs after a full reload. The exact refresh POST response and a checksum comparison of the fifth run against the earlier four were not collected; do not claim those narrower observations.