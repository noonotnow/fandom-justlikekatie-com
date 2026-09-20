---
name: Vibe Atlas billing boundary
description: Product and architecture boundary for the first paid Vibe Atlas membership.
---

The first paid offer is one monthly Vibe Atlas Collector subscription. Verified Stripe subscription state is the source of paid entitlement. Free users can browse current and historical editorial records, complete, rearrange, export, and share a standard 3×3 grid with current/free inputs, and save locally. Collector gates the complete historical collectible/source depth and actor-pack utility behind those public records, plus cross-device persistence, additional saved canvases, approved premium treatments, and eligible Master Exports.

PostgreSQL is limited to Stripe-synchronized billing records and the minimal account-to-customer link. Existing authentication, IndexedDB, Blob Collections, packets, content storage, and MemeForge behavior stay on their current systems. MemeForge remains free and shareable.

**Why:** The broader CREATE multi-tenant blueprint carried substantial authorization, transaction, publishing, and deployment risk. A narrow paid experiment can validate demand without destabilizing the existing product.

**How to apply:** Extend billing only when it directly supports this membership experiment. Derive capability-specific access server-side from synchronized Stripe state, use hosted Checkout and Customer Portal, and do not migrate unrelated product data into PostgreSQL. Keep Creator OS handoff exclusive to Creator OS or an ecosystem bundle.