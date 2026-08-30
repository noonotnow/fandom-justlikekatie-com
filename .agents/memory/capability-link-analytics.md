---
name: Capability-link analytics
description: Privacy boundary for analytics on public routes whose links carry access capabilities.
---

Public capability values must be removed from the browser URL before any
analytics bootstrap runs. Pageviews and custom events for that surface must
use one canonical location with no capability-bearing query or fragment.

**Why:** Coarse custom-event properties are not privacy-safe if the analytics
platform can still associate them with an identifier inherited from the page
URL. A public submission-link capability can identify its target even when it
contains no conventional PII.

**How to apply:** For any future capability-bearing public route, preserve the
value only in non-URL application state, sanitize the visible URL before
loading trackers, and add a browser-level test that inspects both pageview
configuration and event context for leaks.