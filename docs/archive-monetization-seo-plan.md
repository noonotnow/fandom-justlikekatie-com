# Vibe Atlas archive monetization, access, and SEO plan

Status: living product and implementation contract, reconciled 2026-09-25

## Decision

Vibe Atlas uses a **visible catalogue / tiered utility** model. Public discovery, authenticated free participation, and paid Collector depth are distinct capabilities rather than one binary paywall.

- Published, publicly indexable records remain useful discovery surfaces.
- Today's Daily Drop and the rolling free archive window remain complete free experiences.
- Signed-out visitors may browse only deliberately published teaser projections.
- Authenticated free accounts may sync explicitly saved Collection items after device-merge consent.
- Collector unlocks eligible historical depth, complete Released Packs, refreshes, premium treatments, and premium exports.
- Creator OS remains a separate production and publishing product.
- Paid access never implies unrestricted raw or uncompressed third-party source files.

Client state is never an authorization boundary. Publication manifests, account capability, and server-side data projections determine what is returned.

## Product boundaries

### Fandom

```text
Discover -> Collect -> Build -> Export -> Share
```

Fandom owns Daily Drops, actor and vibe discovery, public editorial records, the visible archive, My Collection, Released Packs, the Grid Builder, Fandom-native exports, and Collector membership.

### Creator OS

```text
Capture -> Develop -> Compose -> Plan -> Publish -> Analyze
```

Creator OS owns idea and project development, platform renditions, production status, scheduling, publication lineage, and performance analysis. It must work with assets imported from any source and must not depend on Fandom internals.

### Bridge and bundle

```text
Selected Fandom artifact -> neutral export package -> Creator OS project
```

The bridge transfers one selected, permitted artifact and approved metadata. It does not expose the actor-pack catalogue, engine inventory, retrieval configuration, or raw source archive.

Candidate capabilities remain:

- `fandom_free`
- `fandom_collector`
- `creator_os`
- `fandom_creator_bridge`
- `ecosystem_bundle`
- explicit admin/operator authorization

Creator OS alone does not grant Fandom Collector depth unless the commercial offer explicitly includes that entitlement.

## Access matrix

| Capability | Signed-out public | Authenticated free | Fandom Collector | Bundle / authorized admin |
| --- | --- | --- | --- | --- |
| Current Daily Drop | Complete free grid | Complete free grid | Complete free grid | Complete free grid |
| Rolling free archive window | Complete eligible editions | Complete eligible editions | Complete eligible editions | Complete eligible editions |
| Archive index | Public metadata and safe previews | Same public catalogue | Full eligible historical depth | Full eligible depth |
| Released Pack directory | Published manifest-backed teasers | Same teasers | Full eligible catalogue | Full eligible catalogue |
| Released Pack preview | Read-only approved teaser | Read-only approved teaser | Full eligible pack | Full eligible pack |
| My Collection sync | No account sync | Yes, after device-merge consent | Yes | Yes |
| Explicit pack/card/grid saves | Public items only when supported after sign-in | Explicit eligible saves | Complete eligible Collector saves | Authorized saves |
| Collector refresh | No | No | Yes, subject to policy | Yes |
| Premium treatments / Master Export | No | No | Yes, where eligible | Yes, where eligible |
| Creator OS handoff | Public/manual export only | Public/manual export only | Only with destination entitlement | Yes when entitled |

Free sync is persistence for items the account is already permitted to save. It is not a back door into protected historical data, complete Released Packs, Collector refreshes, or premium exports.

## Publication and access vocabulary

These states are related but not interchangeable:

- **Internal:** exists in application or editorial inventory but is not approved for public delivery.
- **Release-ready:** meets internal completeness rules; it may still lack a public record or teaser manifest.
- **Published:** deliberately released as a Fandom edition, pack, or editorial object.
- **Publicly indexable:** has the required immutable publication manifest and passes current editorial/media checks.
- **Public teaser available:** has an approved projection suitable for anonymous delivery.
- **Collector-entitled:** complete protected payload may be returned after capability verification.

A Daily Drop pairing does not automatically create a Released Pack teaser. A missing or non-indexable manifest must not be replaced by invented public content.

## Public, free, and Collector experience

### Signed-out public

A signed-out visitor can:

- use the current free Daily Drop and rolling free archive window;
- browse safe manifest-backed Released Pack teasers;
- view published actor and edition records that pass indexability checks;
- share canonical public URLs;
- encounter clear fallbacks instead of raw authentication or API errors.

Public teaser responses expose only approved editorial metadata and a bounded card sample. They never expose complete pack depth, private source inventory, premium asset URLs, admin fields, capability links, or Creator OS metadata.

### Authenticated free

An authenticated free account keeps the public creative loop and may sync My Collection after explicit device-merge consent. Explicit saves sync without silently merging unrelated device data, and retry/delete behavior must remain understandable and reversible.

Free-account persistence does not widen source access. The server must still verify that each saved or downloaded item was eligible for that account.

### Fandom Collector

Collector adds catalogue depth, generation utility, and finish:

- full eligible historical editions and Released Packs;
- Collector refreshes and saved runs;
- explicit per-image and whole-grid pack saves;
- premium Grid Builder treatments;
- eligible higher-resolution composite exports;
- future original Collector packs.

Collector does not grant Creator OS scheduling, publishing, or analytics.

## Public records, fallbacks, and URLs

Preferred canonical surfaces include:

```text
/vibe-atlas/archive
/vibe-atlas/archive/YYYY-MM-DD
/actor/:slug
```

Legacy `?date=YYYY-MM-DD` links should resolve to the same edition and canonicalize or redirect to the stable path.

Only records that satisfy current publication and indexability checks should be advertised as public records or emitted in the sitemap. When a saved public-record link is missing or non-indexable, the interface should fall back to the dated Archive view. When a Daily Drop has no qualifying Released Pack teaser, visitors should return to the free Daily Drop rather than receive a fabricated teaser.

Unknown, invalid, internal, and unpublished identifiers must fail closed and must not generate indexable thin pages.

## Response contracts

Maintain separate contracts for separate audiences:

1. **Public archive/edition projection** — approved metadata, canonical URL, standard preview, related public records.
2. **Public Released Pack directory** — published manifest-backed actor/vibe teaser metadata.
3. **Public Released Pack preview** — bounded read-only sample, currently up to three approved cards.
4. **Public actor/edition HTML** — useful initial HTML with the same public fields shown to people.
5. **Authenticated Collection sync** — account-owned explicit saves, merge consent, deletion, and retry semantics.
6. **Collector full-pack/run payload** — complete eligible protected data after capability verification.

Do not return one large payload and ask the browser to discard fields by tier.

## Entitlement and cache enforcement

The server computes access from the requested object, publication state, rolling free-window policy, authenticated capability, and explicit admin authorization.

- Public projections may use shared caching only when the response is identical for everyone.
- Authenticated Collection responses must be account-scoped.
- Collector payloads must use private/no-store semantics or a rigorously tested entitlement-aware cache key.
- A publicly cached response must never vary only by cookie unless the CDN cache behavior is proven safe.
- Downloads and sync must not re-upload unchanged artifacts or resurrect deleted items across devices.

Stripe remains the billing source of truth for paid capability. Cached account state may accelerate checks, but reconciliation must remain possible.

## Legal and product guardrails

Safer paid value includes Katie-created composites, original editorial framing, persistence, grid-building utility, premium treatments, eligible personal-use exports, and original packs whose rights are clear.

Do not sell unrestricted search results, raw source-image archives, or uncompressed third-party files merely because they are technically available. Preserve intentional Vibe Atlas / Vibe Guide branding and source attribution unless a specific rights-aware product decision changes the treatment.

## Current implementation state

Implemented or substantially implemented by 2026-09-25:

- manifest-backed public actor and edition records with fail-closed indexability;
- public Released Pack previews separated from Collector-only depth;
- a signed-out Released Pack directory using approved teaser projections;
- graceful fallbacks for missing/non-indexable records and Daily Drops without teasers;
- authenticated free My Collection sync after device-merge consent;
- explicit Collector per-image and whole-grid pack saves;
- Collector refresh depth, novelty protection, and private provenance telemetry.

Remaining work should be tracked as focused PRs:

1. Reconcile and test the rolling archive free-window policy end to end.
2. Complete crawlable actor/edition initial HTML, bilingual metadata, and sitemap coverage for every qualifying manifest.
3. Audit all anonymous actor-pack and historical endpoints for field leakage and cache separation.
4. Finish free Canvas interaction and truthful export-quality instrumentation.
5. Add Collector Atmospheres, saved-canvas policy, and eligible Master Export.
6. Complete billing reconciliation and conversion measurement.
7. Specify and implement the neutral Fandom -> Creator OS selected-artifact handoff.

## Analytics

Useful privacy-safe events include:

- `archive_page_view`
- `archive_edition_preview_view`
- `archive_paywall_view`
- `archive_upgrade_click`
- `released_pack_directory_view`
- `released_pack_teaser_opened`
- `collection_merge_consent`
- `collection_sync_completed`
- `collector_archive_opened`
- `checkout_started`
- `checkout_completed`
- `premium_export_attempted`

Properties may include public edition date, actor/vibe slug, account tier, CTA location, and bounded result state. Never send source URLs, email addresses, tokens, private queries, or internal diagnostics.

## Acceptance contract

The completed system must prove:

- signed-out visitors receive useful approved public discovery surfaces;
- authenticated free accounts can sync eligible explicit saves without gaining protected source access;
- Collector and bundle accounts receive complete eligible depth;
- Daily Drops, Released Pack teasers, public records, and Collector packs remain distinct objects;
- invalid, unpublished, or non-indexable records fail closed;
- public responses contain no premium, private, admin, or capability-bearing fields;
- member payloads never enter shared public caches;
- Creator OS-only accounts do not inherit Fandom Collector access;
- no tier receives unrestricted raw protected source archives;
- the first free creative loop remains complete and satisfying.
