# Archive actor discovery measurement

This contract measures the public Grid Builder's **Browse published actor**
control. It is separate from released-pack entry, guide search, and Archive
record-link reviews; do not merge their funnels or duplicate their events.

| Description | Event name |
| --- | --- |
| Directory scan attempt settles with verified, verified-empty, or partial inventory | `archive_actor_directory_ready` |
| Directory scan attempt fails | `archive_actor_directory_failed` |
| Reader chooses an actor present in the verified public directory | `archive_actor_selected` |
| Selected actor's filtered page passes edition/link and actor checks | `archive_actor_page_verified` |
| Selected actor's filtered page fails | `archive_actor_page_failed` |
| Complete Archive grid is successfully saved locally or exported | `archive_grid_completed` |
| Public inventory request settles (unfiltered, actor-filtered, or dated edition) | `archive_inventory_outcome` |
| Reader follows an individual image's edition link | `archive_image_edition_opened` |
| Server authorization attempt for an individual card settles | `archive_card_authorization` |
| An authorized card is saved locally, or local persistence fails | `archive_card_save_outcome` |

## Public creation versus individual acquisition

- `archive_inventory_outcome` covers all public Builder sources. Its
  `discovery_source` is `unfiltered_archive`, `published_actor_directory`, or
  `edition_record`. It includes `phase`, `retry`, `result`, `edition_count`,
  `has_more`, and a bounded `failure` on errors. This is a request outcome, not
  an engagement event. Initial requests use `retry=false`; an explicit initial
  retry or a pagination request following a failed page uses `retry=true`.
  Changing the actor does not count as a retry. Cancelled requests do not count.
- `archive_grid_completed` now also covers verified dated-edition Builder
  inventory with `discovery_source=edition_record`. `loaded_more=true`, when
  present, means an additional page supplied verified editions in the current
  selection. It does **not** prove that the completed grid used a later-page
  image. Failed or empty additional pages do not set this property.
- `archive_image_edition_opened` includes only `source=archive|edition` and
  `placement=picker|slot|alternate`. It counts a link activation, not successful
  destination loading or a subsequent save. No image identity or URL is sent.
- `archive_card_authorization` uses `outcome=allowed|sign_in|upgrade|retry`.
  Retry categories are `precondition`, `transport`, `billing_delay`, `http`,
  and `invalid_response`. A malformed or mismatched successful response is
  never counted as allowed. Server error text is never collected.
- `archive_card_save_outcome` uses `outcome=saved|persistence_failed`. `saved`
  follows durable local Collection persistence, not merely server approval.
  Account-sync failure does not erase local success. Removal emits neither a
  new authorization nor an acquisition event. Grid saving/exporting never
  imports or counts its constituent cards as individual acquisitions.
- Card events include only a validated public `edition_date` in addition to
  the enums above. Use Shanghai calendar dates and the three-day save cutoff
  when analyzing older versus recent editions; do not use an elapsed-hours
  approximation or interpret client instrumentation as access authority.
- These are aggregate actions, not a joined reader funnel. In-memory Builder
  attribution ends on navigation. A link click and a later card save cannot
  establish that the same reader completed both without additional evidence;
  this contract deliberately adds no persistent joining identifier.

## Privacy and interpretation

- Properties contain only public slug-shaped `actor_id` values validated against
  the current directory, validated public edition dates, fixed enums, counts, and booleans. No account identifiers,
  image IDs, URLs, grid IDs, Collection contents, names, search text, error messages,
  or correlation identifiers are sent.
- Directory events are **diagnostics**, one per completed attempt, including
  retries. Automatic scan pagination is never actor selection or engagement.
  Cancelled/stale scans and actor pages emit no outcome.
- Page `phase` is `initial` or `more`; `result` is `verified`, `verified_empty`,
  `partial`, or `failed`. `edition_count` counts only validated editions returned
  on that page. `has_more` prevents an empty bounded page from being interpreted
  as an actor having no published editions.
- Partial responses may contain zero verified editions. They remain `partial`,
  never verified-empty or a transport failure. Failure categories are
  `transport`, `http`, `invalid_response`, or `unavailable`; raw server copy stays
  out of analytics. Directory storage unavailability is an explicit failure,
  retaining the count of actors already verified.
- Completion has `completion=saved|exported`. `saved` means successful local grid
  persistence, not successful account sync. `exported` follows a successful PNG
  download/share request, not an external social post or proof of receipt.
  Proposal generation and handoff preparation are not completions.
  Prepared handoffs carry their original in-memory attribution; successful native
  sharing counts only after its promise resolves. Unsupported sharing, cancellation,
  rejection, and sharing a stale handoff after actor/source changes do not count.
- Completion `discovery_source=published_actor_directory` includes the selected
  public actor only after at least one filtered page supplies verified editions
  (even if the page is partial). A failed later page does not erase usable earlier
  editions. Initial retries clear earlier proof. `unfiltered_archive` completions
  have no actor ID. Dated public inventory uses `edition_record` without an
  actor ID. Collection and Daily Drop Builder sources do not emit this event.
- Attribution exists only in the current Builder's memory. Choosing another
  actor, clearing the filter, leaving this source, or unmounting invalidates old
  asynchronous completion contexts, even when the same actor is selected again.
  There is no storage or cross-device/person-level joining.
- Existing `historical_grid_saved` and export artifact logging stay unchanged.
  This aggregate completion adapter runs at the same successful save/export
  boundaries without copying their Collection/artifact payloads.
- Counts are **actions**, not unique readers: retries, repeated exports, and edits
  can repeat. Saved and exported outcomes overlap and must not be added into a
  count of people. Do not call event-count ratios person-level conversion or
  evidence that the control causally improves completion.

## External production boundary

Instrumentation uses the existing optional shared tracker wrapper (Umami when
injected by Replit; the configured Google tag/data layer on external Netlify).
No new tracking script, reporting credentials, or public reporting endpoint is
introduced. Tracker absence/failure must not affect browsing, saving, or export.

This implementation is **not a live conversion report**. Replit analytics access
authorization does not establish coverage of the external Netlify site.
Before starting an observation window:

1. Publish the approved code through the existing Git/Netlify release process.
   Verify the actual production JavaScript bundle contains all event names above.
   Record the bundle/deployment and UTC verification date.
2. Confirm the configured production destination receives these events and
   obtain authorized, date-bounded **aggregate** reporting access. Do not inspect
   visitor-level rows or infer zero interest from an empty Replit dataset.
3. Start after both checks pass. Exclude incomplete days, suppress small actor
   groups according to the authorized reporting source's privacy policy, and
   label missing/suppressed groups unavailable rather than zero.
4. Report directory diagnostics separately. Compare actor selections, verified
   initial page outcomes, and saved/exported completions by public actor only
   where sufficiently populated. Keep pagination and retries separate from
   initial success. Unfiltered completion actions provide context, not a
   matched control cohort or conversion denominator.

Useful later questions:

1. Which sufficiently populated actor selections reach verified inventory and a
   saved or exported grid?
2. Are drop-offs associated with partial/empty inventory or transport failures?
3. How do directory-attributed completion actions compare with unfiltered
   Archive completion actions during the same verified reporting window?