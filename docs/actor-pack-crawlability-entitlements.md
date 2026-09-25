# Actor and Released Pack crawlability and entitlement model

Status: living companion to `archive-monetization-seo-plan.md`, reconciled 2026-09-25

## Decision

Public actor and Released Pack discovery must be useful without making protected pack depth anonymously enumerable.

```text
Public actor/pack surface = approved identity, editorial context, bounded samples, canonical discovery
Collector pack surface = entitled catalogue depth, generation, refresh, saves, and premium utility
```

Search crawlers and signed-out people receive the same approved public record. Membership changes the protected application data and actions returned after authentication; it does not create crawler-only content.

## Current architecture

The earlier single-payload risk is now partly resolved. Public Released Pack discovery uses dedicated safe projections, while complete actor-pack depth remains behind Collector capability checks.

Current public behavior includes:

- a signed-out directory of published, manifest-backed pack teasers;
- a public read-only pack preview with approved metadata and a bounded sample of up to three cards;
- fail-closed behavior when publication inventory or eligibility is unavailable;
- actor and edition public records only when immutable manifests pass current indexability checks;
- Daily Drop fallback behavior when a pairing has no qualifying Released Pack teaser.

The remaining audit must confirm that no legacy anonymous endpoint still returns the complete `ACTOR_PACKS` object, hidden source depth, premium URLs, private diagnostics, or admin metadata.

## Publication lifecycle

Do not collapse these states:

1. **Internal** — present in configuration or inventory only.
2. **Release-ready** — complete enough for internal release rules.
3. **Published** — deliberately released.
4. **Publicly indexable** — backed by the required immutable manifest and approved media/editorial projection.
5. **Public teaser available** — approved for bounded anonymous preview.
6. **Collector-entitled** — complete protected depth may be returned to the account.

A release-ready or Daily Drop pairing may legitimately have no public teaser. The application must not fabricate one or expose private content to avoid an empty state.

## Tier behavior

### Signed-out public

Can:

- browse the public Released Pack directory;
- open approved read-only teasers;
- discover published actor and edition records that pass indexability checks;
- use the Daily Drop and rolling free archive window;
- share canonical public URLs.

Cannot:

- enumerate the complete actor-pack catalogue payload;
- open complete actor × vibe depth on demand;
- run Collector refreshes;
- sync an account-owned Collection;
- receive premium exports, raw sources, or private diagnostics.

### Authenticated free

Can do everything available publicly and may:

- sync My Collection after explicit device-merge consent;
- explicitly save eligible public items supported by the Collection contract;
- retry failed sync and delete downloaded items across devices.

Free sync persists permitted artifacts. It never upgrades the account's source access, historical depth, refresh capability, or export class.

### Fandom Collector

Can:

- open the complete eligible Released Pack experience;
- browse full published actor × vibe depth;
- run Collector refreshes subject to cooldown and generation policy;
- explicitly save eligible individual images and whole grids;
- use eligible historical depth, premium treatments, and premium exports;
- receive future original Collector packs.

Collector access does not grant Creator OS production, scheduling, publishing, or analytics.

### Creator OS and ecosystem bundle

Creator OS remains independent and does not automatically unlock Fandom Collector access. The ecosystem bundle may include Collector, Creator OS, and the selected-artifact handoff.

The bridge transfers one selected permitted artifact. It never transfers the whole actor-pack catalogue, raw engine inventory, hidden retrieval configuration, or unrestricted source archive.

## Public response contracts

### Public Released Pack directory

Return only deliberately approved teaser fields, such as:

```text
actorId
actorSlug
actorNameZh
actorNameEn
vibeIndex
vibeSlug
vibeLabelZh
vibeLabelEn
subtitleZh
subtitleEn
canonicalUrl
sampleCardCount
updatedAt
```

The directory contains only published, manifest-backed entries. If the publication inventory cannot be trusted, fail closed with a clear user-facing state.

### Public Released Pack preview

Return approved actor/vibe metadata, teaser copy, canonical identity, and a bounded sample of up to three approved cards. The projection is read-only and must not contain complete pack depth, hidden queries, raw source inventory, high-resolution URLs, private scores, or capability-bearing links.

### Public actor/edition HTML

Initial HTML should contain the same approved public fields visible to a signed-out person, escaped metadata, useful no-JavaScript content, and conservative structured data. Only records passing current publication and indexability checks belong in the sitemap.

### Authenticated free Collection contract

Account-scoped sync may contain explicit eligible saves and merge/deletion state. It must not embed Collector-only source depth merely because a public teaser or previously downloaded image was saved.

### Collector pack/run contract

A separate authenticated response may contain complete eligible pack data, generated runs, refresh provenance, and save state after verifying `fandom_collector`, `ecosystem_bundle`, or explicit admin authorization.

Do not return one large response and ask the browser to discard fields according to tier.

## Canonical public actor page

Preferred route:

```text
/actor/:slug
```

A qualifying page should include approved bilingual identity, romanization where available, original editorial introduction, public vibe labels, a standard-resolution sample, related public editions, canonical metadata, and a restrained Collector invitation.

It must not expose hidden pack configuration, retrieval strategies, protected raw URLs, private quality diagnostics, admin annotations, Creator OS records, or auth/capability tokens.

Unknown, internal, unpublished, or non-indexable actors must return a real not-found state and must not create indexable thin pages.

## Fallback rules

- If a public actor or edition record is missing/non-indexable, fall back to the appropriate Archive or discovery view rather than advertise a dead record URL.
- If a Daily Drop pairing has no published teaser, route signed-out/free visitors to the Daily Drop or generic public library.
- If a known release-ready pair lacks an indexable teaser, show a bounded explanatory state only when the current public contract explicitly permits it; never synthesize cards from private data.
- Preserve raw server errors for operational diagnosis, but translate expected public-access states into clear UI copy.

## Caching and authorization

Public directory and teaser responses may use shared caching only because their payloads are identical for all visitors. Collector and Collection responses must be private/account-scoped.

Never vary a shared public response only by cookie without proving the CDN cache key and headers prevent member data from reaching public visitors. Authorization tests must cover field leakage, stale capability, account separation, and cache separation.

## SEO and sitemap policy

Include only public records backed by qualifying immutable manifests. Each page should self-canonicalize, use bilingual metadata naturally, link to related approved records, and show the same preview to crawlers and people.

Do not index member APIs, account/checkout pages, signed handoff URLs, admin diagnostics, capability URLs, arbitrary actor/vibe combinations, or fallback pages lacking an approved record.

## Remaining implementation work

1. Audit and retire any legacy anonymous complete-pack response.
2. Complete canonical actor-page HTML and directory coverage for every qualifying published actor.
3. Expand sitemap coverage only from trusted publication manifests.
4. Add explicit authorization, leakage, and cache-separation tests across every response contract.
5. Keep free Collection sync tests separate from Collector source-entitlement tests.
6. Add tier-aware conversion analytics and accessibility coverage.
7. Implement the Creator OS handoff only after the neutral package contract exists.

## Measurement

Useful privacy-safe events include:

- `actor_page_view`
- `released_pack_directory_view`
- `released_pack_teaser_opened`
- `actor_pack_paywall_view`
- `actor_pack_upgrade_click`
- `collector_actor_pack_opened`
- `actor_pack_refresh`
- `actor_pack_save`
- `actor_pack_export`
- `collection_sync_completed`
- `creator_os_handoff_intent`

Use bounded public identifiers and entitlement categories. Never transmit source URLs, search queries, email addresses, tokens, or private diagnostics.

## Acceptance tests

The system must prove:

- signed-out visitors can discover and evaluate approved public actor and pack surfaces;
- the anonymous API cannot enumerate complete protected pack depth;
- a Daily Drop does not automatically become a public Released Pack teaser;
- authenticated free accounts can sync eligible saves without acquiring Collector access;
- Collector and bundle accounts can access complete eligible packs and refreshes;
- Creator OS-only accounts do not gain Collector access;
- unknown, unpublished, or non-indexable records fail closed;
- member payloads never enter shared public caches;
- public pages contain no high-resolution, private, admin, or capability-bearing fields;
- the handoff transfers one selected artifact, not the actor-pack database.
