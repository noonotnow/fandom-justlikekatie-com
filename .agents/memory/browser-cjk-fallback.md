---
name: Browser CJK fallback
description: Distinguish missing Chinese system fonts in Nix Chromium from actual production content defects.
---

Check the verification browser's native CJK font availability before attributing Chinese tofu boxes to the app. A text-content assertion cannot certify visible glyph ink.

**Why:** Chinese names were intact in live HTML but appeared as boxes in Nix Chromium. Font scanning could read the existing licensed WOFF2 asset, yet copying it into user fonts and refreshing the cache did not provide a Chinese system fallback. A browser-loaded face rendered the names correctly.

**How to apply:** Inspect actual glyphs after scroll-reveal animations finish. If native CJK fonts are absent, an existing first-party licensed face can provide a verification-only fallback without changing production. Clearly disclose that override and do not claim native Safari/Firefox coverage from it. Investigate a source-font change separately if real target devices also fail.

A page relying only on native fallback cannot guarantee Chinese readability
for fontless readers. Treat missing native fonts as an environment limitation,
not proof that the page is universally readable or universally broken.

**Why:** A controlled native-font comparison rendered the unchanged guide;
the same source produced boxes without that font. Firefox uses code-point
hexboxes, which do not match a single generic missing-glyph raster.

**How to apply:** Compare each Chinese raster against its own no-font baseline
and inspect screenshots. A temporary native font can be visible to fontconfig
but inaccessible to Firefox's content sandbox; distinguish that harness
limitation from a website defect. Never weaken app/browser security to ship
a font fix, and label viewport tests separately from physical-device checks.