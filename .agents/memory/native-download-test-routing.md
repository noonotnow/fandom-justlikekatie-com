---
name: Native download test routing
description: How to make attachment-download fixtures observable and consistent across Playwright browser engines.
---

Serve native attachment-download fixtures through Vite test-server middleware when a cross-browser test must verify the filename or bytes. Do not depend on page or browser-context routing to intercept the download navigation.

**Why:** Firefox exposes attachment requests through Playwright routing, but Chromium and WebKit can emit a download while bypassing route callbacks and page request events. Waiting for those callbacks makes an otherwise successful download test time out.

**How to apply:** Keep ordinary API mocks in Playwright routes. For an anchor or navigation that returns `Content-Disposition: attachment`, add narrowly scoped test-server middleware that records the request URL and returns the fixture headers and payload over real HTTP.