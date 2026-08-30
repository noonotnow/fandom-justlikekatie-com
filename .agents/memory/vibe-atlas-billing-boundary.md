---
name: Vibe Atlas billing boundary
description: Product and architecture boundary for the first paid Vibe Atlas membership.
---

The first paid offer is one monthly Vibe Atlas Founding Member subscription. Verified Stripe subscription state is the only source of paid entitlement. It gates account-backed Vibe Atlas Collection sync, Grid Builder access, and premium exports. Daily browsing, sharing, and local saves remain free.

PostgreSQL is limited to Stripe-synchronized billing records and the minimal account-to-customer link. Existing authentication, IndexedDB, Blob Collections, packets, content storage, and MemeForge behavior stay on their current systems. MemeForge remains free and shareable.

**Why:** The broader CREATE multi-tenant blueprint carried substantial authorization, transaction, publishing, and deployment risk. A narrow paid experiment can validate demand without destabilizing the existing product.

**How to apply:** Extend billing only when it directly supports this membership experiment. Derive access server-side from synchronized Stripe state, use hosted Checkout and Customer Portal, and do not migrate unrelated product data into PostgreSQL.