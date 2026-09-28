---
name: Netlify Function response contract
description: Why a Web Response from a classic Netlify Function becomes an edge 502.
---

**Rule:** Netlify functions that receive a Web Request and return a Web Response must use the V2 default export. A classic named `handler` must return the classic `{ statusCode, body }` shape instead.

**Why:** A public preview endpoint exported a Web Response from a named handler; local direct-call unit tests passed, but the live edge returned 502 with “invalid status code returned from lambda: 0.” The entrypoint export shape, not the handler's internal data, caused the mismatch.

**How to apply:** When adding a function, test the deployed entrypoint contract as well as the underlying handler and verify the live function route after release. If a live route produces that 502 while direct-call tests pass, inspect export style before changing catalog logic.