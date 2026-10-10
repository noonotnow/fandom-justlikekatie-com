---
name: Keyboard checks after touch
description: Reset sequential keyboard navigation when a test alternates touch and keyboard.
---

When a browser test alternates touch and keyboard checks, start the keyboard
sequence by focusing a different, known preceding control, then press Tab.
Do not assume refocusing the already-focused region resets the tab sequence.

**Why:** WebKit can retain the sequential navigation position of the last tapped
descendant even though its containing region is the active element. A focus,
Shift+Tab, Tab sequence can then skip the region and falsely report an accessibility failure.

**How to apply:** Use a genuine preceding control as the starting point, wait
for the intended region to become active, and test native keyboard scrolling
without assigning scroll offsets as a substitute for the keyboard action.