---
name: Shanghai archive test dates
description: Why date-bound archive tests must control the site's clock.
---

Archive visibility is evaluated using the site's Shanghai calendar date, not the runner's UTC date. Tests that place an edition on the day after a fixture's expected date must inject a fixed site date rather than relying on the system clock.

**Why:** A CI run during UTC afternoon crossed midnight in Shanghai and suddenly counted the fixture's formerly future edition as public, failing otherwise unrelated release checks.

**How to apply:** In tests asserting future editions are excluded or archive totals stay bounded, inject the date used by the fixture. Do not "fix" an expiry by moving the future edition farther away; that simply postpones the failure.