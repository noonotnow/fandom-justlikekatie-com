# Homepage C-drama guide menu: production review

## Deferred comparison — review on or after 2026-10-14

At the user's request, the aggregate comparison is deferred to a dated
follow-up rather than keeping this review active while data accumulates.
The intended first window is **2026-09-30 00:00 UTC through 2026-10-14
00:00 UTC**, covering 14 complete days after the menu instrumentation was
observed in production. Confirm collection coverage before using this window;
if collection began later or the sample is still small, postpone the
editorial comparison. A production GA4 aggregate export or authorized
reporting connection is still required.

## Interim evidence — 2026-09-30

The published homepage at `https://fandom.justlikekatie.com/` returned HTTP
200. Its HTML loaded the configured GA4 tag (`G-FHZJ1T74TG`), and its live
JavaScript contained both `homepage_guide_menu_opened` and
`homepage_guide_menu_link_selected` with a `destination` property. The site
was checked without generating artificial menu interactions. This verifies
the live instrumentation and configured destination, **not** that GA4
received or processed a particular reader event. The menu events were
introduced on September 29; the exact production activation time has not
been established. At this review, no meaningful post-release observation
window had elapsed.

The authorized Replit Project Analytics dataset was queried for these two
custom events on `/` from **2026-09-12 00:00 UTC through 2026-10-01 00:00
UTC**. It returned no rows. This separate dataset does not observe the
externally hosted Netlify site. The production GA4 property has no authorized
aggregate reporting connection or supplied export in this workspace. Thus
none of the following are measurable yet; **unavailable is not zero**:

| Production measure | Count |
| --- | --- |
| `homepage_guide_menu_opened` | Unavailable |
| `homepage_guide_menu_link_selected`, `glossary` | Unavailable |
| `homepage_guide_menu_link_selected`, `archetypes` | Unavailable |
| `homepage_guide_menu_link_selected`, `watch_journal` | Unavailable |
| `homepage_guide_menu_link_selected`, `vibing_now` | Unavailable |

**Editorial decision:** Keep the current menu order and prominence. Neither
one day of potential exposure nor an empty *different* analytics dataset
supports changing it. The top-level guide and getting-started links and the
featured Vibing Now card are separate entry points; destination pageviews
must not be counted as menu selections.

## Evidence needed for the completed comparison

Use a GA4 aggregate export for the verified production stream, filtered to
homepage `/` and the two exact event names, over the **same explicit,
post-release UTC date window**. Include the total open count and selected
event counts by the four bounded `destination` values above (plus any unknown
values if present). Verify the live stream has actually collected events; a
configured tag alone does not prove collection. Prefer at least 14 complete
days and a substantial interaction sample (for example, 100 opens and 30
selections overall) before drawing editorial conclusions; otherwise report
the sample as insufficient and revisit. Do not request raw visitor/session
records or individual URLs.

Opens are counted each time the menu is expanded, including repeated opens
by one reader. Selections are clicks on links *inside* the menu; an open may
end without a selection, and a reader may make selections on different visits.
These aggregate counts are not a session-matched funnel or a conversion
rate. Compare destination shares only when counts are large enough, and
consider menu position and competing homepage links before inferring
preference from a difference.