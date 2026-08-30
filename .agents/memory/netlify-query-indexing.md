---
name: Netlify query indexing
description: How to keep private SPA query views out of search without deindexing their public base routes.
---

Use a query-aware response rule when an indexable SPA route also serves private views through query parameters. Do not apply a static path-wide `X-Robots-Tag` header to the shared base route.

**Why:** Netlify static custom headers match URL paths rather than query-string values. A blanket rule on the Vibe Atlas path would deindex the public daily edition along with its private studio views.

**How to apply:** Let a Netlify Edge Function inspect the original request URL, call the downstream response, and add `X-Robots-Tag: noindex, follow` only to private query or auth responses. Keep those URLs crawlable in robots.txt so crawlers can observe the header; omit them from the sitemap. Keep client metadata as defense in depth.