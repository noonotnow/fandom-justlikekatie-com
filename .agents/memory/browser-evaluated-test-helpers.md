---
name: Browser-evaluated test helpers
description: Avoid tsx helper transforms that escape into Playwright page.evaluate.
---

Avoid nested named helper functions or assigned arrow helpers inside a Playwright `page.evaluate` callback when running TypeScript tests through tsx. Inline the browser-side operations or use callbacks that do not require helper name decoration.

**Why:** tsx can emit a `__name` call for a nested helper in the serialized callback, but that runtime helper is not defined in the browser. The test fails even though the application action succeeded.

**How to apply:** If a browser evaluation reports `ReferenceError: __name is not defined`, inspect the callback for nested helpers before changing application code.