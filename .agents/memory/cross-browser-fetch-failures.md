---
name: Cross-browser fetch failures
description: How to recognize browser-network failures consistently across Chromium, Firefox, and WebKit.
---

Treat a rejected browser `fetch` represented by `TypeError` as the network-failure category instead of matching a specific error message.

**Why:** Chromium, Firefox, and WebKit use different messages for equivalent dropped or reset requests, so checking only `"Failed to fetch"` can expose inconsistent, non-actionable errors.

**How to apply:** When a UI catch block also handles deliberate application errors, preserve those explicit `Error` messages and map network-level `TypeError` failures to the product's stable retry guidance.