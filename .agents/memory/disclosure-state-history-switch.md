---
name: Disclosure state in history-switch tests
description: How to test collapsed disclosure summaries when a React view switches between historical records.
---

When a browser test switches the record rendered inside an existing disclosure, do not assume the `details` element returns to its collapsed default. Explicitly close it before changing records when the behavior under test is the closed summary.

**Why:** React may reuse the same DOM node across current, retained, and legacy record changes, preserving its open state and making a closed-summary assertion measure inherited test state instead of the intended layout.

**How to apply:** In history-switch browser scenarios, control the disclosure state immediately before switching records, then assert the next record's summary while it is still collapsed.