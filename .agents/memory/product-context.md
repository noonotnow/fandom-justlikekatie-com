---
name: Fandom Vibe Atlas product context
description: What this product actually is vs. what the design docs describe; single-user goals and repo boundaries.
---

# Fandom Vibe Atlas product context

- **Real product:** solo-operated Netlify app (React/Vite + Netlify Functions + Blobs) making curated 3×3 CDRAMA-actor image grids via "vibe spells" for Rednote sharing. Sole user is the owner ("Katie"), preparing for clinical rotations.
- **Rule:** the uploaded "Vibe Atlas Unified System Design" docs (v1.0/v1.5, sprint breakdown) describe an aspirational multi-user platform (Postgres/Redis/Elasticsearch, Connect Hub, promo detection). Do NOT build to that spec. **Why:** owner confirmed the docs lag the real product and the goal is low-activation-energy single-user workflow. **How to apply:** judge all work by "minutes from opening app to a Rednote-ready share card," not platform metrics.
- **Repo boundary:** Idea Packets + single-card aesthetic curation moved to the separate `create-justlikekatie-com` repo. This repo (fandom) keeps the collection workbench (FandomAdmin), daily Star of the Day pipeline, and canonical CREATE handoff. AI caption variation / aesthetic families is NOT implemented in this repo — likely lives (or should live) in CREATE.
- **Known telemetry gap (as of Aug 2026):** single-card exports log to the `engagement` Blob store; main 3×3 grid exports log nothing; `batch-metrics.js` has no callers. `editorialDetection.ts` quality/diversity scoring exists but is unwired.
- Owner is technically fluent, enjoys product-strategy discussion, uses a Notion agent as a second advisor, and prefers analysis grounded in the actual code over doc doctrine.

## CREATE repo findings (verified Aug 2026, repo noonotnow/create-justlikekatie-com)
- Copy Studio exists and is strong: OpenAI (gpt-4.1-mini), 3 angles / 20 Rednote titles / 3 captions / comment prompts / tag variants / template-risk score / AI art-directed visual theme (compositions incl. grid-3x3), explicit anti-template prompt rules.
- "Too templatey" root cause is the data contract, not the generator: live Fandom→CREATE handoff (fandom.collection-read.v1 → packetBrief) drops searchSpell, vibeSubtitle/captionSeeds, ctaSeed, edition tier, grouping rationale, export history. captionSeeds only reach CREATE via the one-time migration (folded into packet context text).
- Smallest fix: enrich the collection-read grid DTO + packet snapshot fields; no generator changes needed.
