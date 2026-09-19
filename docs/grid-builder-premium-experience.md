# Grid Builder premium experience

Status: proposed companion to the archive and actor-pack monetization plans

## Principle

Elevate the artifact, not the pitch.

The Grid Builder should feel complete and satisfying before a visitor pays. Fandom Collector should improve the source catalogue, persistence, visual treatment, and export capability rather than unlock a deliberately crippled canvas.

The standalone Fandom loop remains:

```text
Discover -> Collect -> Build -> Export -> Share
```

Creator OS remains a separate production and publishing product. The Grid Builder must not acquire partial scheduling, captioning, or publication-management functions merely to create an upsell.

## Product language

Prefer specific creative-work language over generic SaaS language.

Recommended public names:

- `Vibe Atlas Canvas` for the public grid-building surface;
- `Master Export` for a higher-resolution eligible composite;
- `Atmosphere` or `Palette` for whole-grid visual treatments;
- `Collector Archive` for historical source access;
- `Send to Creator OS` for the neutral handoff when the account has the relevant entitlement.

Avoid vague or inflated language such as `Pro Feature`, `VIP Tool`, or `4K Master Render` unless the output is actually rendered at the advertised dimensions and quality.

Keep the product namespaces distinct:

- Vibe Atlas Canvas = Fandom creation surface;
- Creator OS Workstation = production and publishing surface.

Do not rename a Fandom control `Creator Handoff` when it merely unlocks a Fandom feature. The handoff label is reserved for a real transfer into Creator OS.

## Tier model

### Fandom Free

Free visitors can experience the complete basic making loop:

- build and rearrange a standard 3x3 grid;
- use keyboard, pointer, and touch controls;
- export a web-ready standard-resolution composite;
- share the result;
- use current/free-window and otherwise publicly available inputs;
- keep local-only drafts or saves within an intentionally defined device limit.

Unlimited local experimentation is acceptable when it does not create unbounded server storage or processing cost. Cross-device persistence, historical source access, and expensive rendering can remain membership benefits.

### Fandom Collector

Collector can add Fandom-native depth and finish:

- complete eligible historical archive access;
- complete eligible actor-pack access;
- cross-device collection persistence;
- additional saved canvases and reusable layouts;
- premium Atmosphere/Palette treatments;
- additional layout treatments when they remain Fandom-native;
- eligible higher-resolution Katie-created composite exports;
- custom curator signature where safe and appropriate;
- future original Collector packs.

Collector does not receive Creator OS scheduling, platform renditions, publication states, or analytics.

### Creator OS

Creator OS works independently with assets from any source. It owns:

- project development;
- platform-specific renditions and copy;
- production workflows;
- planning and scheduling;
- publishing and reconciliation;
- performance analysis.

A Creator OS subscription alone does not imply access to the protected Fandom archive or actor-pack catalogue unless the commercial offer explicitly includes the Fandom entitlement.

### Ecosystem bundle

The bundle includes Fandom Collector, Creator OS, and the neutral selected-artifact handoff.

The handoff transfers the selected permitted artifact and approved metadata. It does not export the entire actor-pack database, raw engine inventory, hidden retrieval configuration, or unrestricted third-party source files.

## Export branding

The free export should use the intentional Vibe Atlas / Vibe Guide editorial footer as a design element, not an apologetic watermark.

Example structure:

```text
[3x3 composition]
---------------------------------------------
VIBE ATLAS · DROP 116 · 刘学义
fandom.justlikekatie.com · source attribution
```

The footer may use a gallery-caption or magazine-credit treatment. It should remain legible, compact, and visually integrated.

Collector options can include:

- a custom curator signature;
- alternate approved footer treatments;
- additional typography and palette options;
- a minimal branded treatment.

Do not promise a completely attribution-free export where source licensing, provenance, or the intentional brand standard requires attribution. Paid access changes presentation and utility; it does not erase source obligations.

## Canvas instrumentation

Technical labels must report truth rather than perform premium theatre.

Good examples when accurate:

```text
ASPECT  1:1
OUTPUT  1080 x 1080 PX
COLOR   sRGB
```

Only display `4000 x 4000`, `Display P3`, `print-ready`, or `4K` when the renderer, embedded color profile, source material, and download artifact actually satisfy those claims.

`sRGB Display P3` is not a valid combined color-space label. Choose and accurately encode one supported output profile.

## Interaction quality

Premium feel should come from precision:

- clear snap targets;
- subtle placement feedback;
- stable drag previews;
- predictable crop and reorder behavior;
- undo/redo where feasible;
- consistent export previews;
- responsive touch behavior;
- keyboard-operable alternatives;
- visible focus states;
- `prefers-reduced-motion` support.

A small scale or spring transition can reinforce placement, but it must not cause layout shift, obscure target state, or become the only feedback. Browser vibration support is inconsistent, particularly on iOS, so haptics must remain optional enhancement rather than required interaction feedback.

## Premium boundaries

Place boundaries at genuine increases in cost, catalogue depth, persistence, or finish:

- historical archive access;
- complete actor-pack access;
- cross-device persistence;
- premium Atmosphere treatments;
- additional saved canvases;
- higher-resolution eligible composite rendering;
- bundle-only Creator OS handoff.

Do not block the first completed grid. A visitor should understand the value because they successfully made an artifact, not because a modal interrupted the ninth placement.

## Rights and source handling

Do not market unrestricted high-resolution third-party source downloads as a normal membership benefit.

Safer export value includes:

- Katie-created composites;
- original templates and treatments;
- permitted personal-use renditions;
- preserved source attribution;
- collection and layout utility;
- selected-artifact handoff where the receiving workflow respects the same provenance and rights constraints.

## Conversion moments

Use contextual, quiet prompts after meaningful intent:

- after a free grid is completed;
- when a visitor selects an archived or Collector-only source;
- when a visitor previews an Atmosphere treatment;
- when cross-device saving is requested;
- when a higher-resolution eligible export is requested;
- when a user explicitly wants to turn the artifact into a publishing project.

Suggested copy:

```text
Finish this edition in Collector
Use the complete archive, premium Atmospheres, and Master Export.
```

For genuine publishing intent:

```text
Continue in Creator OS
Carry this selected grid into a production project for platform versions, planning, and publishing.
```

Do not place Creator OS advertising on every canvas interaction.

## Social proof

Promote finished artifacts rather than generic tool claims.

Public examples should show:

- the completed grid;
- actor and vibe identity;
- the Vibe Atlas editorial footer;
- a canonical link to the relevant public actor, edition, or Canvas page;
- a restrained invitation to build a layout.

For Rednote, final published copy should follow the Chinese-only house preference. English can remain internal drafting or translation scaffolding.

## Analytics

Useful privacy-safe events:

- `canvas_opened`
- `canvas_first_item_placed`
- `canvas_completed`
- `canvas_export_previewed`
- `canvas_export_completed`
- `collector_atmosphere_previewed`
- `collector_boundary_viewed`
- `collector_upgrade_started`
- `creator_os_handoff_intent`
- `creator_os_handoff_completed`

Properties may include public edition date, public actor slug, layout type, export class, entitlement category, and CTA location. Do not transmit source-image URLs, auth tokens, private search queries, or Creator OS project content.

## Implementation sequence

### Canvas PR A - Free canvas quality

- preserve the complete basic 3x3 building loop;
- improve snapping, placement feedback, keyboard behavior, focus, and reduced motion;
- make export dimensions and color-space labels truthful;
- retain the editorial footer;
- measure canvas completion and export success.

### Canvas PR B - Collector treatments

- add the entitlement-aware Atmosphere/Palette catalogue;
- add cross-device persistence and saved-canvas limits according to the product contract;
- add higher-resolution eligible composite rendering;
- add custom-signature and alternate approved footer treatments;
- add conversion analytics without interrupting basic creation.

### Canvas PR C - Creator OS bridge

- add `Send to Creator OS` only after the neutral handoff contract exists;
- require Creator OS or bundle entitlement at the destination boundary;
- transfer one selected, permitted artifact and approved metadata;
- keep manual Creator OS import fully functional;
- never transfer the complete actor-pack or engine-results inventory.

## Acceptance tests

The finished implementation should prove:

- a signed-out visitor can complete and export a basic grid;
- the free export looks intentionally branded rather than punished;
- advertised dimensions and color profile match the generated file;
- keyboard and reduced-motion users can complete the workflow;
- Collector adds catalogue depth, persistence, finish, and eligible export quality;
- Creator OS functionality remains outside Fandom;
- Creator OS-only accounts do not accidentally inherit Collector source access;
- bundle users can hand off only a selected permitted artifact;
- no tier exposes raw protected actor-pack or engine-result payloads.
