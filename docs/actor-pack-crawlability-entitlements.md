# Actor pack crawlability and entitlement model

Status: proposed companion to `archive-monetization-seo-plan.md`

## Decision

Actor pages should be crawlable product pages. Actor pack payloads should not be anonymously enumerable simply because the landing pages are public.

The durable distinction is:

```text
Public actor page = indexable identity, editorial context, samples, and conversion surface
Actor pack = entitled Fandom product data and utility
```

This is not crawler cloaking. Search crawlers and signed-out humans receive the same meaningful public preview. Membership changes the application data and actions available after authentication.

## Current implementation risk

The current `actor-packs.js` function returns the complete `ACTOR_PACKS` object as publicly cacheable JSON. That is convenient for the existing application, but it cannot be the final boundary if actor packs become a paid benefit.

Before enabling actor-pack gating, split the response model into public discovery data and entitled pack data. Do not rely on hiding buttons in React while leaving the complete JSON endpoint anonymous.

## Canonical public actor page

Preferred route:

```text
/actor/:slug
```

Each published actor page should provide useful initial HTML containing only approved public fields:

- canonical actor slug and URL;
- Chinese name, English name, and Pinyin or romanization where available;
- a short original editorial introduction;
- public vibe labels and glosses;
- a limited standard-resolution sample mosaic or approved hero preview;
- related public daily-drop previews;
- links to the archive and other relevant public editorial pages;
- clear Collector membership value;
- conservative `Person` and `CollectionPage` structured data when supported by the fields;
- crawlable title, description, Open Graph, and Twitter metadata.

The page must not expose:

- hidden pack configuration;
- complete search spells or retrieval strategies;
- raw image URLs that are intended to be protected;
- high-resolution asset URLs;
- private quality/scoring diagnostics;
- admin annotations;
- Creator OS packet, post, or publication metadata;
- auth, capability, or handoff tokens.

## Tier behavior

### Signed out / Fandom Free

Can:

- discover every published actor page through search, sitemap, internal links, and the actor directory;
- read the actor introduction and public vibe taxonomy;
- see a deliberately limited sample preview;
- browse related public daily-drop previews;
- use the current free daily drop and the rolling archive free window;
- share the canonical actor page.

Cannot:

- enumerate the complete actor pack payload;
- open every actor × vibe board on demand;
- save protected historical pack results;
- use premium themes or member exports;
- receive high-resolution or raw source assets.

### Fandom Collector

Can:

- open the complete eligible Fandom actor-pack experience;
- browse the full published actor × vibe catalogue;
- save eligible pack results and boards to the Fandom collection;
- use member archive access and Collector Grid Builder benefits;
- use premium Fandom themes and eligible exports;
- receive future original Collector packs.

Collector access does not grant Creator OS production, scheduling, publishing, or analytics features.

### Creator OS subscriber

Creator OS remains a standalone product. A Creator OS subscription by itself:

- supports assets imported from any source;
- does not automatically unlock the complete paid Fandom actor-pack catalogue unless that benefit is explicitly included in the commercial offer;
- may accept public Fandom exports or manual uploads under the same rules as any other source;
- must not depend on Fandom actor-pack internals.

This prevents Creator OS from becoming an accidental back door into Fandom membership.

### Ecosystem bundle

The bundle can include:

- Fandom Collector entitlement;
- Creator OS entitlement;
- the neutral Fandom → Creator OS handoff;
- bundle-specific convenience without inventing a third version of either product.

The bridge transfers a selected, permitted artifact. It does not expose the underlying actor-pack database or raw source inventory.

## Public and private response contracts

### Public actor directory DTO

A dedicated public response may contain:

```text
slug
actorNameZh
actorNameEn
romanization
shortEditorialDescription
publicVibeLabels
samplePreviewUrl
relatedPublicEditionUrls
canonicalUrl
updatedAt
```

Every field should be intentionally approved for publication.

### Public actor-page HTML

The initial response should contain the same public information visible to a signed-out person, with escaped metadata and a useful no-JavaScript body. This is the indexable surface.

### Entitled actor-pack DTO

A separate authenticated response may contain the additional published pack data required by the Fandom application. The server must verify `fandom_collector`, `ecosystem_bundle`, or an explicit admin entitlement before returning it.

Do not return a single large payload and ask the browser to discard fields according to tier.

## Caching

Public actor metadata and public sample previews can use shared CDN caching because the response is identical for everyone.

Entitled actor-pack responses must not be stored in a shared public cache. Use private/no-store semantics or a rigorously tested entitlement-aware cache key. The safest first implementation is private authenticated delivery.

Never vary a publicly cached response only by a cookie without proving that the CDN cache key and headers prevent member data from reaching signed-out visitors.

## Preview strategy

The public actor page should feel substantial rather than blurred into uselessness.

Recommended preview:

- one approved hero or sample mosaic;
- a small selection of public vibe labels;
- two or three related daily-drop cards;
- the number of available Collector pack combinations without exposing their payloads;
- a short explanation of what Collector unlocks.

Suggested CTA:

> Build with the complete actor pack
>
> Collector unlocks every published vibe for this actor, historical boards, saves, and the Legendary Grid Builder.

Do not market Creator OS on the actor landing page unless the visitor performs a publishing-intent action. The primary conversion here is Fandom Collector.

## SEO and sitemap policy

Include only published actor slugs in the sitemap.

Each page should:

- self-canonicalize to `/actor/:slug`;
- return a real not-found response for unknown or unpublished slugs;
- use bilingual metadata naturally rather than keyword stuffing;
- link to related actor pages and public editions;
- show the same public preview to crawlers and people;
- remain indexable even when the full actor pack is member-only.

Do not index:

- member APIs;
- account or checkout pages;
- signed handoff URLs;
- admin diagnostics;
- preview URLs containing secrets or capability parameters;
- arbitrary actor/vibe combinations that have no approved editorial page.

## Measurement

Useful privacy-safe events:

- `actor_page_view`
- `actor_sample_opened`
- `actor_pack_paywall_view`
- `actor_pack_upgrade_click`
- `collector_actor_pack_opened`
- `actor_pack_save`
- `actor_pack_export`
- `creator_os_handoff_intent`

Properties can include public actor slug, public vibe slug, entitlement category, and CTA location. Do not send raw source URLs, search queries, email addresses, tokens, or private diagnostics.

## Implementation sequence

### Actor PR A - Public actor directory and pages

- define approved public actor fields;
- add `/actor/:slug` initial HTML;
- add actor directory and sitemap entries;
- add metadata, JSON-LD, related editions, and sample previews;
- preserve the current application while the new surfaces are measured.

### Actor PR B - Split public metadata from actor-pack payloads

- replace anonymous full `ACTOR_PACKS` delivery with a public directory DTO;
- add an authenticated actor-pack endpoint;
- update the Fandom client to request the correct contract;
- add authorization, field-leakage, and cache-separation tests;
- retain admin access without exposing admin fields publicly.

### Actor PR C - Tier-aware product UX

- add Collector preview and upgrade states;
- keep public actor pages useful and indexable;
- unlock full published packs for Collector and bundle entitlements;
- verify Creator OS-only accounts do not accidentally inherit Fandom access;
- add conversion analytics and accessibility tests.

### Actor PR D - Optional Fandom to Creator OS handoff

- send only a selected, permitted Fandom artifact through the neutral handoff contract;
- require Creator OS or bundle entitlement for the destination workflow;
- never transfer the whole actor pack or hidden retrieval configuration;
- preserve manual Creator OS import as a complete alternative.

## Acceptance tests

The completed system should prove:

- search engines can index a meaningful page for every published actor;
- signed-out people can discover and evaluate the actor product;
- the anonymous API cannot enumerate the complete protected actor pack;
- Collector and bundle members can access the full eligible pack;
- Creator OS-only accounts do not gain Fandom Collector access by accident;
- member payloads never enter shared public caches;
- unknown/unpublished actors do not create indexable thin pages;
- public pages contain no high-resolution, private, admin, or capability-bearing fields;
- the handoff transfers one selected artifact, not the actor-pack database.
