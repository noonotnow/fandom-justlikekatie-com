# Availability guide: current claims versus retained links

Approved October 30, 2026. An expired availability review must not block unrelated site releases or silently become a renewed review.

## Existing published guide

The registered Against the Current guide keeps its canonical URL when evidence expires. Public-page preparation renders a server-side, JavaScript-independent **Needs recheck** page with the original editorial review date and official provider links. It withholds country playback, tier, episode-range, subtitle and schedule claims. Provider links are navigation aids, not playback guarantees.

Retention requires an existing registered page plus valid identity, signoffs, safe provider-owned links and structurally valid evidence. Invalid or future timestamps, missing signoff and conflicting or malformed evidence still block preparation. A newly registered stale guide without prior HTML cannot use retention to publish itself.

## Current claims remain strict

`renderWatchPage` and release advisory decisions still require the complete review record to pass the original seven-day freshness rule. A fresh page's browser bootstrap also hides current claims if the earliest relevant evidence timestamp expires between builds. That browser check supplements, not replaces, server-rendered stale handling; JavaScript-disabled snapshots cannot update themselves between deployments.

Restore current details by performing the real editorial review, updating the relevant provider/region/schedule evidence and timestamps, preserving unknowns, and running the normal reviewed release process. Updating only the top-level date is insufficient. Rebuilding is not reviewing. No unpublish/republish URL cycle is needed.

The October 21 source evidence and its signoffs were not rewritten for this change. The October 25 listing supplement does not renew country/player/tier/subtitle verification.

## Verification

- Strict fresh rendering rejects expired evidence.
- Existing valid stale guide renders retained links at the same URL without changing source JSON.
- New stale registration, unsafe sources, missing signoff and invalid/future evidence remain blocked.
- Complete fresh evidence can restore current claims; headline-date-only changes cannot.
- Browser and no-JavaScript narrow-screen checks cover claim withholding and expiry handling.
- Full current-date public generation and the analytics static guard must pass before release.
