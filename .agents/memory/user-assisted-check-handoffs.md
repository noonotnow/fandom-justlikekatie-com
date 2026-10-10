---
name: User-assisted browser check handoffs
description: Explicit stopping points and browser continuity for creator-assisted live checks.
---

Give clear stopping points for user-assisted live checks and explicitly state
whether the tab, window, and browser profile must remain open for the next step.
Do not assume a window remains open after telling the creator to stop.

**Why:** The creator correctly followed an instruction to stop before submitting
a diagnostic report and closed the window; the next instruction incorrectly
assumed the restored draft was still on screen.

**How to apply:** State continuity requirements before the pause. If the creator
closes the window, preserve credit for completed checks and resume from the
earliest necessary step rather than requesting the whole sequence again.

Separate incognito windows are not reliable independent account profiles; they
can share cookies and account-switch notifications.

**Why:** During a live account-isolation check, signing in as the second test
account replaced the first account across the creator's incognito windows.
The creator subsequently confirmed the sequential account-switch check worked.

**How to apply:** Use genuinely separate browser profiles or different browsers
for simultaneous sessions. When that is inconvenient, test account isolation
sequentially in one profile instead of asking the creator to create more
incognito windows.