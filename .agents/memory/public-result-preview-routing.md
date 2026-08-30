---
name: Public result preview routing
description: Privacy and indexing rules for outcome-specific social previews on a shared canonical page.
---

Outcome-specific social previews must use exact allowlisted public result IDs. Keep the main editorial/game URL as the HTML canonical, give each outcome a stable result-specific `og:url` without campaign tags, mark generated preview documents `noindex`, and let unknown or malformed values fall through to the master preview. Never reflect an arbitrary query value into metadata.

**Why:** Share cards need server-visible metadata for social crawlers, but a dynamic catch-all could expose untrusted input, create duplicate indexable result pages, or weaken the privacy promise that links contain only a fixed public outcome.

**How to apply:** For future public games with bounded outcomes, prefer exact internal rewrites to generated static metadata and image variants. Preserve the original browser URL and HTML canonical, use the allowlisted share URL as the Open Graph object ID, and keep user/account data out of both routes and assets.