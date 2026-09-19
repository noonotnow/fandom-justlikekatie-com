# Vibe Atlas archive monetization and SEO plan

Status: proposed implementation sequence

## Decision

Vibe Atlas should monetize the historical archive without making past editions disappear.

The archive is both:

- a public discovery surface that earns search and social traffic; and
- a high-intent product surface where collectors demonstrate willingness to pay.

The product therefore uses a **visible archive / gated utility** model:

- every published edition remains represented by an indexable public preview;
- today's edition and the previous three published editions remain fully available to free visitors;
- older editions remain visible with date, actor, vibe, editorial metadata, and a standard preview;
- opening the complete nine-card board, saving its cards, or exporting premium assets from an older edition requires the Fandom Collector entitlement;
- paid access must not include raw or uncompressed third-party source files unless the rights are explicitly cleared.

This avoids a dead-end paywall and turns the archive itself into the product catalogue.

## Product boundaries

Fandom and Creator OS are independent products. Neither is a crippled onboarding funnel for the other.

### Fandom

Standalone loop:

```text
Discover -> Collect -> Build -> Export -> Share
```

Fandom owns:

- daily drops;
- actor and vibe discovery;
- the visible historical archive;
- Saved Collection;
- Legendary Grid Builder;
- Fandom-native themes and exports;
- collector membership.

### Creator OS

Standalone loop:

```text
Capture -> Develop -> Compose -> Plan -> Publish -> Analyze
```

Creator OS must work with assets imported from anywhere. It owns:

- project and idea development;
- platform-specific renditions and copy;
- production status;
- scheduling and publishing;
- publication lineage;
- performance analysis.

### Bridge and bundle

The integration is a narrow handoff, not shared product creep:

```text
Finished Fandom artifact -> neutral export package -> Creator OS project
```

The bridge can upsell Creator OS when a user demonstrates publishing intent. Fandom must not acquire partial posting, scheduling, or analytics features merely to create the upsell. Creator OS must not depend on Fandom discovery or collections.

Candidate entitlements:

- `fandom_free`
- `fandom_collector`
- `creator_os`
- `fandom_creator_bridge`
- `ecosystem_bundle`

The bridge should be included with Creator OS and the ecosystem bundle. A Fandom Collector subscription remains useful without it.

## Archive experience

### Free visitor

A free visitor can:

- browse the complete archive index;
- see the date, actor, Chinese and English vibe labels, issue number, and preview mosaic for every edition;
- open today's drop and the previous three published editions;
- share canonical public edition URLs;
- see clear Collector messaging on older editions.

Older editions should display an attractive locked state rather than disappearing. Suggested language:

> Collector archive preview
>
> This edition is preserved in the complete Vibe Atlas archive. Join Collector to open the full nine-card board, save its cards, and use it in the Grid Builder.

### Fandom Collector

A Collector can:

- open all historical nine-card boards;
- save historical cards and grids;
- use premium Legendary Grid Builder themes;
- receive cross-device collection sync;
- export eligible Katie-created composites at higher quality;
- access future original Collector packs.

### Search and social crawler

A crawler should receive meaningful initial HTML for each public edition URL, including:

- a stable path-based canonical URL;
- bilingual title and description;
- date, actor, vibe, and edition metadata;
- a standard preview image when available;
- conservative JSON-LD;
- a visible membership CTA without a thin or empty page.

The crawler page is a product preview, not an entitlement bypass. Protected full-board data and member-only actions must still be enforced server-side.

## URL model

Preferred canonical paths:

```text
/vibe-atlas/archive
/vibe-atlas/archive/YYYY-MM-DD
/actor/:slug                 # later actor landing-page PR
```

Legacy links remain supported:

```text
/vibe-atlas?date=YYYY-MM-DD
```

A valid legacy date link should resolve to the same edition and canonicalize or redirect to the stable path. Invalid dates must not generate indexable duplicate or error pages.

## Entitlement enforcement

Client-side locked cards are presentation, not security.

Real archive enforcement must occur where historical board data and premium assets are returned. The server should compute an archive-access decision from:

- requested published edition date;
- the rolling free-window policy;
- authenticated Fandom entitlement;
- admin/operator authorization where applicable.

Unauthenticated archive-preview responses may include only explicitly public fields. They must not include hidden high-resolution URLs, raw source payloads, capability links, session state, or private Creator OS metadata.

Stripe remains the billing source of truth. A cached account record may accelerate checks, but reconciliation must be possible from Stripe state.

## Legal and product guardrails

Do not sell access to uncompressed search results or third-party source-image bundles merely because the files are technically available.

Safer paid value includes:

- Katie-created composite layouts;
- original editorial framing and metadata;
- collection persistence;
- grid-building tools;
- premium themes;
- eligible personal-use exports;
- original template or wallpaper packs whose rights are clear.

The standard Fandom / Vibe Guide branding and source attribution should remain unless a specific product decision says otherwise.

## Analytics

Use privacy-safe events that describe product behavior rather than source assets:

- `archive_page_view`
- `archive_edition_preview_view`
- `archive_paywall_view`
- `archive_upgrade_click`
- `checkout_started`
- `checkout_completed`
- `collector_archive_opened`
- `premium_export_attempted`
- `collection_limit_reached`

Useful properties include edition date, free/member state, CTA location, and entitlement name. Do not send image URLs, email addresses, auth tokens, or raw query payloads.

## Small PR sequence

### PR 1 - Product contract and teaser state

Purpose: make the planned product legible before enforcing payment.

Scope:

- add this product contract;
- centralize and test the rolling free-window policy;
- keep all archive cards visible;
- give older cards a Collector preview treatment for nonmembers;
- route upgrade actions to the existing Membership view;
- add paywall-impression and upgrade-click analytics;
- explicitly document that this is not yet a security boundary.

Acceptance criteria:

- today plus the previous three published editions are free;
- older editions remain visible and informative;
- members retain normal archive navigation;
- keyboard and screen-reader behavior remains usable;
- no Creator OS posting features are added to Fandom;
- tests cover dates, members, nonmembers, locked visibility, and analytics.

### PR 2 - Crawlable edition pages and sitemap

Purpose: let the visible archive earn search and social traffic before hard gating.

Scope:

- add stable path-based edition URLs;
- preserve legacy `?date=` links;
- serve route-specific metadata in initial HTML;
- add bilingual titles/descriptions and preview images;
- add conservative JSON-LD;
- add edition URLs to the sitemap;
- keep auth, admin, membership, and capability URLs out of the index;
- document Search Console, Bing, and Baidu submission steps.

Acceptance criteria:

- social crawlers receive edition-specific OG metadata without React hydration;
- old editions have meaningful preview HTML rather than empty shells;
- metadata is escaped and tested;
- invalid dates do not create indexable junk;
- member-only payload fields never appear in public HTML.

### PR 3 - Server-side archive entitlement enforcement

Purpose: convert the teaser into a real paywall.

Scope:

- enforce the rolling free window in the historical edition data layer;
- return a public preview DTO for locked editions;
- return full eligible board data only for free-window, member, or admin access;
- prevent shared-cache leakage between public and entitled responses;
- add integration and authorization tests;
- preserve public metadata and canonical pages.

Acceptance criteria:

- changing client state cannot unlock historical payloads;
- locked responses contain no premium asset URLs or raw source payloads;
- entitled users can open the full archive;
- CDN headers cannot cache a member response for a public visitor;
- crawler previews remain useful.

### PR 4 - Billing resilience and conversion measurement

Purpose: make the existing membership path operationally trustworthy.

Scope:

- audit checkout, portal, webhook, and membership-status behavior;
- enable promotion codes if compatible with the current checkout model;
- make webhook processing idempotent with durable event records;
- reconcile created, updated, cancelled, trial, and failed-payment subscription states;
- preserve Stripe as billing source of truth;
- forward privacy-safe UTM attribution;
- add checkout-started/completed events and funnel reporting notes.

Acceptance criteria:

- duplicate webhook delivery does not duplicate mutations;
- cancellation and payment-state changes update entitlement correctly;
- account entitlement can be reconciled from Stripe;
- referral metadata is bounded and sanitized;
- no secrets or customer identifiers enter analytics.

### PR 5 - Fandom to Creator OS handoff contract

Purpose: support the stack without contaminating either standalone product.

Scope:

- specify a versioned neutral Fandom Export Package;
- include only selected/exported media references, permitted metadata, theme/layout, attribution, artifact ID, and timestamp;
- let Creator OS import the package into its own native project model;
- expose the upsell only at genuine publishing-intent moments;
- keep manual import into Creator OS fully supported.

This PR should be developed jointly with the Creator OS repository and should not precede the archive/SEO work.

## Release strategy

1. Merge the product contract and teaser treatment.
2. Ship crawlable edition pages and submit the sitemap.
3. Observe archive preview views and upgrade intent before enabling hard enforcement.
4. Merge server-side enforcement behind a controlled configuration flag.
5. Verify public previews, member access, cache separation, and checkout recovery.
6. Enable the archive paywall.
7. Evaluate Creator OS bridge demand separately from Fandom Collector conversion.

## Explicit non-goals

This series does not:

- turn Fandom into a posting dashboard;
- require Creator OS to use Fandom;
- hide old editions from search;
- sell raw third-party image archives;
- use a client-side lock as the final authorization boundary;
- create multiple overlapping membership implementations;
- remove the intentional Fandom branding and attribution footer.
