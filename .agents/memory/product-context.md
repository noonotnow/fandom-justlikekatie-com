---
name: Fandom Vibe Atlas product context
description: What this product actually is vs. what the design docs describe; single-user goals and repo boundaries.
---

# Fandom Vibe Atlas product context

- **Real product:** solo-operated Netlify app (React/Vite + Netlify Functions + Blobs) making curated 3×3 CDRAMA-actor image grids via "vibe spells" for Rednote sharing. Single owner/operator.
- **Rule:** the uploaded "Vibe Atlas Unified System Design" docs (v1.0/v1.5, sprint breakdown) describe an aspirational multi-user platform (Postgres/Redis/Elasticsearch, Connect Hub, promo detection). Do NOT build to that spec. **Why:** owner confirmed the docs lag the real product and the goal is low-activation-energy single-user workflow. **How to apply:** judge all work by "minutes from opening app to a Rednote-ready share card," not platform metrics.
- **Repo boundary:** CREATE remains the broader post-production studio, but Fandom owns the complete Middle-earth flow: MemeForge visual-object copy, the grounded Rednote Spellbook package, exact-copy approval, and canonical CREATE handoff.
- **Middle-earth creative grammar:** Character = emotional anchor; Meme Flavor = social/joke archetype; Aesthetic = treatment; Artifact Type = intended object. **Why:** this keeps recognizable fandom language without copying raw templates. **How to apply:** all four inputs must ground AI, staleness, persistence, rendering, and handoff; the selected source remains the factual/provenance anchor.
- **Middle-earth source policy:** use Google-compatible image search first, then non-Baidu fallbacks; do not inherit C-drama's Baidu-first CJK behavior. **Why:** Western fandom references need different indexing, and source material should support the joke rather than determine it. **How to apply:** keep this routing specific to MemeForge unless a user explicitly asks for Chinese-source discovery.
- **Known telemetry gap (as of Aug 2026):** single-card exports log to the `engagement` Blob store; main 3×3 grid exports log nothing; `batch-metrics.js` has no callers. `editorialDetection.ts` quality/diversity scoring exists but is unwired.
- Owner is technically fluent, enjoys product-strategy discussion, and prefers analysis grounded in the actual code over doc doctrine.

## CREATE repo findings (verified Aug 2026, repo noonotnow/create-justlikekatie-com)
- Copy Studio exists and is strong: OpenAI (gpt-4.1-mini), 3 angles / 20 Rednote titles / 3 captions / comment prompts / tag variants / template-risk score / AI art-directed visual theme (compositions incl. grid-3x3), explicit anti-template prompt rules.
- "Too templatey" root cause is the data contract, not the generator: live Fandom→CREATE handoff (fandom.collection-read.v1 → packetBrief) drops searchSpell, vibeSubtitle/captionSeeds, ctaSeed, edition tier, grouping rationale, export history. captionSeeds only reach CREATE via the one-time migration (folded into packet context text).
- Smallest fix: enrich the collection-read grid DTO + packet snapshot fields; no generator changes needed.

- Grid Builder V1 (lens → proposed 3×3 → swap → rationale-as-brief) landed emotionally with the user ("took my breath away", Aug 2026) — the studio-not-picker framing is confirmed; keep future features rationale-forward.

## Product boundaries (decided Aug 2026, user + committee memos)
- **CREATE is an optional bridge, never the mandatory sharing path.** Collections/Vibe Atlas must support the full lightweight loop (save → build grid → export/download/share) for any logged-in user. "Send to CREATE" is an advanced exit for users with access.
- **Admin tab is not a product dependency.** If a capability is broadly useful to any logged-in user's collection, it belongs on the collection surface; admin keeps only debug/override/pipeline controls. Grid Builder should graduate out of admin.
- **Save ≠ Export.** Grid lifecycle: proposed (draft) → saved (durable collection object) → export event (rendered artifact log). Export must not be the save mechanism; exporting an unsaved grid may *offer* saving. The three exits from any grid: Save / Export-Share / Send to CREATE — decoupled verbs, distinct telemetry signals.
- **Core principle:** "A saved collection should never be passive — it should constantly recompose into post-ready artifacts." The studio framing is the product, confirmed by the first real builder grid.

**Constitution ratified (Aug 2026):** Law #2 has one sanctioned exception — Daily Star-of-Day export auto-saves to collection history because Daily is an inflow ritual with no separate save step; the rule is "export may create history only if the UI says so visibly." Final grammar: Daily = inflow (visible auto-save ok) · Collections = studio (save/export split) · CREATE = optional publishing · Admin = packet staging, never the fake collection.
