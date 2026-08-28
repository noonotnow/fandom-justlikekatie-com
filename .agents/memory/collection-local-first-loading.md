---
name: Collection local-first loading
description: Why browser collection records must render before remote account synchronization.
---

Collection views must treat records already stored on the browser as immediately displayable and attempt account synchronization afterward. A network, session, or sync failure must surface as a warning without replacing the visible collection with an empty state.

**Why:** A sync-before-load sequence made existing saved grids and results appear deleted when synchronization failed. The user confirmed on August 28, 2026 that local-first loading restored the saved items in the real signed-in browser.

**How to apply:** Preserve this ordering for Vibe Atlas, Grid Builder, and MemeForge collection work. Keep product scopes separate at the view layer, and never clear, replace, or hide local records merely because remote account state is unavailable.