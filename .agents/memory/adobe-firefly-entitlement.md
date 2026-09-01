---
name: Adobe Firefly entitlement
description: Adobe may expose a connector while Firefly Services remains disabled for the selected project or license.
---

Treat Adobe connector discovery and Firefly API entitlement as separate checks. The Adobe Developer Console can list Firefly Services but mark the available API as disabled; application code cannot bypass that product entitlement.

**Why:** The account used for this app could open Adobe Developer Console, but its Firefly Services API entry was disabled, so OAuth setup could not provide a usable enhancement service.

**How to apply:** Before implementing or retrying Firefly enhancement, confirm the Adobe project has the required Firefly Services entitlement and that the correct license is selected for this app.