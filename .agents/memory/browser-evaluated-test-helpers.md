---
name: Browser-evaluated test helpers
description: Avoid tsx helper transforms that escape into Playwright page.evaluate.
---

Avoid nested named helper functions or assigned arrow helpers inside a Playwright `page.evaluate` or `page.addInitScript` callback when running TypeScript tests through tsx. Inline the browser-side operations or use callbacks that do not require helper name decoration.

**Why:** tsx can emit a `__name` call for a nested helper in the serialized callback, but that runtime helper is not defined in the browser. The test fails even though the application action succeeded.

**How to apply:** If a browser evaluation reports `ReferenceError: __name is not defined`, inspect the callback for nested helpers before changing application code.

For initialization mocks with nested functions (such as clipboard methods), use
a plain JavaScript string for `addInitScript` so tsx cannot inject its runtime
helper. A broken initialization mock can otherwise look like a clipboard failure
or a later UI timeout rather than an application defect.

In no-JavaScript browser contexts, the injected `toContainText` matcher can
report empty text for `noscript` even when its paragraph is visibly rendered.
Check the child paragraph's visibility and native `textContent()` together.

**Why:** The injected browser matcher can treat `noscript` as inactive despite
the document's scripting-disabled parse. A native text read and child visibility
distinguish that test artifact from a missing fallback.