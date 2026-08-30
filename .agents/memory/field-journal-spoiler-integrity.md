---
name: Field Journal spoiler integrity
description: Product rules that preserve the uncontaminated first-watch experiment across capture, evidence, and future publishing.
---

Filed entries advance contiguously from Episode 1; gaps, overlaps, and backfilled receipts are invalid. That contiguous boundary is the authority for what can be resolved or revealed. Original predictions and their first final verdict are receipts, not editable prose. Evidence tied to a prediction must remain sealed while that prediction's resolution is still above the reader's safe-through episode. Missing or malformed boundaries always reveal nothing. An episode-bounded share route is also a hard maximum: a higher device-level saved preference must never override the boundary advertised by the URL.

**Why:** The changing state of knowledge is the Field Journal's core asset. A single future-resolution leak or rewritten receipt would contaminate both the first-watch experiment and reader trust.

**How to apply:** Enforce these rules server-side in every future public page, share artifact, veteran-submission flow, export, or alternate client. Client-side hiding is supplementary, never the spoiler boundary. When a route names an episode range, cap both automatic restoration and manual changes at that route's endpoint; navigating to a later range must be explicit.

The campaign has two lanes: ordinary Vibe Atlas and Nian Wushuang posts may continue while the journal is unfinished, but production readiness gates the bridge, profile conversion, announcement, and any links into the first-watch experiment.

**Why:** Normalization posts establish voice and account activity without promising an unfinished destination; holding them would waste the runway, while premature launch traffic would create a broken conversion path.

**How to apply:** Keep the normal posting lane moving. Quietly build and test the journal, then deploy and verify production before publishing the bridge post, switching the profile CTA, or announcing the experiment; begin Episode 1 immediately after announcement.

Public delayed-contribution flows must use opaque, operator-scoped journal identities and keep unmoderated text in a separate archive. Source-IP and anonymous-owner abuse limits are independent. Approval becomes durable before evidence publication, and publication retries reconcile idempotently.

**Why:** Shared target keys can route spoilers to the wrong operator, cookie resets can evade combined rate keys, and a cross-store partial failure can otherwise strand or prematurely expose commentary.

**How to apply:** Namespace public targets and queues by the operator's opaque journal identity; reveal pending text to moderators only after the contiguous boundary; publish approved evidence by a stable source ID with fail-closed retry behavior.